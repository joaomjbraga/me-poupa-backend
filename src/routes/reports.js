import express from 'express';
import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

function getFamilyFilter(userId, familyId, params, idx) {
  if (!familyId) {
    return { filter: 't.user_id = $1', params: [userId], idx: 2 };
  }
  return { filter: '(t.user_id = $1 OR t.family_id = $2)', params: [userId, familyId], idx: 3 };
}

router.get('/pdf', async (req, res) => {
  const { month, year, date_from, date_to } = req.query;

  try {
    const userResult = await query('SELECT family_id FROM users WHERE id = $1', [req.userId]);
    const familyId = userResult.rows[0]?.family_id;
    const familyFilter = getFamilyFilter(req.userId, familyId, [], 0);

    let periodLabel = '';
    let params = [...familyFilter.params];
    let idx = familyFilter.idx;

    let summaryWhere = familyFilter.filter;
    let categoryWhere = familyFilter.filter;
    let transactionsWhere = familyFilter.filter;

    if (date_from && date_to) {
      summaryWhere += ` AND t.date >= $${idx} AND t.date <= $${idx + 1}`;
      categoryWhere += ` AND t.date >= $${idx} AND t.date <= $${idx + 1}`;
      transactionsWhere += ` AND t.date >= $${idx} AND t.date <= $${idx + 1}`;
      params.push(date_from, date_to);
      periodLabel = `${date_from} a ${date_to}`;
      idx += 2;
    } else {
      const m = month || new Date().getMonth() + 1;
      const y = year || new Date().getFullYear();
      summaryWhere += ` AND EXTRACT(MONTH FROM t.date) = $${idx} AND EXTRACT(YEAR FROM t.date) = $${idx + 1}`;
      categoryWhere += ` AND EXTRACT(MONTH FROM t.date) = $${idx} AND EXTRACT(YEAR FROM t.date) = $${idx + 1}`;
      transactionsWhere += ` AND EXTRACT(MONTH FROM t.date) = $${idx} AND EXTRACT(YEAR FROM t.date) = $${idx + 1}`;
      params.push(m, y);
      periodLabel = `${m.toString().padStart(2, '0')}/${y}`;
      idx += 2;
    }

    const summaryResult = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
      FROM transactions t
      WHERE ${summaryWhere}
    `, params);

    const byCategoryResult = await query(`
      SELECT c.name, c.color,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE ${categoryWhere}
      GROUP BY c.id, c.name, c.color
      ORDER BY total_expense DESC
    `, params);

    const transactionsResult = await query(`
      SELECT t.date, t.description, t.type, t.amount, c.name as category_name, u.name as user_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE ${transactionsWhere}
      ORDER BY t.date DESC
    `, params);

    const totalIncome = parseFloat(summaryResult.rows[0]?.total_income || 0);
    const totalExpense = parseFloat(summaryResult.rows[0]?.total_expense || 0);
    const balance = totalIncome - totalExpense;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=extrato-me-poupa-${periodLabel.replace(/\//g, '-')}.pdf`);

    doc.pipe(res);

    const green = '#16a34a';
    const red = '#dc2626';
    const gray = '#6b7280';
    const dark = '#1f2937';
    const lightGray = '#f3f4f6';

    doc.rect(0, 0, doc.page.width, 80).fill(green);
    doc.fillColor('white').fontSize(24).font('Helvetica-Bold').text('ME POUPA', 50, 20);
    doc.fontSize(11).font('Helvetica').text('Controle Financeiro Familiar', 50, 48);
    doc.fontSize(12).text(`Extrato do Periodo: ${periodLabel}`, 50, 62);

    doc.moveDown(3);

    doc.fillColor(dark).fontSize(12).font('Helvetica-Bold').text('RESUMO FINANCEIRO');
    doc.moveDown(0.5);

    const colWidth = 155;
    const colGap = 10;
    const startX = 50;

    const box1X = startX;
    const box2X = startX + colWidth + colGap;
    const box3X = startX + (colWidth + colGap) * 2;
    const boxY = doc.y;
    const boxHeight = 55;

    doc.rect(box1X, boxY, colWidth, boxHeight).fill(lightGray);
    doc.rect(box2X, boxY, colWidth, boxHeight).fill(lightGray);
    doc.rect(box3X, boxY, colWidth, boxHeight).fill(lightGray);

    doc.fillColor(gray).fontSize(9).font('Helvetica').text('ENTRADAS', box1X + 10, boxY + 10);
    doc.fillColor(green).fontSize(16).font('Helvetica-Bold').text(`R$ ${totalIncome.toFixed(2).replace('.', ',')}`, box1X + 10, boxY + 25);

    doc.fillColor(gray).fontSize(9).font('Helvetica').text('SAIDAS', box2X + 10, boxY + 10);
    doc.fillColor(red).fontSize(16).font('Helvetica-Bold').text(`R$ ${totalExpense.toFixed(2).replace('.', ',')}`, box2X + 10, boxY + 25);

    const balanceColor = balance >= 0 ? green : red;
    const balanceLabel = balance >= 0 ? 'RESTANTE' : 'FALTA';
    doc.fillColor(gray).fontSize(9).font('Helvetica').text(balanceLabel, box3X + 10, boxY + 10);
    doc.fillColor(balanceColor).fontSize(16).font('Helvetica-Bold').text(`R$ ${Math.abs(balance).toFixed(2).replace('.', ',')}`, box3X + 10, boxY + 25);

    doc.y = boxY + boxHeight + 20;

    const expenseCategories = byCategoryResult.rows.filter(r => parseFloat(r.total_expense) > 0);
    if (expenseCategories.length > 0) {
      doc.fillColor(dark).fontSize(12).font('Helvetica-Bold').text('GASTOS POR CATEGORIA');
      doc.moveDown(0.5);

      const headerY = doc.y;
      doc.rect(50, headerY, doc.page.width - 100, 22).fill(green);
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      doc.text('Categoria', 60, headerY + 6);
      doc.text('Valor', 380, headerY + 6);
      doc.text('%', 490, headerY + 6);

      doc.y = headerY + 22;

      expenseCategories.forEach((cat, i) => {
        const expense = parseFloat(cat.total_expense).toFixed(2).replace('.', ',');
        const pct = totalExpense > 0 ? ((parseFloat(cat.total_expense) / totalExpense) * 100).toFixed(1) : '0,0';

        const rowY = doc.y;
        doc.rect(50, rowY, doc.page.width - 100, 20).fill(i % 2 === 0 ? 'white' : lightGray);

        doc.fillColor(dark).fontSize(10).font('Helvetica').text(cat.name, 60, rowY + 5);
        doc.fillColor(red).fontSize(10).font('Helvetica-Bold').text(`R$ ${expense}`, 380, rowY + 5);
        doc.fillColor(gray).fontSize(10).text(`${pct}%`, 490, rowY + 5);

        doc.y = rowY + 20;
      });
    }

    doc.moveDown(1);

    if (transactionsResult.rows.length > 0) {
      doc.fillColor(dark).fontSize(12).font('Helvetica-Bold').text('TRANSACOES');
      doc.moveDown(0.5);

      const headerY = doc.y;
      doc.rect(50, headerY, doc.page.width - 100, 22).fill(green);
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
      doc.text('Data', 60, headerY + 6);
      doc.text('Descricao', 120, headerY + 6);
      doc.text('Categoria', 320, headerY + 6);
      doc.text('Valor', 490, headerY + 6);

      doc.y = headerY + 22;

      transactionsResult.rows.forEach((tx, i) => {
        if (doc.y > doc.page.height - 50) {
          doc.addPage();
          doc.rect(50, 40, doc.page.width - 100, 22).fill(green);
          doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
          doc.text('Data', 60, 48);
          doc.text('Descricao', 120, 48);
          doc.text('Categoria', 320, 48);
          doc.text('Valor', 490, 48);
          doc.y = 62;
        }

        const rowY = doc.y;
        doc.rect(50, rowY, doc.page.width - 100, 18).fill(i % 2 === 0 ? 'white' : lightGray);

        const date = new Date(tx.date).toLocaleDateString('pt-BR');
        const amount = parseFloat(tx.amount).toFixed(2).replace('.', ',');
        const color = tx.type === 'income' ? green : red;
        const prefix = tx.type === 'income' ? '+' : '-';

        doc.fillColor(gray).fontSize(9).font('Helvetica').text(date, 60, rowY + 4);
        doc.fillColor(dark).text(tx.description.substring(0, 35), 120, rowY + 4);
        doc.fillColor(gray).text(tx.category_name || 'Sem categoria', 320, rowY + 4);
        doc.fillColor(color).font('Helvetica-Bold').text(`${prefix} R$ ${amount}`, 490, rowY + 4);
        doc.font('Helvetica');

        doc.y = rowY + 18;
      });
    } else {
      doc.fillColor(gray).fontSize(10).text('Nenhuma transacao registrada no periodo.', { align: 'center' });
    }

    doc.moveDown(2);
    doc.fillColor(gray).fontSize(8).text(
      `Documento gerado em ${new Date().toLocaleString('pt-BR')} | Me Poupa`,
      { align: 'center' }
    );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar relatorio PDF' });
  }
});

export default router;

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
      periodLabel = `${m}/${y}`;
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
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE ${categoryWhere}
      GROUP BY c.id, c.name, c.color
      ORDER BY total_expense DESC
    `, params);

    const transactionsResult = await query(`
      SELECT t.date, t.description, t.type, t.amount, c.name as category_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE ${transactionsWhere}
      ORDER BY t.date DESC
    `, params);

    const totalIncome = parseFloat(summaryResult.rows[0]?.total_income || 0);
    const totalExpense = parseFloat(summaryResult.rows[0]?.total_expense || 0);
    const balance = totalIncome - totalExpense;

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio-${periodLabel.replace(/\//g, '-')}.pdf`);

    doc.pipe(res);

    doc.fontSize(20).text('Me Poupa', { align: 'center' });
    doc.fontSize(14).text(`Relatório de Gastos - ${periodLabel}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(16).text('Resumo', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Total de Receitas: R$ ${totalIncome.toFixed(2).replace('.', ',')}`);
    doc.text(`Total de Despesas: R$ ${totalExpense.toFixed(2).replace('.', ',')}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text(`Sobra: R$ ${balance.toFixed(2).replace('.', ',')}`, {
      color: balance >= 0 ? '#228B22' : '#DC143C'
    });
    doc.font('Helvetica');
    doc.moveDown(2);

    doc.fontSize(16).text('Despesas por Categoria', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);

    const catData = byCategoryResult.rows.filter(r => parseFloat(r.total_expense) > 0);
    if (catData.length > 0) {
      catData.forEach(cat => {
        const expense = parseFloat(cat.total_expense).toFixed(2).replace('.', ',');
        const pct = totalExpense > 0 ? ((parseFloat(cat.total_expense) / totalExpense) * 100).toFixed(1) : 0;
        doc.text(`• ${cat.name}: R$ ${expense} (${pct}%)`);
      });
    } else {
      doc.text('Nenhuma despesa registrada no período.');
    }

    doc.moveDown(2);

    doc.fontSize(16).text('Histórico de Transações', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);

    if (transactionsResult.rows.length > 0) {
      transactionsResult.rows.forEach(tx => {
        const date = new Date(tx.date).toLocaleDateString('pt-BR');
        const amount = parseFloat(tx.amount).toFixed(2).replace('.', ',');
        const type = tx.type === 'income' ? '+' : '-';
        const color = tx.type === 'income' ? '#228B22' : '#DC143C';
        doc.fillColor(color).text(
          `${date} | ${tx.description.substring(0, 30)} | ${tx.category_name || 'Sem categoria'} | ${type} R$ ${amount}`,
          { continued: false }
        );
        doc.fillColor('black');
      });
    } else {
      doc.text('Nenhuma transação registrada no período.');
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#666').text(
      `Gerado em ${new Date().toLocaleString('pt-BR')}`,
      { align: 'center' }
    );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar relatório PDF' });
  }
});

export default router;

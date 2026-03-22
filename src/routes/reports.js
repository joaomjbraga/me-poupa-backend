import express from 'express';
import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

const fmt = (value) =>
  'R$ ' + parseFloat(value || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const fmtDate = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const C = {
  green:      '#16a34a',
  greenLight: '#dcfce7',
  red:        '#dc2626',
  redLight:   '#fee2e2',
  gray:       '#6b7280',
  grayLight:  '#9ca3af',
  line:       '#e5e7eb',
  bg:         '#f9fafb',
  white:      '#ffffff',
  ink:        '#1f2937',
};

function hLine(doc, y, x1 = 50, x2, color = C.line, lw = 0.5) {
  doc.moveTo(x1, y).lineTo(x2 ?? doc.page.width - 50, y)
     .lineWidth(lw).strokeColor(color).stroke();
}

function sectionHeader(doc, title, y) {
  const W = doc.page.width;
  doc.rect(50, y, W - 100, 22).fill(C.green);
  doc.fillColor(C.white).fontSize(8.5).font('Helvetica-Bold')
     .text(title.toUpperCase(), 60, y + 6.5,
       { characterSpacing: 0.8, lineBreak: false });
  return y + 22;
}

router.get('/pdf', async (req, res) => {
  const { month, year, date_from, date_to } = req.query;

  try {
    const userResult = await query(
      'SELECT name, email, family_id FROM users WHERE id = $1',
      [req.userId]
    );
    const { name: userName, email: userEmail, family_id: familyId } = userResult.rows[0] ?? {};

    let baseParams = [req.userId];
    let baseFilter = 't.user_id = $1';
    if (familyId) {
      baseParams = [req.userId, familyId];
      baseFilter = '(t.user_id = $1 OR t.family_id = $2)';
    }

    let periodLabel = '';
    let dateParams  = [...baseParams];
    let dateFilter  = baseFilter;
    const idx       = baseParams.length + 1;

    if (date_from && date_to) {
      dateFilter += ` AND t.date BETWEEN $${idx} AND $${idx + 1}`;
      dateParams.push(date_from, date_to);
      periodLabel = `${fmtDate(date_from)} a ${fmtDate(date_to)}`;
    } else {
      const m = parseInt(month) || new Date().getMonth() + 1;
      const y = parseInt(year)  || new Date().getFullYear();
      dateFilter += ` AND EXTRACT(MONTH FROM t.date) = $${idx} AND EXTRACT(YEAR FROM t.date) = $${idx + 1}`;
      dateParams.push(m, y);
      const mNames = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      periodLabel = `${mNames[m - 1]} de ${y}`;
    }

    const [summaryRes, categoryRes, transactionsRes] = await Promise.all([
      query(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
          COUNT(*) AS total_tx
        FROM transactions t WHERE ${dateFilter}
      `, dateParams),

      query(`
        SELECT c.name,
          COALESCE(SUM(t.amount), 0) AS total
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE ${dateFilter} AND t.type = 'expense'
        GROUP BY c.id, c.name
        HAVING SUM(t.amount) > 0
        ORDER BY total DESC
      `, dateParams),

      query(`
        SELECT t.date, t.description, t.type, t.amount,
               c.name AS category_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE ${dateFilter}
        ORDER BY t.date DESC, t.created_at DESC
      `, dateParams),
    ]);

    const totalIncome  = parseFloat(summaryRes.rows[0]?.total_income  || 0);
    const totalExpense = parseFloat(summaryRes.rows[0]?.total_expense || 0);
    const totalTx      = parseInt(summaryRes.rows[0]?.total_tx        || 0);
    const balance      = totalIncome - totalExpense;

    const doc = new PDFDocument({
      margin: 0, size: 'A4', bufferPages: true,
      info: { Title: `Extrato Me Poupa - ${periodLabel}`, Author: 'Me Poupa' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=extrato-me-poupa-${periodLabel.replace(/[\s\/]/g, '-').toLowerCase()}.pdf`
    );
    doc.pipe(res);

    const W   = doc.page.width;
    const ML  = 50;
    const MR  = W - 50;
    const CW  = MR - ML;

    const COL = {
      desc:  ML + 10,     descW:  280,
      cat:   ML + 292,    catW:   118,
      amt:   MR - 68,     amtW:   68,
    };

    doc.rect(0, 0, W, 88).fill(C.green);

    doc.fillColor(C.white).fontSize(24).font('Helvetica-Bold')
       .text('Me Poupa', ML, 16, { lineBreak: false });

    doc.fillColor('rgba(255,255,255,0.65)').fontSize(9).font('Helvetica')
       .text('Controle Financeiro Familiar', ML, 44, { lineBreak: false });

    doc.fillColor('rgba(255,255,255,0.65)').fontSize(8).font('Helvetica')
       .text('Titular:', ML, 66, { lineBreak: false });

    doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
       .text(`${userName}   |   ${userEmail}`, ML + 44, 66, { lineBreak: false });

    doc.fillColor('rgba(255,255,255,0.55)').fontSize(7.5).font('Helvetica')
       .text('PERIODO', MR - 160, 18, { width: 110, align: 'right', lineBreak: false });

    doc.fillColor(C.white).fontSize(13).font('Helvetica-Bold')
       .text(periodLabel, MR - 160, 30, { width: 110, align: 'right', lineBreak: false });

    doc.fillColor('rgba(255,255,255,0.55)').fontSize(8).font('Helvetica')
       .text(`${totalTx} movimentacoes`, MR - 160, 50, { width: 110, align: 'right', lineBreak: false });

    let y = 106;

    const boxW    = Math.floor((CW - 16) / 3);
    const boxH    = 58;
    const boxDefs = [
      { label: 'TOTAL ENTRADAS', value: fmt(totalIncome),  color: C.green, bg: C.greenLight },
      { label: 'TOTAL SAIDAS',    value: fmt(totalExpense), color: C.red,   bg: C.redLight   },
      {
        label: balance >= 0 ? 'RESTANTE' : 'FALTA',
        value: fmt(Math.abs(balance)),
        color: balance >= 0 ? C.green : C.red,
        bg:    balance >= 0 ? C.greenLight : C.redLight,
      },
    ];

    boxDefs.forEach((b, i) => {
      const bx = ML + i * (boxW + 8);
      doc.rect(bx, y, boxW, boxH).fill(b.bg);
      doc.rect(bx, y, boxW, 3).fill(b.color);
      doc.fillColor(C.gray).fontSize(7.5).font('Helvetica')
         .text(b.label, bx + 10, y + 10,
           { width: boxW - 20, lineBreak: false, characterSpacing: 0.4 });
      doc.fillColor(b.color).fontSize(15).font('Helvetica-Bold')
         .text(b.value, bx + 10, y + 24, { width: boxW - 20, lineBreak: false });
    });

    y += boxH + 18;

    const expCats = categoryRes.rows;
    if (expCats.length > 0) {
      y = sectionHeader(doc, 'Gastos por Categoria', y);
      y += 4;

      const nameW  = 160;
      const pctW   = 34;
      const valW   = 72;
      const barX   = ML + nameW + 12;
      const barW   = CW - nameW - pctW - valW - 30;
      const maxVal = parseFloat(expCats[0]?.total || 1);

      expCats.forEach((cat, i) => {
        const val   = parseFloat(cat.total);
        const pct   = totalExpense > 0 ? (val / totalExpense) * 100 : 0;
        const fill  = Math.max((val / maxVal) * barW, 2);
        const rowBg = i % 2 === 0 ? C.white : C.bg;

        doc.rect(ML, y, CW, 20).fill(rowBg);

        doc.fillColor(C.ink).fontSize(8.5).font('Helvetica')
           .text(cat.name, ML + 10, y + 5.5, { width: nameW - 10, lineBreak: false });

        doc.rect(barX, y + 7.5, barW, 5).fill(C.line);
        doc.rect(barX, y + 7.5, fill, 5).fill(C.green);

        doc.fillColor(C.gray).fontSize(7.5).font('Helvetica')
           .text(`${pct.toFixed(1)}%`, barX + barW + 4, y + 5.5,
             { width: pctW, align: 'right', lineBreak: false });

        doc.fillColor(C.red).fontSize(8.5).font('Helvetica-Bold')
           .text(fmt(val), MR - valW, y + 5.5,
             { width: valW, align: 'right', lineBreak: false });

        y += 20;
      });

      y += 10;
    }

    const rows = transactionsRes.rows;

    const renderTxHeader = (yh) => {
      doc.rect(ML, yh, CW, 20).fill(C.ink);
      [
        { text: 'Descricao', x: COL.desc, w: COL.descW },
        { text: 'Categoria', x: COL.cat,  w: COL.catW  },
        { text: 'Valor',     x: COL.amt,  w: COL.amtW, align: 'right' },
      ].forEach(c =>
        doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold')
           .text(c.text, c.x, yh + 6, {
             width: c.w, align: c.align ?? 'left',
             lineBreak: false, characterSpacing: 0.3,
           })
      );
      return yh + 20;
    };

    if (rows.length > 0) {
      y = sectionHeader(doc, 'Movimentacoes', y);
      y = renderTxHeader(y);

      rows.forEach((tx, i) => {
        if (y + 18 > doc.page.height - 50) {
          doc.addPage();
          y = 40;
          doc.fillColor(C.gray).fontSize(7.5).font('Helvetica')
             .text(`Extrato ${periodLabel} - continuacao`, ML, 24,
               { width: CW, align: 'center', lineBreak: false });
          hLine(doc, 36);
          y = renderTxHeader(y);
        }

        const rowBg    = i % 2 === 0 ? C.white : C.bg;
        const isIncome = tx.type === 'income';
        const amtColor = isIncome ? C.green : C.red;
        const prefix   = isIncome ? '+ ' : '- ';

        doc.rect(ML, y, CW, 18).fill(rowBg);

        doc.fillColor(C.ink).fontSize(8).font('Helvetica')
           .text((tx.description || '').substring(0, 45), COL.desc, y + 5,
             { width: COL.descW, lineBreak: false });

        doc.fillColor(C.gray).fontSize(7.5).font('Helvetica')
           .text(tx.category_name || '-', COL.cat, y + 5,
             { width: COL.catW, lineBreak: false });

        doc.fillColor(amtColor).fontSize(8.5).font('Helvetica-Bold')
           .text(prefix + fmt(tx.amount), COL.amt, y + 4.5,
             { width: COL.amtW, align: 'right', lineBreak: false });

        y += 18;
      });

      y += 4;
      hLine(doc, y, ML, MR, C.ink, 0.7);
      y += 4;

      doc.rect(ML, y, CW, 30).fill(C.bg);

      doc.fillColor(C.ink).fontSize(8.5).font('Helvetica-Bold')
         .text('Total do Periodo', ML + 10, y + 10, { lineBreak: false });

      doc.fillColor(C.green).fontSize(8.5).font('Helvetica-Bold')
         .text(`Entradas: ${fmt(totalIncome)}`, ML + 160, y + 5,
           { width: 150, align: 'right', lineBreak: false });

      doc.fillColor(C.red).fontSize(8.5).font('Helvetica-Bold')
         .text(`Saidas: ${fmt(totalExpense)}`, ML + 160, y + 18,
           { width: 150, align: 'right', lineBreak: false });

      doc.fillColor(balance >= 0 ? C.green : C.red).fontSize(10).font('Helvetica-Bold')
         .text(`Restante: ${fmt(balance)}`, MR - 110, y + 10,
           { width: 110, align: 'right', lineBreak: false });

      y += 30;
    } else {
      y += 8;
      doc.fillColor(C.gray).fontSize(10).font('Helvetica')
         .text('Nenhuma movimentacao registrada no periodo.', ML, y,
           { width: CW, align: 'center' });
      y += 20;
    }

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      const footerY = doc.page.height - 30;
      hLine(doc, footerY - 8, ML, MR, C.line, 0.4);
      doc.fillColor(C.grayLight).fontSize(7).font('Helvetica')
         .text(
           `Me Poupa  -  Gerado em ${new Date().toLocaleString('pt-BR')}  -  Pagina ${i + 1} de ${pages.count}`,
           ML, footerY, { width: CW, align: 'center', lineBreak: false }
         );
    }

    doc.end();

  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao gerar relatorio PDF' });
    }
  }
});

export default router;

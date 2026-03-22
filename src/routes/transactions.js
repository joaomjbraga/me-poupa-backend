import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { emitFinanceUpdate, emitFamilyUpdate } from '../utils/socketHelpers.js';

const router = express.Router();
router.use(authenticate);

function getFamilyFilter(userId, familyId, params, idx) {
  if (!familyId) {
    return { filter: 't.user_id = $1', params: [userId], idx: 2 };
  }
  return { filter: '(t.user_id = $1 OR t.family_id = $2)', params: [userId, familyId], idx: 3 };
}

router.get('/', async (req, res) => {
  const { month, year, type, category_id, account_id, date_from, date_to, limit = 50, offset = 0 } = req.query;

  try {
    const userResult = await query('SELECT family_id FROM users WHERE id = $1', [req.userId]);
    const familyId = userResult.rows[0]?.family_id;
    const familyFilter = getFamilyFilter(req.userId, familyId, [], 0);

    let sql = `
      SELECT t.*, 
        c.name as category_name, c.icon as category_icon, c.color as category_color,
        a.name as account_name, a.icon as account_icon,
        u.name as user_name, u.avatar_color as user_color
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE ${familyFilter.filter}
    `;
    const params = [...familyFilter.params];
    let idx = familyFilter.idx;

    if (date_from) {
      sql += ` AND t.date >= $${idx++}`;
      params.push(date_from);
    }
    if (date_to) {
      sql += ` AND t.date <= $${idx++}`;
      params.push(date_to);
    }
    if (!date_from && !date_to && month && year) {
      sql += ` AND EXTRACT(MONTH FROM t.date) = $${idx++} AND EXTRACT(YEAR FROM t.date) = $${idx++}`;
      params.push(month, year);
    }
    if (type) { sql += ` AND t.type = $${idx++}`; params.push(type); }
    if (category_id) { sql += ` AND t.category_id = $${idx++}`; params.push(category_id); }
    if (account_id) { sql += ` AND t.account_id = $${idx++}`; params.push(account_id); }

    sql += ` ORDER BY t.date DESC, t.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar transações' });
  }
});

router.get('/summary', async (req, res) => {
  const { month, year, date_from, date_to } = req.query;

  try {
    const userResult = await query('SELECT family_id FROM users WHERE id = $1', [req.userId]);
    const familyId = userResult.rows[0]?.family_id;
    const familyFilter = getFamilyFilter(req.userId, familyId, [], 0);

    let sql = `
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance
      FROM transactions t
      WHERE ${familyFilter.filter.replace('t.', '')}
    `;
    let categorySql = `
      SELECT c.name, c.icon, c.color, t.type,
        SUM(t.amount) as total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE ${familyFilter.filter}
    `;
    const params = [...familyFilter.params];
    let idx = familyFilter.idx;

    if (date_from) {
      sql += ` AND date >= $${idx}`;
      categorySql += ` AND t.date >= $${idx}`;
      params.push(date_from);
      idx++;
    }
    if (date_to) {
      sql += ` AND date <= $${idx}`;
      categorySql += ` AND t.date <= $${idx}`;
      params.push(date_to);
      idx++;
    }
    if (!date_from && !date_to && month && year) {
      sql += ` AND EXTRACT(MONTH FROM date) = $${idx++} AND EXTRACT(YEAR FROM date) = $${idx++}`;
      categorySql += ` AND EXTRACT(MONTH FROM t.date) = $${idx - 2} AND EXTRACT(YEAR FROM t.date) = $${idx - 1}`;
      params.push(month, year);
    }

    const result = await query(sql, params);
    categorySql += ' GROUP BY c.id, c.name, c.icon, c.color, t.type ORDER BY total DESC';
    const byCategory = await query(categorySql, params);

    res.json({
      summary: result.rows[0],
      by_category: byCategory.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar resumo' });
  }
});

router.get('/history', async (req, res) => {
  const { months = 6 } = req.query;
  const n = parseInt(months) || 6;

  try {
    const userResult = await query('SELECT family_id FROM users WHERE id = $1', [req.userId]);
    const familyId = userResult.rows[0]?.family_id;
    const familyFilter = getFamilyFilter(req.userId, familyId, [], 0);

    const result = await query(`
      SELECT 
        EXTRACT(YEAR FROM date) as year,
        EXTRACT(MONTH FROM date) as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
      FROM transactions t
      WHERE ${familyFilter.filter}
        AND date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '${n - 1} months'
      GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
      ORDER BY year, month
    `, familyFilter.params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

router.get('/export', async (req, res) => {
  const { month, year, date_from, date_to } = req.query;
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();

  try {
    const userResult = await query('SELECT family_id FROM users WHERE id = $1', [req.userId]);
    const familyId = userResult.rows[0]?.family_id;
    const familyFilter = getFamilyFilter(req.userId, familyId, [], 0);

    let sql = `
      SELECT 
        t.date,
        t.description,
        t.type,
        COALESCE(c.name, 'Sem categoria') as category_name,
        COALESCE(a.name, 'Sem conta') as account_name,
        t.amount,
        u.name as user_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE ${familyFilter.filter}
    `;
    const params = [...familyFilter.params];
    let idx = familyFilter.idx;

    if (date_from) {
      sql += ` AND t.date >= $${idx++}`;
      params.push(date_from);
    }
    if (date_to) {
      sql += ` AND t.date <= $${idx++}`;
      params.push(date_to);
    }
    if (!date_from && !date_to) {
      sql += ` AND EXTRACT(MONTH FROM t.date) = $${idx++} AND EXTRACT(YEAR FROM t.date) = $${idx++}`;
      params.push(m, y);
    }

    sql += ' ORDER BY t.date DESC';

    const result = await query(sql, params);

    const headers = 'Data,Descrição,Tipo,Categoria,Conta,Valor,Usuário\n';
    const rows = result.rows.map(t => 
      `"${t.date}","${t.description}","${t.type}","${t.category_name}","${t.account_name}","${t.amount}","${t.user_name || ''}"`
    ).join('\n');

    const filename = date_from && date_to ? `transacoes-${date_from}-${date_to}` : `transacoes-${m}-${y}`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
    res.send(headers + rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao exportar transações' });
  }
});

router.post('/', validateBody(async (schema) => schema), async (req, res) => {
  const { account_id, category_id, type, amount, description, date, notes, is_recurring, recurring_interval } = req.body;

  try {
    const userResult = await query('SELECT name, family_id FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id;

    const result = await query(`
      INSERT INTO transactions (user_id, family_id, account_id, category_id, type, amount, description, date, notes, is_recurring, recurring_interval)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [req.userId, familyId, account_id || null, category_id || null, type, amount, description, date, notes || null, is_recurring || false, recurring_interval || null]);

    if (account_id && type !== 'transfer') {
      const balanceChange = type === 'income' ? amount : -amount;
      await query(
        'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
        [balanceChange, account_id]
      );
    }

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');

    emitFinanceUpdate(io, userSockets, familyId, req.userId, {
      type: 'transaction_created',
      transaction: result.rows[0],
      userName: user.name
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

router.put('/:id', validateBody(async (schema) => schema), async (req, res) => {
  const { account_id, category_id, type, amount, description, date, notes } = req.body;

  try {
    const userResult = await query('SELECT name, family_id FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id;

    const original = await query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (original.rows.length === 0) return res.status(404).json({ error: 'Transação não encontrada' });

    const orig = original.rows[0];

    if (orig.account_id && orig.type !== 'transfer') {
      const reversal = orig.type === 'income' ? -orig.amount : orig.amount;
      await query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [reversal, orig.account_id]);
    }

    const result = await query(`
      UPDATE transactions SET account_id=$1, category_id=$2, type=$3, amount=$4, description=$5, date=$6, notes=$7
      WHERE id=$8 AND user_id=$9 RETURNING *
    `, [account_id || null, category_id || null, type, amount, description, date, notes || null, req.params.id, req.userId]);

    if (account_id && type !== 'transfer') {
      const balanceChange = type === 'income' ? amount : -amount;
      await query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [balanceChange, account_id]);
    }

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');

    emitFinanceUpdate(io, userSockets, familyId, req.userId, {
      type: 'transaction_updated',
      transaction: result.rows[0],
      userName: user.name
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar transação' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userResult = await query('SELECT name, family_id FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id;

    const orig = await query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (orig.rows.length === 0) return res.status(404).json({ error: 'Transação não encontrada' });

    const t = orig.rows[0];
    if (t.account_id && t.type !== 'transfer') {
      const reversal = t.type === 'income' ? -t.amount : t.amount;
      await query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [reversal, t.account_id]);
    }

    await query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');

    emitFinanceUpdate(io, userSockets, familyId, req.userId, {
      type: 'transaction_deleted',
      transaction: t,
      userName: user.name
    });

    res.json({ message: 'Transação removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover transação' });
  }
});

export default router;

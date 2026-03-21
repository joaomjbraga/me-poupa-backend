import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// GET /api/transactions
router.get('/', async (req, res) => {
  const { month, year, type, category_id, account_id, limit = 50, offset = 0 } = req.query;

  let sql = `
    SELECT t.*, 
      c.name as category_name, c.icon as category_icon, c.color as category_color,
      a.name as account_name, a.icon as account_icon
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = $1
  `;
  const params = [req.userId];
  let idx = 2;

  if (month && year) {
    sql += ` AND EXTRACT(MONTH FROM t.date) = $${idx++} AND EXTRACT(YEAR FROM t.date) = $${idx++}`;
    params.push(month, year);
  }
  if (type) { sql += ` AND t.type = $${idx++}`; params.push(type); }
  if (category_id) { sql += ` AND t.category_id = $${idx++}`; params.push(category_id); }
  if (account_id) { sql += ` AND t.account_id = $${idx++}`; params.push(account_id); }

  sql += ` ORDER BY t.date DESC, t.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  try {
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar transações' });
  }
});

// GET /api/transactions/summary
router.get('/summary', async (req, res) => {
  const { month, year } = req.query;
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();

  try {
    const result = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance
      FROM transactions
      WHERE user_id = $1
        AND EXTRACT(MONTH FROM date) = $2
        AND EXTRACT(YEAR FROM date) = $3
    `, [req.userId, m, y]);

    const byCategory = await query(`
      SELECT c.name, c.icon, c.color, t.type,
        SUM(t.amount) as total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
        AND EXTRACT(MONTH FROM t.date) = $2
        AND EXTRACT(YEAR FROM t.date) = $3
      GROUP BY c.id, c.name, c.icon, c.color, t.type
      ORDER BY total DESC
    `, [req.userId, m, y]);

    res.json({
      summary: result.rows[0],
      by_category: byCategory.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar resumo' });
  }
});

// POST /api/transactions
router.post('/', async (req, res) => {
  const { account_id, category_id, type, amount, description, date, notes, is_recurring, recurring_interval } = req.body;

  if (!type || !amount || !description || !date) {
    return res.status(400).json({ error: 'Tipo, valor, descrição e data são obrigatórios' });
  }

  try {
    const result = await query(`
      INSERT INTO transactions (user_id, account_id, category_id, type, amount, description, date, notes, is_recurring, recurring_interval)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [req.userId, account_id || null, category_id || null, type, amount, description, date, notes || null, is_recurring || false, recurring_interval || null]);

    // Update account balance
    if (account_id) {
      const balanceChange = type === 'income' ? amount : -amount;
      await query(
        'UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND user_id = $3',
        [balanceChange, account_id, req.userId]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  const { account_id, category_id, type, amount, description, date, notes } = req.body;

  try {
    // Get original to reverse balance
    const original = await query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (original.rows.length === 0) return res.status(404).json({ error: 'Transação não encontrada' });

    const orig = original.rows[0];

    // Reverse old balance effect
    if (orig.account_id) {
      const reversal = orig.type === 'income' ? -orig.amount : orig.amount;
      await query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [reversal, orig.account_id]);
    }

    const result = await query(`
      UPDATE transactions SET account_id=$1, category_id=$2, type=$3, amount=$4, description=$5, date=$6, notes=$7
      WHERE id=$8 AND user_id=$9 RETURNING *
    `, [account_id || null, category_id || null, type, amount, description, date, notes || null, req.params.id, req.userId]);

    // Apply new balance effect
    if (account_id) {
      const balanceChange = type === 'income' ? amount : -amount;
      await query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [balanceChange, account_id]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar transação' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  try {
    const orig = await query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (orig.rows.length === 0) return res.status(404).json({ error: 'Transação não encontrada' });

    const t = orig.rows[0];
    if (t.account_id) {
      const reversal = t.type === 'income' ? -t.amount : t.amount;
      await query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [reversal, t.account_id]);
    }

    await query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ message: 'Transação removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover transação' });
  }
});

export default router;

import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

// ── ACCOUNTS ──────────────────────────────────────────────
export const accountsRouter = express.Router();
accountsRouter.use(authenticate);

accountsRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at ASC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar contas' });
  }
});

accountsRouter.post('/', async (req, res) => {
  const { name, type, balance, color, icon } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
  try {
    const result = await query(
      'INSERT INTO accounts (user_id, name, type, balance, color, icon) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.userId, name, type, balance || 0, color || '#6366f1', icon || '🏦']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

accountsRouter.put('/:id', async (req, res) => {
  const { name, type, balance, color, icon } = req.body;
  try {
    const result = await query(
      'UPDATE accounts SET name=$1, type=$2, balance=$3, color=$4, icon=$5 WHERE id=$6 AND user_id=$7 RETURNING *',
      [name, type, balance, color, icon, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar conta' });
  }
});

accountsRouter.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ message: 'Conta removida' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover conta' });
  }
});

// ── CATEGORIES ────────────────────────────────────────────
export const categoriesRouter = express.Router();
categoriesRouter.use(authenticate);

categoriesRouter.get('/', async (req, res) => {
  const { type } = req.query;
  let sql = 'SELECT * FROM categories WHERE user_id = $1';
  const params = [req.userId];
  if (type) { sql += ' AND type = $2'; params.push(type); }
  sql += ' ORDER BY type, name';
  try {
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

categoriesRouter.post('/', async (req, res) => {
  const { name, icon, color, type } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
  try {
    const result = await query(
      'INSERT INTO categories (user_id, name, icon, color, type) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.userId, name, icon || '📦', color || '#6366f1', type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

categoriesRouter.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ message: 'Categoria removida' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover categoria' });
  }
});

// ── BUDGETS ───────────────────────────────────────────────
export const budgetsRouter = express.Router();
budgetsRouter.use(authenticate);

budgetsRouter.get('/', async (req, res) => {
  const { month, year } = req.query;
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();
  try {
    const result = await query(`
      SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
        COALESCE((
          SELECT SUM(t.amount) FROM transactions t
          WHERE t.category_id = b.category_id AND t.user_id = b.user_id
            AND EXTRACT(MONTH FROM t.date) = b.month AND EXTRACT(YEAR FROM t.date) = b.year
            AND t.type = 'expense'
        ), 0) as spent
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
      ORDER BY c.name
    `, [req.userId, m, y]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar orçamentos' });
  }
});

budgetsRouter.post('/', async (req, res) => {
  const { category_id, amount, month, year } = req.body;
  if (!category_id || !amount || !month || !year) {
    return res.status(400).json({ error: 'Categoria, valor, mês e ano são obrigatórios' });
  }
  try {
    const result = await query(`
      INSERT INTO budgets (user_id, category_id, amount, month, year)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id, category_id, month, year)
      DO UPDATE SET amount = EXCLUDED.amount
      RETURNING *
    `, [req.userId, category_id, amount, month, year]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar orçamento' });
  }
});

budgetsRouter.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM budgets WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ message: 'Orçamento removido' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover orçamento' });
  }
});

// ── GOALS ─────────────────────────────────────────────────
export const goalsRouter = express.Router();
goalsRouter.use(authenticate);

goalsRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM goals WHERE user_id = $1 ORDER BY completed, created_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar metas' });
  }
});

goalsRouter.post('/', async (req, res) => {
  const { name, target_amount, current_amount, deadline, icon, color } = req.body;
  if (!name || !target_amount) return res.status(400).json({ error: 'Nome e valor alvo são obrigatórios' });
  try {
    const result = await query(
      'INSERT INTO goals (user_id, name, target_amount, current_amount, deadline, icon, color) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.userId, name, target_amount, current_amount || 0, deadline || null, icon || '🎯', color || '#6366f1']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar meta' });
  }
});

goalsRouter.put('/:id', async (req, res) => {
  const { name, target_amount, current_amount, deadline, icon, color, completed } = req.body;
  try {
    const result = await query(
      'UPDATE goals SET name=$1, target_amount=$2, current_amount=$3, deadline=$4, icon=$5, color=$6, completed=$7 WHERE id=$8 AND user_id=$9 RETURNING *',
      [name, target_amount, current_amount, deadline, icon, color, completed || false, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Meta não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar meta' });
  }
});

goalsRouter.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM goals WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ message: 'Meta removida' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover meta' });
  }
});

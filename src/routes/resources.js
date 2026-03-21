import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const categorySchema = {
  name: { required: true, type: 'string', minLength: 1, maxLength: 100 },
  type: { required: true, enum: ['income', 'expense'] },
  icon: { type: 'string', maxLength: 50 },
  color: { type: 'string' },
};

export const categoriesRouter = express.Router();
categoriesRouter.use(authenticate);

categoriesRouter.get('/', async (req, res) => {
  const { type } = req.query;
  try {
    const userResult = await query('SELECT family_id FROM users WHERE id = $1', [req.userId]);
    const familyId = userResult.rows[0]?.family_id;

    let sql = 'SELECT * FROM categories WHERE user_id = $1';
    const params = [req.userId];
    if (type) { sql += ' AND type = $2'; params.push(type); }
    sql += ' ORDER BY type, name';
    
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

categoriesRouter.post('/', validateBody(categorySchema), async (req, res) => {
  const { name, icon, color, type } = req.body;
  try {
    const userResult = await query('SELECT family_id FROM users WHERE id = $1', [req.userId]);
    const familyId = userResult.rows[0]?.family_id;

    const result = await query(
      'INSERT INTO categories (user_id, family_id, name, icon, color, type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.userId, familyId, name, icon || '📦', color || '#22c55e', type]
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

export const budgetsRouter = express.Router();
budgetsRouter.use(authenticate);

budgetsRouter.get('/', async (req, res) => {
  const { month, year } = req.query;
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();
  try {
    const userResult = await query('SELECT family_id FROM users WHERE id = $1', [req.userId]);
    const familyId = userResult.rows[0]?.family_id;

    let sql = `
      SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
        COALESCE((
          SELECT SUM(t.amount) FROM transactions t
          WHERE t.category_id = b.category_id
            AND EXTRACT(MONTH FROM t.date) = b.month AND EXTRACT(YEAR FROM t.date) = b.year
            AND t.type = 'expense'
            ${familyId ? 'AND (t.user_id = $1 OR t.family_id = $2)' : 'AND t.user_id = $1'}
        ), 0) as spent
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1 AND b.month = $${familyId ? 3 : 2} AND b.year = $${familyId ? 4 : 3}
      ORDER BY c.name
    `;
    const params = familyId ? [req.userId, familyId, m, y] : [req.userId, m, y];
    const result = await query(sql, params);
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

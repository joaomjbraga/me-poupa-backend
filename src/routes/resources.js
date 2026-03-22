import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { emitFinanceUpdate } from '../utils/socketHelpers.js';

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
    const userResult = await query('SELECT name, family_id FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id;

    const result = await query(
      'INSERT INTO categories (user_id, family_id, name, icon, color, type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.userId, familyId, name, icon || '📦', color || '#22c55e', type]
    );
    
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    
    console.log(`🏷️ Category created by user:${req.userId} in family:${familyId}`);
    
    emitFinanceUpdate(io, userSockets, familyId, req.userId, {
      type: 'category_created',
      category: result.rows[0],
      userName: user.name
    });
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

categoriesRouter.put('/:id', validateBody(categorySchema), async (req, res) => {
  const { name, icon, color, type } = req.body;
  try {
    const userResult = await query('SELECT name, family_id FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id;

    const result = await query(
      'UPDATE categories SET name=$1, icon=$2, color=$3, type=$4 WHERE id=$5 AND user_id=$6 RETURNING *',
      [name, icon || '📦', color || '#22c55e', type, req.params.id, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    
    console.log(`🏷️ Category updated by user:${req.userId} in family:${familyId}`);
    
    emitFinanceUpdate(io, userSockets, familyId, req.userId, {
      type: 'category_updated',
      category: result.rows[0],
      userName: user.name
    });
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

categoriesRouter.delete('/:id', async (req, res) => {
  try {
    const userResult = await query('SELECT name, family_id FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id;
    
    const categoryResult = await query('SELECT * FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    const category = categoryResult.rows[0];

    await query('DELETE FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    
    console.log(`🏷️ Category deleted by user:${req.userId} in family:${familyId}`);
    
    emitFinanceUpdate(io, userSockets, familyId, req.userId, {
      type: 'category_deleted',
      category: category,
      userName: user.name
    });
    
    res.json({ message: 'Categoria removida' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover categoria' });
  }
});

import express from 'express';
import { query } from '../db/pool.js';
import type { DbRow } from '../db/pool.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { emitToFamily } from '../utils/socketHelpers.js';
import type { Server as SocketServer } from 'socket.io';
import type { UserSocketMap } from '../utils/socketHelpers.js';

const categorySchema = {
  name: { required: true, type: 'string' as const, minLength: 1, maxLength: 100 },
  type: { required: true, enum: ['income', 'expense'] as const },
  icon: { type: 'string' as const, maxLength: 50 },
  color: { type: 'string' as const },
};

export const categoriesRouter = express.Router();
categoriesRouter.use(authenticate);

categoriesRouter.get('/', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { type } = req.query as { type?: string };
  try {
    let sql = 'SELECT * FROM categories WHERE user_id = $1';
    const params: string[] = [userId];
    if (type) { sql += ' AND type = $2'; params.push(type); }
    sql += ' ORDER BY type, name';
    
    const result = await query<DbRow>(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

categoriesRouter.post('/', validateBody(categorySchema), async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { name, icon, color, type } = req.body as {
    name: string;
    icon?: string;
    color?: string;
    type: 'income' | 'expense';
  };
  try {
    const userResult = await query<DbRow>('SELECT name, family_id FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id as string | null;

    const result = await query<DbRow>(
      'INSERT INTO categories (user_id, family_id, name, icon, color, type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [userId, familyId, name, icon || '📦', color || '#22c55e', type]
    );
    
    const io = req.app.get('io') as SocketServer;
    const userSockets = req.app.get('userSockets') as UserSocketMap;
    
    console.log(`🏷️ Category created by user:${userId} in family:${familyId}`);
    
    if (familyId) {
      emitToFamily(io, userSockets, familyId, 'finance_update', {
        type: 'category_created',
        category: result.rows[0],
        userName: user.name,
        userId
      });
    }
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

categoriesRouter.put('/:id', validateBody(categorySchema), async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { name, icon, color, type } = req.body as {
    name: string;
    icon?: string;
    color?: string;
    type: 'income' | 'expense';
  };
  try {
    const userResult = await query<DbRow>('SELECT name, family_id FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id as string | null;

    const result = await query<DbRow>(
      'UPDATE categories SET name=$1, icon=$2, color=$3, type=$4 WHERE id=$5 AND user_id=$6 RETURNING *',
      [name, icon || '📦', color || '#22c55e', type, req.params.id, userId]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Categoria não encontrada' });
      return;
    }
    
    const io = req.app.get('io') as SocketServer;
    const userSockets = req.app.get('userSockets') as UserSocketMap;
    
    console.log(`🏷️ Category updated by user:${userId} in family:${familyId}`);
    
    if (familyId) {
      emitToFamily(io, userSockets, familyId, 'finance_update', {
        type: 'category_updated',
        category: result.rows[0],
        userName: user.name,
        userId
      });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

categoriesRouter.delete('/:id', async (req, res) => {
  const userId = (req as unknown as AuthenticatedRequest).userId;
  try {
    const userResult = await query<DbRow>('SELECT name, family_id FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id as string | null;
    
    const categoryResult = await query<DbRow>('SELECT * FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, userId]);
    if (categoryResult.rows.length === 0) {
      res.status(404).json({ error: 'Categoria não encontrada' });
      return;
    }
    const category = categoryResult.rows[0];

    await query('DELETE FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, userId]);
    
    const io = req.app.get('io') as SocketServer;
    const userSockets = req.app.get('userSockets') as UserSocketMap;
    
    console.log(`🏷️ Category deleted by user:${userId} in family:${familyId}`);
    
    if (familyId) {
      emitToFamily(io, userSockets, familyId, 'finance_update', {
        type: 'category_deleted',
        category: category,
        userName: user.name,
        userId
      });
    }
    
    res.json({ message: 'Categoria removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover categoria' });
  }
});

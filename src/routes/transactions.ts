import express from 'express';
import { query } from '../db/pool.js';
import type { DbRow } from '../db/pool.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { emitToFamily } from '../utils/socketHelpers.js';
import type { Server as SocketServer } from 'socket.io';
import type { UserSocketMap } from '../utils/socketHelpers.js';

const router = express.Router();
router.use(authenticate);

const MAX_LIMIT = 1000;
const MAX_HISTORY_MONTHS = 24;

interface FamilyFilter {
  filter: string;
  params: (string | number)[];
}

function getFamilyFilter(userId: string, familyId: string | null | undefined): FamilyFilter {
  if (!familyId) {
    return { filter: 't.user_id = $1', params: [userId] };
  }
  return { filter: '(t.user_id = $1 OR t.family_id = $2)', params: [userId, familyId] };
}

function sanitizeString(str: unknown, maxLength = 255): string | null {
  if (!str) return null;
  return String(str).substring(0, maxLength).trim() || null;
}

router.get('/', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  let { month, year, type, category_id, date_from, date_to, limit, offset } = req.query as Record<string, string | undefined>;

  const monthNum = parseInt(month || '');
  const yearNum = parseInt(year || '');
  limit = String(Math.min(parseInt(limit || '50') || 50, MAX_LIMIT));
  offset = String(Math.max(parseInt(offset || '0') || 0, 0));

  if (month && (monthNum < 1 || monthNum > 12)) {
    res.status(400).json({ error: 'Mês inválido' });
    return;
  }
  if (year && (yearNum < 2000 || yearNum > 2100)) {
    res.status(400).json({ error: 'Ano inválido' });
    return;
  }
  if (type && !['income', 'expense'].includes(type)) {
    res.status(400).json({ error: 'Tipo inválido' });
    return;
  }

  try {
    const userResult = await query<DbRow>('SELECT family_id FROM users WHERE id = $1', [userId]);
    const familyId = userResult.rows[0]?.family_id as string | null;
    const familyFilter = getFamilyFilter(userId, familyId);

    let sql = `
      SELECT t.*, 
        c.name as category_name, c.icon as category_icon, c.color as category_color,
        u.name as user_name, u.avatar_color as user_color
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE ${familyFilter.filter}
    `;
    const params: (string | number)[] = [...familyFilter.params];
    let idx = familyFilter.params.length + 1;

    if (date_from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date_from)) {
        res.status(400).json({ error: 'Data inicial inválida' });
        return;
      }
      sql += ` AND t.date >= $${idx++}`;
      params.push(date_from);
    }
    if (date_to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
        res.status(400).json({ error: 'Data final inválida' });
        return;
      }
      sql += ` AND t.date <= $${idx++}`;
      params.push(date_to);
    }
    if (!date_from && !date_to && month && year) {
      sql += ` AND EXTRACT(MONTH FROM t.date) = $${idx++} AND EXTRACT(YEAR FROM t.date) = $${idx++}`;
      params.push(monthNum, yearNum);
    }
    if (type) { sql += ` AND t.type = $${idx++}`; params.push(type); }
    if (category_id) { sql += ` AND t.category_id = $${idx++}`; params.push(category_id); }

    sql += ` ORDER BY t.date DESC, t.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query<DbRow>(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar transações' });
  }
});

router.get('/summary', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { month, year, date_from, date_to } = req.query as Record<string, string | undefined>;

  try {
    const userResult = await query<DbRow>('SELECT family_id FROM users WHERE id = $1', [userId]);
    const familyId = userResult.rows[0]?.family_id as string | null;
    const familyFilter = getFamilyFilter(userId, familyId);

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
    const params: (string | number)[] = [...familyFilter.params];
    let idx = familyFilter.params.length + 1;

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
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      sql += ` AND EXTRACT(MONTH FROM date) = $${idx++} AND EXTRACT(YEAR FROM date) = $${idx++}`;
      categorySql += ` AND EXTRACT(MONTH FROM t.date) = $${idx - 2} AND EXTRACT(YEAR FROM t.date) = $${idx - 1}`;
      params.push(monthNum, yearNum);
    }

    const result = await query<DbRow>(sql, params);
    categorySql += ' GROUP BY c.id, c.name, c.icon, c.color, t.type ORDER BY total DESC';
    const byCategory = await query<DbRow>(categorySql, params);

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
  const userId = (req as AuthenticatedRequest).userId;
  let { months } = req.query as { months?: string };
  const monthsNum = Math.min(Math.max(parseInt(months || '6') || 6, 1), MAX_HISTORY_MONTHS);

  try {
    const userResult = await query<DbRow>('SELECT family_id FROM users WHERE id = $1', [userId]);
    const familyId = userResult.rows[0]?.family_id as string | null;
    const familyFilter = getFamilyFilter(userId, familyId);

    const result = await query<DbRow>(`
      SELECT 
        EXTRACT(YEAR FROM date) as year,
        EXTRACT(MONTH FROM date) as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
      FROM transactions t
      WHERE ${familyFilter.filter}
        AND date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '${monthsNum - 1} months'
      GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
      ORDER BY year, month
    `, familyFilter.params as string[]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

router.get('/export', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { month, year, date_from, date_to } = req.query as Record<string, string | undefined>;
  const m = parseInt(month || '') || new Date().getMonth() + 1;
  const y = parseInt(year || '') || new Date().getFullYear();

  try {
    const userResult = await query<DbRow>('SELECT family_id FROM users WHERE id = $1', [userId]);
    const familyId = userResult.rows[0]?.family_id as string | null;
    const familyFilter = getFamilyFilter(userId, familyId);

    let sql = `
      SELECT 
        t.date,
        t.description,
        t.type,
        COALESCE(c.name, 'Sem categoria') as category_name,
        t.amount,
        u.name as user_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE ${familyFilter.filter}
    `;
    const params: (string | number)[] = [...familyFilter.params];
    let idx = familyFilter.params.length + 1;

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

    const result = await query<DbRow>(sql, params);

    const headers = 'Data,Descricao,Tipo,Categoria,Valor,Usuario\n';
    const rows = result.rows.map((t) => {
      const typeLabel = t.type === 'income' ? 'Entrada' : 'Saida';
      return `"${t.date}","${((t.description as string) || '').replace(/"/g, '""')}","${typeLabel}","${t.category_name}","${t.amount}","${((t.user_name as string) || '').replace(/"/g, '""')}"`;
    }).join('\n');

    const filename = date_from && date_to ? `transacoes-${date_from}-${date_to}` : `transacoes-${m}-${y}`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
    res.send(headers + rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao exportar transações' });
  }
});

router.post('/', validateBody({
  type: { required: true, enum: ['income', 'expense'] },
  amount: { required: true, type: 'positive' },
  description: { required: true, minLength: 1, maxLength: 255 },
  date: { required: true, type: 'date' },
  notes: { type: 'string', maxLength: 1000 },
  category_id: { type: 'string' }
}), async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { category_id, type, amount, description, date, notes } = req.body as {
    category_id?: string;
    type: 'income' | 'expense';
    amount: number;
    description: string;
    date: string;
    notes?: string;
  };

  const amountNum = parseFloat(String(amount));
  if (isNaN(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: 'Valor deve ser um número positivo' });
    return;
  }

  try {
    const userResult = await query<DbRow>('SELECT name, family_id FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id as string | null;

    const result = await query<DbRow>(`
      INSERT INTO transactions (user_id, family_id, category_id, type, amount, description, date, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      userId,
      familyId,
      category_id || null,
      type,
      amountNum,
      sanitizeString(description),
      date,
      sanitizeString(notes, 1000)
    ]);

    const io = req.app.get('io') as SocketServer;
    const userSockets = req.app.get('userSockets') as UserSocketMap;

    if (familyId) {
      emitToFamily(io, userSockets, familyId, 'finance_update', {
        type: 'transaction_created',
        transaction: result.rows[0],
        userName: user.name,
        userId
      });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

router.put('/:id', validateBody({
  type: { required: true, enum: ['income', 'expense'] },
  amount: { required: true, type: 'positive' },
  description: { required: true, minLength: 1, maxLength: 255 },
  date: { required: true, type: 'date' },
  notes: { type: 'string', maxLength: 1000 },
  category_id: { type: 'string' }
}), async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { category_id, type, amount, description, date, notes } = req.body as {
    category_id?: string;
    type: 'income' | 'expense';
    amount: number;
    description: string;
    date: string;
    notes?: string;
  };

  const amountNum = parseFloat(String(amount));
  if (isNaN(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: 'Valor deve ser um número positivo' });
    return;
  }

  try {
    const userResult = await query<DbRow>('SELECT name, family_id FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id as string | null;

    const original = await query<DbRow>(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (original.rows.length === 0) {
      res.status(404).json({ error: 'Transação não encontrada' });
      return;
    }

    const result = await query<DbRow>(`
      UPDATE transactions SET category_id=$1, type=$2, amount=$3, description=$4, date=$5, notes=$6
      WHERE id=$7 AND user_id=$8 RETURNING *
    `, [
      category_id || null,
      type,
      amountNum,
      sanitizeString(description),
      date,
      sanitizeString(notes, 1000),
      req.params.id,
      userId
    ]);

    const io = req.app.get('io') as SocketServer;
    const userSockets = req.app.get('userSockets') as UserSocketMap;

    if (familyId) {
      emitToFamily(io, userSockets, familyId, 'finance_update', {
        type: 'transaction_updated',
        transaction: result.rows[0],
        userName: user.name,
        userId
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar transação' });
  }
});

router.delete('/:id', async (req, res) => {
  const userId = (req as unknown as AuthenticatedRequest).userId;
  try {
    const userResult = await query<DbRow>('SELECT name, family_id FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const familyId = user.family_id as string | null;

    const orig = await query<DbRow>(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (orig.rows.length === 0) {
      res.status(404).json({ error: 'Transação não encontrada' });
      return;
    }

    const t = orig.rows[0];

    await query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [req.params.id, userId]);

    const io = req.app.get('io') as SocketServer;
    const userSockets = req.app.get('userSockets') as UserSocketMap;

    if (familyId) {
      emitToFamily(io, userSockets, familyId, 'finance_update', {
        type: 'transaction_deleted',
        transaction: t,
        userName: user.name,
        userId
      });
    }

    res.json({ message: 'Transação removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover transação' });
  }
});

export default router;

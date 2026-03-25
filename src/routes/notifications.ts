import express from 'express';
import { query } from '../db/pool.js';
import type { DbRow } from '../db/pool.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  try {
    const result = await query<DbRow>(
      `SELECT n.*, u.name as from_user_name, u.avatar_color as from_user_color
       FROM notifications n
       LEFT JOIN users u ON n.user_id = u.id
       WHERE n.user_id = $1 OR n.family_id = (SELECT family_id FROM users WHERE id = $1)
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
});

router.get('/unread-count', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  try {
    const result = await query<DbRow>(
      `SELECT COUNT(*) as count FROM notifications
       WHERE (user_id = $1 OR family_id = (SELECT family_id FROM users WHERE id = $1))
       AND read = FALSE`,
      [userId]
    );
    res.json({ count: parseInt(result.rows[0].count as string) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar contagem' });
  }
});

router.put('/:id/read', async (req, res) => {
  const userId = (req as unknown as AuthenticatedRequest).userId;
  try {
    await query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    res.json({ message: 'Notificação marcada como lida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar notificação' });
  }
});

router.put('/read-all', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  try {
    await query(
      `UPDATE notifications SET read = TRUE
       WHERE (user_id = $1 OR family_id = (SELECT family_id FROM users WHERE id = $1))
       AND read = FALSE`,
      [userId]
    );
    res.json({ message: 'Todas notificações marcadas como lidas' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar notificações' });
  }
});

router.delete('/:id', async (req, res) => {
  const userId = (req as unknown as AuthenticatedRequest).userId;
  try {
    await query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    res.json({ message: 'Notificação removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover notificação' });
  }
});

export default router;

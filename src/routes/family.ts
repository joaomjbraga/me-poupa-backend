import express from 'express';
import jwt, { Secret } from 'jsonwebtoken';
import { query } from '../db/pool.js';
import type { DbRow } from '../db/pool.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { emitToFamily } from '../utils/socketHelpers.js';
import type { Server as SocketServer } from 'socket.io';
import type { UserSocketMap } from '../utils/socketHelpers.js';

const router = express.Router();
router.use(authenticate);

interface TokenPayload {
  userId: string;
  familyId: string | null;
}

function createToken(user: { id: string; family_id: string | null }): string {
  const payload: TokenPayload = { userId: user.id, familyId: user.family_id };
  const secret = (process.env.JWT_SECRET || 'default-secret') as Secret;
  return jwt.sign(payload, secret);
}

async function getFamilyMembers(familyId: string): Promise<DbRow[]> {
  if (!familyId) return [];
  const result = await query<DbRow>(
    'SELECT id, name, email, avatar_color, avatar_image FROM users WHERE family_id = $1',
    [familyId]
  );
  return result.rows;
}

router.post('/join', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { invite_code } = req.body as { invite_code?: string };

  if (!invite_code) {
    res.status(400).json({ error: 'Código de convite é obrigatório' });
    return;
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(invite_code)) {
    res.status(400).json({ error: 'Código de convite inválido' });
    return;
  }

  try {
    const hostUser = await query<DbRow>(
      'SELECT id, name, family_id FROM users WHERE invite_code = $1',
      [invite_code]
    );

    if (hostUser.rows.length === 0) {
      res.status(404).json({ error: 'Código de convite inválido' });
      return;
    }

    const host = hostUser.rows[0];

    if (host.id === userId) {
      res.status(400).json({ error: 'Você não pode entrar na sua própria família' });
      return;
    }

    const currentUserResult = await query<DbRow>(
      'SELECT name FROM users WHERE id = $1',
      [userId]
    );
    const currentUser = currentUserResult.rows[0];

    let familyId = host.family_id as string | null;

    if (!familyId) {
      familyId = crypto.randomUUID();
      await query('UPDATE users SET family_id = $1 WHERE id = $2', [familyId, host.id]);
    }

    await query(
      'UPDATE users SET family_id = $1 WHERE id = $2',
      [familyId, userId]
    );

    await query(
      'UPDATE categories SET family_id = $1 WHERE user_id = $2',
      [familyId, userId]
    );

    await query(
      'UPDATE transactions SET family_id = $1 WHERE user_id = $2',
      [familyId, userId]
    );

    const io = req.app.get('io') as SocketServer;
    const userSockets = req.app.get('userSockets') as UserSocketMap;

    if (familyId) {
      emitToFamily(io, userSockets, familyId, 'family_update', {
        type: 'member_joined',
        userId,
        userName: currentUser.name,
        members: await getFamilyMembers(familyId)
      });
    }

    const updatedUser = await query<DbRow>(
      'SELECT id, name, email, avatar_color, avatar_image, family_id, invite_code FROM users WHERE id = $1',
      [userId]
    );

    const newToken = createToken({ id: updatedUser.rows[0].id as string, family_id: updatedUser.rows[0].family_id as string | null });

    res.json({
      message: 'Você entrou na família com sucesso!',
      user: updatedUser.rows[0],
      token: newToken
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao entrar na família' });
  }
});

router.post('/leave', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  try {
    const userResult = await query<DbRow>(
      'SELECT id, name, family_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const user = userResult.rows[0];

    if (!user.family_id) {
      res.status(400).json({ error: 'Você não faz parte de uma família' });
      return;
    }

    const familyId = user.family_id as string;
    const remainingMembers = await query<DbRow>(
      'SELECT COUNT(*) as count FROM users WHERE family_id = $1 AND id != $2',
      [familyId, userId]
    );

    const io = req.app.get('io') as SocketServer;
    const userSockets = req.app.get('userSockets') as UserSocketMap;

    await query(
      'UPDATE users SET family_id = NULL WHERE id = $1',
      [userId]
    );

    await query(
      'UPDATE categories SET family_id = NULL WHERE user_id = $1',
      [userId]
    );

    await query(
      'UPDATE transactions SET family_id = NULL WHERE user_id = $1',
      [userId]
    );

    if (parseInt(remainingMembers.rows[0].count as string) === 0) {
      await query('UPDATE users SET family_id = NULL WHERE family_id = $1', [familyId]);
    } else if (familyId) {
      emitToFamily(io, userSockets, familyId, 'family_update', {
        type: 'member_left',
        userId,
        userName: user.name,
        members: await getFamilyMembers(familyId)
      });
    }

    const updatedUser = await query<DbRow>(
      'SELECT id, name, email, avatar_color, avatar_image, family_id, invite_code FROM users WHERE id = $1',
      [userId]
    );

    const newToken = createToken({ id: updatedUser.rows[0].id as string, family_id: updatedUser.rows[0].family_id as string | null });

    res.json({
      message: 'Você saiu da família com sucesso!',
      user: updatedUser.rows[0],
      token: newToken
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao sair da família' });
  }
});

router.get('/members', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  try {
    const result = await query<DbRow>(
      'SELECT id, name, email, avatar_color, avatar_image FROM users WHERE family_id = (SELECT family_id FROM users WHERE id = $1) AND family_id IS NOT NULL',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
});

router.post('/create', async (req, res) => {
  const userId = (req as AuthenticatedRequest).userId;
  try {
    const userResult = await query<DbRow>('SELECT family_id FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    
    if (user.family_id) {
      res.status(400).json({ error: 'Você já faz parte de uma família' });
      return;
    }

    const familyId = crypto.randomUUID();
    
    await query('UPDATE users SET family_id = $1 WHERE id = $2', [familyId, userId]);
    await query('UPDATE categories SET family_id = $1 WHERE user_id = $2', [familyId, userId]);
    await query('UPDATE transactions SET family_id = $1 WHERE user_id = $2', [familyId, userId]);
    
    const updatedUser = await query<DbRow>(
      'SELECT id, name, email, avatar_color, avatar_image, family_id, invite_code FROM users WHERE id = $1',
      [userId]
    );
    
    const token = createToken({ id: updatedUser.rows[0].id as string, family_id: updatedUser.rows[0].family_id as string | null });
    
    res.json({ 
      message: 'Família criada com sucesso!',
      user: updatedUser.rows[0],
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar família' });
  }
});

export default router;

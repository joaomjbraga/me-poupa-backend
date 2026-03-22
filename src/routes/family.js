import express from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { emitFamilyUpdate, emitToUser } from '../utils/socketHelpers.js';

const router = express.Router();
router.use(authenticate);

router.post('/join', async (req, res) => {
  const { invite_code } = req.body;

  if (!invite_code) {
    return res.status(400).json({ error: 'Código de convite é obrigatório' });
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(invite_code)) {
    return res.status(400).json({ error: 'Código de convite inválido' });
  }

  try {
    const hostUser = await query(
      'SELECT id, name, family_id FROM users WHERE invite_code = $1',
      [invite_code]
    );

    if (hostUser.rows.length === 0) {
      return res.status(404).json({ error: 'Código de convite inválido' });
    }

    const host = hostUser.rows[0];
    const currentUserId = req.userId;

    if (host.id === currentUserId) {
      return res.status(400).json({ error: 'Você não pode entrar na sua própria família' });
    }

    const currentUserResult = await query(
      'SELECT name FROM users WHERE id = $1',
      [currentUserId]
    );
    const currentUser = currentUserResult.rows[0];

    let familyId = host.family_id;

    if (!familyId) {
      familyId = crypto.randomUUID();
      await query('UPDATE users SET family_id = $1 WHERE id = $2', [familyId, host.id]);
    }

    await query(
      'UPDATE users SET family_id = $1 WHERE id = $2',
      [familyId, currentUserId]
    );

    await query(
      'UPDATE categories SET family_id = $1 WHERE user_id = $2',
      [familyId, currentUserId]
    );

    await query(
      'UPDATE transactions SET family_id = $1 WHERE user_id = $2',
      [familyId, currentUserId]
    );

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');

    emitFamilyUpdate(io, userSockets, familyId, {
      type: 'member_joined',
      userId: currentUserId,
      userName: currentUser.name,
      members: await getFamilyMembers(familyId)
    });

    const updatedUser = await query(
      'SELECT id, name, email, avatar_color, avatar_image, family_id, invite_code FROM users WHERE id = $1',
      [currentUserId]
    );

    res.json({
      message: 'Você entrou na família com sucesso!',
      user: updatedUser.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao entrar na família' });
  }
});

router.post('/leave', async (req, res) => {
  try {
    const userResult = await query(
      'SELECT id, name, family_id FROM users WHERE id = $1',
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    if (!user.family_id) {
      return res.status(400).json({ error: 'Você não faz parte de uma família' });
    }

    const familyId = user.family_id;
    const remainingMembers = await query(
      'SELECT COUNT(*) as count FROM users WHERE family_id = $1 AND id != $2',
      [familyId, req.userId]
    );

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');

    await query(
      'UPDATE users SET family_id = NULL WHERE id = $1',
      [req.userId]
    );

    await query(
      'UPDATE categories SET family_id = NULL WHERE user_id = $1',
      [req.userId]
    );

    await query(
      'UPDATE transactions SET family_id = NULL WHERE user_id = $1',
      [req.userId]
    );

    if (parseInt(remainingMembers.rows[0].count) === 0) {
      await query('UPDATE users SET family_id = NULL WHERE family_id = $1', [familyId]);
    } else {
      emitFamilyUpdate(io, userSockets, familyId, {
        type: 'member_left',
        userId: req.userId,
        userName: user.name,
        members: await getFamilyMembers(familyId)
      });
    }

    const updatedUser = await query(
      'SELECT id, name, email, avatar_color, avatar_image, family_id, invite_code FROM users WHERE id = $1',
      [req.userId]
    );

    res.json({
      message: 'Você saiu da família com sucesso!',
      user: updatedUser.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao sair da família' });
  }
});

router.get('/members', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, avatar_color, avatar_image FROM users WHERE family_id = (SELECT family_id FROM users WHERE id = $1) AND family_id IS NOT NULL',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
});

async function getFamilyMembers(familyId) {
  if (!familyId) return [];
  const result = await query(
    'SELECT id, name, email, avatar_color, avatar_image FROM users WHERE family_id = $1',
    [familyId]
  );
  return result.rows;
}

export default router;

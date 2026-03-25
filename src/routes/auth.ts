import express from 'express';
import bcrypt from 'bcryptjs';
import jwt, { Secret } from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { emitToFamily } from '../utils/socketHelpers.js';
import type { Server as SocketServer } from 'socket.io';
import type { DbRow } from '../db/pool.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

interface DefaultCategory {
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
}

const _DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Salário', icon: '💼', color: '#22c55e', type: 'income' },
  { name: 'Extra', icon: '💰', color: '#16a34a', type: 'income' },
  { name: 'Comida', icon: '🍽️', color: '#ef4444', type: 'expense' },
  { name: 'Luz e Água', icon: '💡', color: '#f59e0b', type: 'expense' },
  { name: 'Fatura', icon: '💳', color: '#f97316', type: 'expense' },
  { name: 'Internet', icon: '📡', color: '#0a5c2a', type: 'expense' },
  { name: 'Faculdade', icon: '🎓', color: '#6366f1', type: 'expense' },
  { name: 'Entretenimento', icon: '🎮', color: '#ec4899', type: 'expense' },
  { name: 'Roupas', icon: '👕', color: '#8b5cf6', type: 'expense' },
  { name: 'Calçados', icon: '👟', color: '#06b6d4', type: 'expense' },
];

function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra maiúscula');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra minúscula');
  }
  if (!/\d/.test(password)) {
    errors.push('Senha deve conter pelo menos um número');
  }
  return errors;
}

interface TokenPayload {
  userId: string;
  familyId: string | null;
}

function createToken(user: { id: string; family_id: string | null }): string {
  const payload: TokenPayload = { userId: user.id, familyId: user.family_id };
  const secret = (process.env.JWT_SECRET || 'default-secret') as Secret;
  return jwt.sign(payload, secret);
}

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

  if (!name || !email || !password) {
    res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    return;
  }

  if (name.trim().length < 2) {
    res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
    return;
  }

  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Email inválido' });
    return;
  }

  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    res.status(400).json({ error: passwordErrors.join('; ') });
    return;
  }

  try {
    const existing = await query<DbRow>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email já cadastrado' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const colors = ['#22c55e', '#16a34a', '#f59e0b', '#ef4444', '#ec4899', '#f97316'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const userResult = await query<DbRow>(
      `INSERT INTO users (name, email, password_hash, avatar_color, invite_code) 
       VALUES ($1, $2, $3, $4, gen_random_uuid()) 
       RETURNING id, name, email, avatar_color, avatar_image, family_id, invite_code, created_at`,
      [name.trim(), email.toLowerCase(), passwordHash, avatarColor]
    );

    const user = userResult.rows[0];

    for (const cat of _DEFAULT_CATEGORIES) {
      await query(
        'INSERT INTO categories (user_id, name, icon, color, type) VALUES ($1, $2, $3, $4, $5)',
        [user.id as string, cat.name, cat.icon, cat.color, cat.type]
      );
    }

    const userId = user.id as string;
    const userFamilyId = user.family_id as string | null;
    const token = createToken({ id: userId, family_id: userFamilyId });

    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email e senha são obrigatórios' });
    return;
  }

  try {
    const result = await query<DbRow>(
      'SELECT id, name, email, password_hash, avatar_color, avatar_image, family_id, invite_code, created_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Email ou senha incorretos' });
      return;
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash as string);

    if (!valid) {
      res.status(401).json({ error: 'Email ou senha incorretos' });
      return;
    }

    const token = createToken({ id: user.id as string, family_id: user.family_id as string | null });

    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    const { password_hash, ...userWithoutPassword } = user;
    const newToken = createToken({ id: user.id as string, family_id: user.family_id as string | null });
    res.json({ token: newToken, user: userWithoutPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logout realizado' });
});

router.get('/me', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);
  if (!token) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  try {
    const secret: Secret = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, secret) as TokenPayload;
    const result = await query<DbRow>(
      'SELECT id, name, email, avatar_color, avatar_image, family_id, invite_code, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    res.json(result.rows[0]);
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

router.put('/profile', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);
  if (!token) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  const { name, avatar_color, avatar_image } = req.body as { name?: string; avatar_color?: string; avatar_image?: string };

  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
    return;
  }

  if (name.trim().length > 100) {
    res.status(400).json({ error: 'Nome muito longo' });
    return;
  }

  try {
    const secret: Secret = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, secret) as TokenPayload;
    
    const userResult = await query<DbRow>('SELECT family_id FROM users WHERE id = $1', [decoded.userId]);
    const familyId = userResult.rows[0]?.family_id as string | null;
    
    const result = await query<DbRow>(
      'UPDATE users SET name = $1, avatar_color = COALESCE($2, avatar_color), avatar_image = $3 WHERE id = $4 RETURNING id, name, email, avatar_color, avatar_image, family_id, invite_code, created_at',
      [name.trim(), avatar_color, avatar_image, decoded.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    
    const io = req.app.get('io') as SocketServer;
    const userSockets = req.app.get('userSockets') as Map<string, string>;
    if (familyId) {
      emitToFamily(io, userSockets, familyId, 'family_update', {
        type: 'member_updated',
        user: result.rows[0]
      });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

router.put('/email', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);
  if (!token) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  const { email } = req.body as { email?: string };

  if (!email || !EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Email inválido' });
    return;
  }

  try {
    const secret: Secret = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, secret) as TokenPayload;
    
    const existing = await query<DbRow>('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase(), decoded.userId]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Este email já está em uso' });
      return;
    }

    const result = await query<DbRow>(
      'UPDATE users SET email = $1 WHERE id = $2 RETURNING id, name, email, avatar_color, avatar_image, family_id, invite_code, created_at',
      [email.toLowerCase(), decoded.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    res.json(result.rows[0]);
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

router.put('/password', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);
  if (!token) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  const { current_password, new_password } = req.body as { current_password?: string; new_password?: string };

  if (!current_password || !new_password) {
    res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    return;
  }

  const passwordErrors = validatePassword(new_password);
  if (passwordErrors.length > 0) {
    res.status(400).json({ error: passwordErrors.join('; ') });
    return;
  }

  try {
    const secret: Secret = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, secret) as TokenPayload;
    
    const userResult = await query<DbRow>('SELECT password_hash FROM users WHERE id = $1', [decoded.userId]);
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const valid = await bcrypt.compare(current_password, userResult.rows[0].password_hash as string);
    if (!valid) {
      res.status(401).json({ error: 'Senha atual incorreta' });
      return;
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, decoded.userId]);
    
    res.json({ message: 'Senha alterada com sucesso' });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

export default router;

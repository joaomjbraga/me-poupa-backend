import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { emitFamilyUpdate } from '../utils/socketHelpers.js';

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const DEFAULT_CATEGORIES = [
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

function validatePassword(password) {
  const errors = [];
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

function createToken(user) {
  return jwt.sign(
    { userId: user.id, familyId: user.family_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  }

  if (name.trim().length < 2) {
    return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    return res.status(400).json({ error: passwordErrors.join('; ') });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const colors = ['#22c55e', '#16a34a', '#f59e0b', '#ef4444', '#ec4899', '#f97316'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const familyId = crypto.randomUUID();

    const userResult = await query(
      `INSERT INTO users (name, email, password_hash, avatar_color, family_id, invite_code) 
       VALUES ($1, $2, $3, $4, $5, gen_random_uuid()) 
       RETURNING id, name, email, avatar_color, avatar_image, family_id, invite_code, created_at`,
      [name.trim(), email.toLowerCase(), passwordHash, avatarColor, familyId]
    );

    const user = userResult.rows[0];

    for (const cat of DEFAULT_CATEGORIES) {
      await query(
        'INSERT INTO categories (user_id, family_id, name, icon, color, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [user.id, familyId, cat.name, cat.icon, cat.color, cat.type]
      );
    }

    const token = createToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const result = await query(
      'SELECT id, name, email, password_hash, avatar_color, avatar_image, family_id, invite_code, created_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const token = createToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado' });
});

router.get('/me', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query(
      'SELECT id, name, email, avatar_color, avatar_image, family_id, invite_code, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(result.rows[0]);
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

router.put('/profile', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  const { name, avatar_color, avatar_image } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
  }

  if (name.trim().length > 100) {
    return res.status(400).json({ error: 'Nome muito longo' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userResult = await query('SELECT family_id FROM users WHERE id = $1', [decoded.userId]);
    const familyId = userResult.rows[0]?.family_id;
    
    const result = await query(
      'UPDATE users SET name = $1, avatar_color = COALESCE($2, avatar_color), avatar_image = $3 WHERE id = $4 RETURNING id, name, email, avatar_color, avatar_image, family_id, invite_code, created_at',
      [name.trim(), avatar_color, avatar_image, decoded.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    emitFamilyUpdate(io, userSockets, familyId, {
      type: 'member_updated',
      user: result.rows[0]
    });
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

router.put('/email', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  const { email } = req.body;

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase(), decoded.userId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Este email já está em uso' });
    }

    const result = await query(
      'UPDATE users SET email = $1 WHERE id = $2 RETURNING id, name, email, avatar_color, avatar_image, family_id, invite_code, created_at',
      [email.toLowerCase(), decoded.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(result.rows[0]);
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

router.put('/password', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
  }

  const passwordErrors = validatePassword(new_password);
  if (passwordErrors.length > 0) {
    return res.status(400).json({ error: passwordErrors.join('; ') });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [decoded.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const valid = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, decoded.userId]);
    
    res.json({ message: 'Senha alterada com sucesso' });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

export default router;

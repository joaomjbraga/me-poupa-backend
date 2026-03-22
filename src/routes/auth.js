import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { emitFamilyUpdate } from '../utils/socketHelpers.js';

const router = express.Router();

const DEFAULT_CATEGORIES = [
  { name: 'Salário', icon: '💼', color: '#22c55e', type: 'income' },
  { name: 'Extra', icon: '💰', color: '#16a34a', type: 'income' },
  { name: 'Comida', icon: '🍽️', color: '#ef4444', type: 'expense' },
  { name: 'Luz e Água', icon: '💡', color: '#f59e0b', type: 'expense' },
  { name: 'Fatura Bancária', icon: '💳', color: '#f97316', type: 'expense' },
  { name: 'Internet', icon: '📡', color: '#0a5c2a', type: 'expense' },
  { name: 'Faculdade', icon: '🎓', color: '#6366f1', type: 'expense' },
  { name: 'Entretenimento', icon: '🎮', color: '#ec4899', type: 'expense' },
  { name: 'Roupas', icon: '👕', color: '#8b5cf6', type: 'expense' },
  { name: 'Calçados', icon: '👟', color: '#06b6d4', type: 'expense' },
];

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
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
      [name, email, passwordHash, avatarColor, familyId]
    );

    const user = userResult.rows[0];

    for (const cat of DEFAULT_CATEGORIES) {
      await query(
        'INSERT INTO categories (user_id, family_id, name, icon, color, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [user.id, familyId, cat.name, cat.icon, cat.color, cat.type]
      );
    }

    await query(
      'INSERT INTO accounts (user_id, family_id, name, type, balance, color, icon) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [user.id, familyId, 'Carteira', 'cash', 0, '#22c55e', '👛']
    );

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
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
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Não autorizado' });

  const token = authHeader.substring(7);
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
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Não autorizado' });

  const token = authHeader.substring(7);
  const { name, avatar_color, avatar_image } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
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
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Não autorizado' });

  const token = authHeader.substring(7);
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, decoded.userId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Este email já está em uso' });
    }

    const result = await query(
      'UPDATE users SET email = $1 WHERE id = $2 RETURNING id, name, email, avatar_color, avatar_image, family_id, invite_code, created_at',
      [email, decoded.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(result.rows[0]);
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

router.put('/password', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Não autorizado' });

  const token = authHeader.substring(7);
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
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

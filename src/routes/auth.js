import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

const router = express.Router();

const DEFAULT_CATEGORIES = [
  { name: 'Salário', icon: '💼', color: '#22c55e', type: 'income' },
  { name: 'Freelance', icon: '💻', color: '#06b6d4', type: 'income' },
  { name: 'Investimentos', icon: '📈', color: '#8b5cf6', type: 'income' },
  { name: 'Outros (Entrada)', icon: '💰', color: '#f59e0b', type: 'income' },
  { name: 'Alimentação', icon: '🍽️', color: '#ef4444', type: 'expense' },
  { name: 'Moradia', icon: '🏠', color: '#f97316', type: 'expense' },
  { name: 'Transporte', icon: '🚗', color: '#eab308', type: 'expense' },
  { name: 'Saúde', icon: '🏥', color: '#ec4899', type: 'expense' },
  { name: 'Educação', icon: '📚', color: '#6366f1', type: 'expense' },
  { name: 'Lazer', icon: '🎮', color: '#14b8a6', type: 'expense' },
  { name: 'Vestuário', icon: '👕', color: '#a855f7', type: 'expense' },
  { name: 'Contas', icon: '📱', color: '#64748b', type: 'expense' },
  { name: 'Mercado', icon: '🛒', color: '#84cc16', type: 'expense' },
  { name: 'Outros (Saída)', icon: '💸', color: '#94a3b8', type: 'expense' },
];

// POST /api/auth/register
router.post('/register', async (req, res) => {
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
    const colors = ['#6366f1', '#ec4899', '#f97316', '#22c55e', '#06b6d4', '#8b5cf6'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const userResult = await query(
      'INSERT INTO users (name, email, password_hash, avatar_color) VALUES ($1, $2, $3, $4) RETURNING id, name, email, avatar_color, created_at',
      [name, email, passwordHash, avatarColor]
    );

    const user = userResult.rows[0];

    // Insert default categories
    for (const cat of DEFAULT_CATEGORIES) {
      await query(
        'INSERT INTO categories (user_id, name, icon, color, type) VALUES ($1, $2, $3, $4, $5)',
        [user.id, cat.name, cat.icon, cat.color, cat.type]
      );
    }

    // Create default account
    await query(
      'INSERT INTO accounts (user_id, name, type, balance, color, icon) VALUES ($1, $2, $3, $4, $5, $6)',
      [user.id, 'Carteira', 'cash', 0, '#22c55e', '👛']
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

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const result = await query(
      'SELECT id, name, email, password_hash, avatar_color, created_at FROM users WHERE email = $1',
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

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Não autorizado' });

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query(
      'SELECT id, name, email, avatar_color, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(result.rows[0]);
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

export default router;

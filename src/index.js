import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { generalLimiter } from './middleware/rateLimiter.js';
import authRouter from './routes/auth.js';
import transactionsRouter from './routes/transactions.js';
import { categoriesRouter } from './routes/resources.js';
import familyRouter from './routes/family.js';
import reportsRouter from './routes/reports.js';
import notificationsRouter from './routes/notifications.js';
import { query } from './db/pool.js';

const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === 'production';

const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

if (!process.env.ALLOWED_ORIGINS && !isProduction) {
  console.warn('⚠️ ALLOWED_ORIGINS não configurado. Usando localhost em desenvolvimento.');
}

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['http://localhost:5173', 'http://localhost:3000'];
const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api', generalLimiter);

const userSockets = new Map();
const userMessageCount = new Map();
const MESSAGE_RATE_LIMIT = 100;
const MESSAGE_RATE_WINDOW = 60000;

io.on('connection', async (socket) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    socket.emit('connect_error', { message: 'Token não fornecido' });
    socket.disconnect(true);
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userId, familyId } = decoded;
    
    if (!userId || !familyId) {
      socket.emit('connect_error', { message: 'Token inválido' });
      socket.disconnect(true);
      return;
    }

    const result = await query('SELECT id FROM users WHERE id = $1 AND family_id = $2', [userId, familyId]);
    if (result.rows.length === 0) {
      socket.emit('connect_error', { message: 'Usuário não encontrado' });
      socket.disconnect(true);
      return;
    }

    socket.data.userId = userId;
    socket.data.familyId = familyId;
    userSockets.set(userId, socket.id);
    userMessageCount.set(userId, { count: 0, resetTime: Date.now() + MESSAGE_RATE_WINDOW });
    socket.join(`family:${familyId}`);
    console.log(`User ${userId} authenticated and joined family room: family:${familyId}`);
  } catch (err) {
    console.error('Socket auth error:', err.message);
    socket.emit('connect_error', { message: 'Token inválido ou expirado' });
    socket.disconnect(true);
  }

  socket.on('disconnect', () => {
    const userId = socket.data?.userId;
    if (userId) {
      userSockets.delete(userId);
      userMessageCount.delete(userId);
    }
  });

  socket.on('message', () => {
    const userId = socket.data?.userId;
    if (!userId) return;

    const rateData = userMessageCount.get(userId);
    if (!rateData) return;

    const now = Date.now();
    if (now > rateData.resetTime) {
      rateData.count = 0;
      rateData.resetTime = now + MESSAGE_RATE_WINDOW;
    }

    rateData.count++;
    if (rateData.count > MESSAGE_RATE_LIMIT) {
      socket.emit('rate_limited', { message: 'Muitas mensagens. Tente novamente em alguns segundos.' });
      return;
    }
  });
});

app.set('io', io);
app.set('userSockets', userSockets);

app.use('/api/auth', authRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/family', familyRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notifications', notificationsRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

export { io };

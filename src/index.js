import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
const io = new Server(httpServer, {
  cors: {
    origin: (process.env.ALLOWED_ORIGINS || '*').split(',').map(o => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(o => o.trim());
const corsOptions = {
  origin: allowedOrigins.length === 1 && allowedOrigins[0] === '*' 
    ? '*' 
    : allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api', generalLimiter);

const userSockets = new Map();

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

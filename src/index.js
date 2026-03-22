import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
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
  const userId = socket.handshake.auth.userId;
  
  if (userId) {
    userSockets.set(userId, socket.id);
    
    try {
      const result = await query('SELECT family_id FROM users WHERE id = $1', [userId]);
      if (result.rows.length > 0 && result.rows[0].family_id) {
        const familyId = result.rows[0].family_id;
        socket.join(`family:${familyId}`);
        console.log(`User ${userId} joined family room: family:${familyId}`);
      }
    } catch (err) {
      console.error('Error getting family_id for socket:', err);
    }
  }

  socket.on('disconnect', () => {
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

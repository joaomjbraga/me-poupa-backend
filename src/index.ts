import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt, { Secret } from 'jsonwebtoken';
import { generalLimiter } from './middleware/rateLimiter.js';
import authRouter from './routes/auth.js';
import transactionsRouter from './routes/transactions.js';
import { categoriesRouter } from './routes/resources.js';
import familyRouter from './routes/family.js';
import reportsRouter from './routes/reports.js';
import notificationsRouter from './routes/notifications.js';
import { query } from './db/pool.js';
import type { UserSocketMap } from './utils/socketHelpers.js';

async function initDatabase(): Promise<void> {
  const createTables = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      avatar_color VARCHAR(7) DEFAULT '#22c55e',
      avatar_image VARCHAR(255),
      family_id UUID,
      invite_code UUID DEFAULT gen_random_uuid(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      family_id UUID,
      name VARCHAR(100) NOT NULL,
      icon VARCHAR(50) DEFAULT '📦',
      color VARCHAR(7) DEFAULT '#22c55e',
      type VARCHAR(10) CHECK (type IN ('income', 'expense')) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      family_id UUID,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      type VARCHAR(10) CHECK (type IN ('income', 'expense')) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
      description VARCHAR(255) NOT NULL,
      date DATE NOT NULL,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      family_id UUID,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_family_id ON transactions(family_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
    CREATE INDEX IF NOT EXISTS idx_categories_family_id ON categories(family_id);
    CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_family_id ON notifications(family_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
  `;

  try {
    await query(createTables);
    console.log('✅ Tabelas verificadas/criadas');
  } catch (err) {
    console.error('Erro ao criar tabelas:', (err as Error).message);
  }

  try {
    await query(createIndexes);
    console.log('✅ Índices verificados/criados');
  } catch (err) {
    if ((err as { code?: string }).code !== '42P07') {
      console.error('Erro ao criar índices:', (err as Error).message);
    }
  }

  try {
    await query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await query(`DROP TRIGGER IF EXISTS users_updated_at ON users`);
    await query(`CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at()`);
    await query(`DROP TRIGGER IF EXISTS transactions_updated_at ON transactions`);
    await query(`CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at()`);
    console.log('✅ Triggers verificados/criados');
  } catch (err) {
    console.error('Erro ao criar triggers:', (err as Error).message);
  }
}

const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

const allowedOrigins = (() => {
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];
  if (envOrigins.length > 0) return envOrigins;
  if (!isProduction) return ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];
  console.warn('⚠️ ALLOWED_ORIGINS não configurado em produção!');
  return [];
})();

const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} não permitida`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

const io = new SocketServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  transports: ['polling', 'websocket']
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'http://localhost:*', 'https:', 'ws:', 'wss:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api', generalLimiter);

const userSockets: UserSocketMap = new Map();
const userMessageCount = new Map<string, { count: number; resetTime: number }>();
const MESSAGE_RATE_LIMIT = 100;
const MESSAGE_RATE_WINDOW = 60000;

io.on('connection', async (socket) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    socket.emit('auth_error', { message: 'Token não fornecido' });
    socket.disconnect(true);
    return;
  }

  try {
    const secret: Secret = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, secret) as { userId: string; familyId?: string | null };
    const { userId, familyId } = decoded;
    
    if (!userId) {
      socket.emit('auth_error', { message: 'Token inválido' });
      socket.disconnect(true);
      return;
    }

    const result = await query<{ id: string; family_id: string | null }>('SELECT id, family_id FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      socket.emit('auth_error', { message: 'Usuário não encontrado' });
      socket.disconnect(true);
      return;
    }

    const dbFamilyId = result.rows[0].family_id;
    const actualFamilyId = familyId || dbFamilyId;
    
    socket.data.userId = userId;
    socket.data.familyId = actualFamilyId;
    
    userSockets.set(userId, socket.id);
    userMessageCount.set(userId, { count: 0, resetTime: Date.now() + MESSAGE_RATE_WINDOW });
    
    if (actualFamilyId) {
      socket.join(`family:${actualFamilyId}`);
    }
    
  } catch {
    socket.emit('auth_error', { message: 'Token inválido ou expirado' });
    socket.disconnect(true);
  }

  socket.on('disconnect', () => {
    const userId = socket.data?.userId as string | undefined;
    if (userId) {
      userSockets.delete(userId);
      userMessageCount.delete(userId);
    }
  });

  socket.on('message', () => {
    const userId = socket.data?.userId as string | undefined;
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
    }
  });
});

app.set('io', io);
app.set('userSockets', userSockets);

await initDatabase();

app.use('/api/auth', authRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/family', familyRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notifications', notificationsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

export { io };

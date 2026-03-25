import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { generalLimiter } from './middleware/rateLimiter.js';
import authRouter from './routes/auth.js';
import transactionsRouter from './routes/transactions.js';
import { categoriesRouter } from './routes/resources.js';
import familyRouter from './routes/family.js';
import reportsRouter from './routes/reports.js';
import notificationsRouter from './routes/notifications.js';

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

const allowedOrigins = (() => {
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];
  if (envOrigins.length > 0) return envOrigins;
  if (!isProduction) return ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];
  return [];
})();

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

app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api', generalLimiter);

app.use('/api/auth', authRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/family', familyRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notifications', notificationsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default app;

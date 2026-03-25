import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({ error: 'Muitas requisições. Tente novamente em 15 minutos.' });
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de login/registro. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({ error: 'Muitas tentativas de login/registro. Tente novamente em 15 minutos.' });
  },
});

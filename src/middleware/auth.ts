import jwt, { Secret } from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  userId: string;
  familyId: string | null;
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);

  if (!token) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }

  try {
    const secret: Secret = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, secret) as { userId: string; familyId?: string | null };
    
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!decoded.userId || !UUID_REGEX.test(decoded.userId)) {
      res.status(401).json({ error: 'Token inválido ou expirado' });
      return;
    }
    
    (req as AuthenticatedRequest).userId = decoded.userId;
    (req as AuthenticatedRequest).familyId = decoded.familyId || null;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

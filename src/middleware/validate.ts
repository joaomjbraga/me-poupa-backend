import type { Request, Response, NextFunction } from 'express';

interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'positive' | 'date' | 'uuid';
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
}

type ValidationSchema = Record<string, ValidationRule>;

export function validateBody(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} é obrigatório`);
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        if (rules.type === 'string' && typeof value !== 'string') {
          errors.push(`${field} deve ser texto`);
        }

        if (rules.type === 'number' && isNaN(parseFloat(value as string))) {
          errors.push(`${field} deve ser um número`);
        }

        if (rules.type === 'positive' && parseFloat(value as string) <= 0) {
          errors.push(`${field} deve ser maior que zero`);
        }

        if (rules.enum && !rules.enum.includes(value as string)) {
          errors.push(`${field} deve ser um dos valores: ${rules.enum.join(', ')}`);
        }

        if (rules.type === 'date' && isNaN(Date.parse(value as string))) {
          errors.push(`${field} deve ser uma data válida`);
        }

        if (rules.type === 'uuid' && typeof value === 'string') {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(value)) {
            errors.push(`${field} deve ser um UUID válido`);
          }
        }

        if (rules.minLength && (value as string).length < rules.minLength) {
          errors.push(`${field} deve ter pelo menos ${rules.minLength} caracteres`);
        }

        if (rules.maxLength && (value as string).length > rules.maxLength) {
          errors.push(`${field} deve ter no máximo ${rules.maxLength} caracteres`);
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; ') });
      return;
    }

    next();
  };
}

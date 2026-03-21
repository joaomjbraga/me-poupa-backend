export function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];

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

        if (rules.type === 'number' && isNaN(parseFloat(value))) {
          errors.push(`${field} deve ser um número`);
        }

        if (rules.type === 'positive' && parseFloat(value) <= 0) {
          errors.push(`${field} deve ser maior que zero`);
        }

        if (rules.enum && !rules.enum.includes(value)) {
          errors.push(`${field} deve ser um dos valores: ${rules.enum.join(', ')}`);
        }

        if (rules.date && isNaN(Date.parse(value))) {
          errors.push(`${field} deve ser uma data válida`);
        }

        if (rules.uuid && typeof value === 'string') {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(value)) {
            errors.push(`${field} deve ser um UUID válido`);
          }
        }

        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} deve ter pelo menos ${rules.minLength} caracteres`);
        }

        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} deve ter no máximo ${rules.maxLength} caracteres`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    next();
  };
}

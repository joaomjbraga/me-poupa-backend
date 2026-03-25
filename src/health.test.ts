import { test, expect, describe } from 'vitest';
import request from 'supertest';
import app from './app.js';

describe('Health Check', () => {
  test('GET /api/health should return ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
  });
});

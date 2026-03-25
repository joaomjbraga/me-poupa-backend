import { test, expect, beforeAll, describe } from 'vitest';
import request from 'supertest';
import app from '../app.js';

const TEST_EMAIL = `test_tx_${Date.now()}@test.com`;
const TEST_PASSWORD = 'Test1234!';

describe('Transactions API', () => {
  let authToken: string;

  beforeAll(async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Tx Test User',
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });
    
    authToken = registerRes.body.token;
  });

  test('GET /api/transactions should return empty list initially', async () => {
    const res = await request(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/transactions should create transaction', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'expense',
        amount: 50.00,
        description: 'Test Expense',
        date: '2026-03-25'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('type', 'expense');
    expect(res.body).toHaveProperty('amount', '50.00');
    expect(res.body).toHaveProperty('description', 'Test Expense');
  });

  test('POST /api/transactions should create income transaction', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'income',
        amount: 1000.00,
        description: 'Salary',
        date: '2026-03-01'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('type', 'income');
  });

  test('POST /api/transactions should validate type enum', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'invalid',
        amount: 50.00,
        description: 'Test',
        date: '2026-03-25'
      });

    expect(res.status).toBe(400);
  });

  test('POST /api/transactions should validate positive amount', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'expense',
        amount: -50.00,
        description: 'Test',
        date: '2026-03-25'
      });

    expect(res.status).toBe(400);
  });

  test('GET /api/transactions should return created transactions', async () => {
    const res = await request(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/transactions/summary should calculate totals', async () => {
    const res = await request(app)
      .get('/api/transactions/summary')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('total_income');
    expect(res.body.summary).toHaveProperty('total_expense');
    expect(res.body.summary).toHaveProperty('balance');
  });

  test('GET /api/transactions?type=expense should filter by type', async () => {
    const res = await request(app)
      .get('/api/transactions?type=expense')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    res.body.forEach((tx: { type: string }) => {
      expect(tx.type).toBe('expense');
    });
  });

  test('GET /api/transactions?type=income should filter by type', async () => {
    const res = await request(app)
      .get('/api/transactions?type=income')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    res.body.forEach((tx: { type: string }) => {
      expect(tx.type).toBe('income');
    });
  });

  test('GET /api/transactions should require authentication', async () => {
    const res = await request(app).get('/api/transactions');

    expect(res.status).toBe(401);
  });
});

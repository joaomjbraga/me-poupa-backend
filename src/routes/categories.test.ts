import { test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';

const TEST_EMAIL = `test_cat_${Date.now()}@test.com`;
const TEST_PASSWORD = 'Test1234!';

describe('Categories API', () => {
  let authToken: string;

  beforeAll(async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Cat Test User',
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });
    
    authToken = registerRes.body.token;
  });

  test('GET /api/categories should return default categories on register', async () => {
    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(10);
  });

  test('GET /api/categories?type=income should filter income categories', async () => {
    const res = await request(app)
      .get('/api/categories?type=income')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    res.body.forEach((cat: { type: string }) => {
      expect(cat.type).toBe('income');
    });
  });

  test('GET /api/categories?type=expense should filter expense categories', async () => {
    const res = await request(app)
      .get('/api/categories?type=expense')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    res.body.forEach((cat: { type: string }) => {
      expect(cat.type).toBe('expense');
    });
  });

  test('POST /api/categories should create new category', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Custom Category',
        type: 'expense',
        icon: '⭐',
        color: '#ffd700'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('name', 'Custom Category');
    expect(res.body).toHaveProperty('type', 'expense');
    expect(res.body).toHaveProperty('icon', '⭐');
    expect(res.body).toHaveProperty('color', '#ffd700');
  });

  test('POST /api/categories should validate required fields', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test'
      });

    expect(res.status).toBe(400);
  });

  test('POST /api/categories should validate type enum', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test',
        type: 'invalid'
      });

    expect(res.status).toBe(400);
  });

  test('POST /api/categories should validate name length', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: '',
        type: 'expense'
      });

    expect(res.status).toBe(400);
  });

  test('GET /api/categories should require authentication', async () => {
    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(401);
  });
});

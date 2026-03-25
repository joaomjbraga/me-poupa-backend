import { test, expect, describe } from 'vitest';
import request from 'supertest';
import app from '../app.js';

const TEST_EMAIL = `test_${Date.now()}@test.com`;
const TEST_PASSWORD = 'Test1234!';
const TEST_NAME = 'Test User';

describe('Auth API', () => {
  let authToken: string;

  test('POST /api/auth/register should create user with categories', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: TEST_NAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('name', TEST_NAME);
    expect(res.body.user).toHaveProperty('email', TEST_EMAIL.toLowerCase());
    expect(res.body.user).toHaveProperty('avatar_color');
    expect(res.body.user).toHaveProperty('invite_code');

    authToken = res.body.token;
  });

  test('POST /api/auth/register should fail with duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: TEST_NAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/auth/register should validate password requirements', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test',
        email: 'short@test.com',
        password: 'weak'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Senha');
  });

  test('POST /api/auth/register should validate email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: TEST_NAME,
        email: 'invalid-email',
        password: TEST_PASSWORD
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Email');
  });

  test('POST /api/auth/login should authenticate user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('email', TEST_EMAIL.toLowerCase());
    expect(res.body.user).not.toHaveProperty('password_hash');

    authToken = res.body.token;
  });

  test('POST /api/auth/login should fail with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: TEST_EMAIL,
        password: 'WrongPassword1!'
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/auth/login should fail with non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@test.com',
        password: TEST_PASSWORD
      });

    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me should return user data', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('email', TEST_EMAIL.toLowerCase());
  });

  test('GET /api/auth/me should fail without token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  test('PUT /api/auth/profile should update user name', async () => {
    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Updated Name'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Updated Name');
  });

  test('PUT /api/auth/profile should reject short names', async () => {
    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'A'
      });

    expect(res.status).toBe(400);
  });

  test('POST /api/auth/logout should clear cookie', async () => {
    const res = await request(app)
      .post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });
});

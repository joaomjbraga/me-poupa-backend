import { test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';

const TEST_EMAIL = `test_family_${Date.now()}@test.com`;
const TEST_PASSWORD = 'Test1234!';

describe('Family API', () => {
  let authToken: string;

  beforeAll(async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Family Test User',
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });
    
    authToken = registerRes.body.token;
  });

  test('POST /api/family/create should create a family', async () => {
    const res = await request(app)
      .post('/api/family/create')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body.user).toHaveProperty('family_id');
    expect(res.body.user.family_id).not.toBeNull();
  });

  test('POST /api/family/join should fail with invalid code', async () => {
    const res = await request(app)
      .post('/api/family/join')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        invite_code: '00000000-0000-0000-0000-000000000000'
      });

    expect(res.status).toBe(404);
  });

  test('POST /api/family/join should validate UUID format', async () => {
    const res = await request(app)
      .post('/api/family/join')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        invite_code: 'invalid-code'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('inválido');
  });

  test('POST /api/family/join should require invite_code', async () => {
    const res = await request(app)
      .post('/api/family/join')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('GET /api/family/members should return family members', async () => {
    const res = await request(app)
      .get('/api/family/members')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/family/leave should leave family', async () => {
    const res = await request(app)
      .post('/api/family/leave')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.family_id).toBeNull();
  });

  test('POST /api/family/leave should fail if not in family', async () => {
    const res = await request(app)
      .post('/api/family/leave')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('não faz parte');
  });

  test('POST /api/family/create should succeed after leaving', async () => {
    const res = await request(app)
      .post('/api/family/create')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.family_id).not.toBeNull();
  });

  test('POST /api/family/create should fail if already in family', async () => {
    const res = await request(app)
      .post('/api/family/create')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('já faz parte');
  });

  test('Family routes should require authentication', async () => {
    const res = await request(app).get('/api/family/members');

    expect(res.status).toBe(401);
  });
});

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginAs, setupTestDB, signupSchool, truncateAll } from './helper';

describe('auth', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    app = buildTestApp();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('signup creates tenant + admin membership; /auth/me lists it', async () => {
    const { token, tenant } = await signupSchool(app, {
      schoolName: 'Auth School',
      name: 'Alice Admin',
      email: 'alice-auth@example.com',
      password: 'password123',
    });
    expect(token).toBeTruthy();
    expect(tenant.slug).toBeTruthy();

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    const body = me.json() as { memberships: Array<{ slug: string; role: string }> };
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0].slug).toBe(tenant.slug);
    expect(body.memberships[0].role).toBe('Admin');
  });

  it('duplicate email -> 409', async () => {
    await signupSchool(app, { email: 'dupe-auth@example.com', schoolName: 'Dupe One' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Someone', email: 'dupe-auth@example.com', password: 'password123', schoolName: 'Dupe Two' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('login ok + bad password 401', async () => {
    await signupSchool(app, { email: 'login-auth@example.com', password: 'correct-horse', schoolName: 'Login School' });
    const token = await loginAs(app, 'login-auth@example.com', 'correct-horse');
    expect(token).toBeTruthy();

    const bad = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'login-auth@example.com', password: 'wrong-pass' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('GET /auth/me with token ok; without token -> 401', async () => {
    const { token } = await signupSchool(app, { email: 'me-auth@example.com', schoolName: 'Me School' });
    const ok = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(ok.statusCode).toBe(200);

    const anon = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(anon.statusCode).toBe(401);
  });
});

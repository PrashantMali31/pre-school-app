import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, loginAs, setupTestDB, signupSchool, truncateAll } from './helper';

describe('school options', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    app = buildTestApp();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('GET defaults; PUT /options/genders sets list; Teacher PUT -> 403', async () => {
    const admin = await signupSchool(app, { email: 'opt-admin@example.com', schoolName: 'Options School' });
    const h = { authorization: `Bearer ${admin.token}`, 'x-tenant-slug': admin.tenant.slug };

    const get = await app.inject({ method: 'GET', url: '/options', headers: h });
    expect(get.statusCode).toBe(200);
    const defaults = (get.json() as { data: { genders: string[] } }).data;
    expect(defaults.genders).toEqual(expect.arrayContaining(['Boy', 'Girl']));

    const put = await app.inject({
      method: 'PUT',
      url: '/options/genders',
      headers: h,
      payload: { values: ['Boy', 'Girl', 'Non-binary'] },
    });
    expect(put.statusCode).toBe(200);

    const get2 = await app.inject({ method: 'GET', url: '/options', headers: h });
    expect((get2.json() as { data: { genders: string[] } }).data.genders).toEqual(['Boy', 'Girl', 'Non-binary']);

    // Teacher member in the same school cannot update options.
    const teacher = await signupSchool(app, { email: 'opt-teacher@example.com', schoolName: 'Opt Teacher Home' });
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    try {
      await pool.query(`INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'Teacher')`, [
        teacher.user.id,
        admin.tenant.id,
      ]);
    } finally {
      await pool.end();
    }
    const teacherToken = await loginAs(app, 'opt-teacher@example.com', 'password123');
    const denied = await app.inject({
      method: 'PUT',
      url: '/options/genders',
      headers: { authorization: `Bearer ${teacherToken}`, 'x-tenant-slug': admin.tenant.slug },
      payload: { values: ['X'] },
    });
    expect(denied.statusCode).toBe(403);
  });
});

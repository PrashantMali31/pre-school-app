import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, loginAs, setupTestDB, signupSchool, truncateAll } from './helper';

function auth(token: string, slug: string) {
  return { authorization: `Bearer ${token}`, 'x-tenant-slug': slug };
}

async function addMembership(userId: string, tenantId: string, role: 'Teacher' | 'Parent') {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, $3)`, [userId, tenantId, role]);
  } finally {
    await pool.end();
  }
}

const GHOST_ID = '00000000-0000-4000-8000-000000000000';

const enquiryPayload = {
  childName: 'Aarav Sharma',
  age: 4,
  parent: 'Rohit Sharma',
  phone: '+911234567890',
  source: 'Walk-in',
  note: 'prefers morning batch',
};

describe('enquiries: create -> edit -> verify, guards, roles', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    app = buildTestApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('create -> edit -> verify returns updated fields', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'enq-admin@example.com', schoolName: 'Enq School' });
    const h = auth(token, tenant.slug);

    const created = await app.inject({ method: 'POST', url: '/enquiries', headers: h, payload: enquiryPayload });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { data: { id: string } }).data.id;
    expect(id).toBeTruthy();

    const edited = await app.inject({
      method: 'PUT',
      url: `/enquiries/${id}`,
      headers: h,
      payload: { childName: 'Aarav S', phone: '+919876543210', note: 'updated note' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({
      ok: true,
      data: { id, childName: 'Aarav S', phone: '+919876543210', note: 'updated note' },
    });

    const list = await app.inject({ method: 'GET', url: '/enquiries', headers: h });
    expect(list.statusCode).toBe(200);
    const rows = (list.json() as { data: Array<{ id: string; childName: string; phone: string; note: string }> }).data;
    const row = rows.find((r) => r.id === id);
    expect(row).toMatchObject({ childName: 'Aarav S', phone: '+919876543210', note: 'updated note' });
  });

  it('empty body 400; ghost id 404; invalid uuid 400', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'enq-guard@example.com', schoolName: 'Enq Guard' });
    const h = auth(token, tenant.slug);

    const created = await app.inject({ method: 'POST', url: '/enquiries', headers: h, payload: enquiryPayload });
    const id = (created.json() as { data: { id: string } }).data.id;

    const empty = await app.inject({ method: 'PUT', url: `/enquiries/${id}`, headers: h, payload: {} });
    expect(empty.statusCode).toBe(400);

    const ghost = await app.inject({ method: 'PUT', url: `/enquiries/${GHOST_ID}`, headers: h, payload: { note: 'ghost' } });
    expect(ghost.statusCode).toBe(404);

    const bad = await app.inject({ method: 'PUT', url: '/enquiries/not-a-uuid', headers: h, payload: { note: 'bad' } });
    expect(bad.statusCode).toBe(400);
  });

  it('Teacher edit ok; Parent edit 403; anon 401', async () => {
    const admin = await signupSchool(app, { email: 'enq-role-admin@example.com', schoolName: 'Enq Role School' });
    const created = await app.inject({
      method: 'POST',
      url: '/enquiries',
      headers: auth(admin.token, admin.tenant.slug),
      payload: enquiryPayload,
    });
    const id = (created.json() as { data: { id: string } }).data.id;

    const teacherSignup = await signupSchool(app, { email: 'enq-teacher@example.com', schoolName: 'Teacher Home' });
    await addMembership(teacherSignup.user.id, admin.tenant.id, 'Teacher');
    const teacherToken = await loginAs(app, 'enq-teacher@example.com', 'password123');

    const teacherRes = await app.inject({
      method: 'PUT',
      url: `/enquiries/${id}`,
      headers: auth(teacherToken, admin.tenant.slug),
      payload: { note: 'teacher edit' },
    });
    expect(teacherRes.statusCode).toBe(200);
    expect(teacherRes.json()).toMatchObject({ data: { note: 'teacher edit' } });

    const parentSignup = await signupSchool(app, { email: 'enq-parent@example.com', schoolName: 'Parent Home' });
    await addMembership(parentSignup.user.id, admin.tenant.id, 'Parent');
    const parentToken = await loginAs(app, 'enq-parent@example.com', 'password123');

    const parentRes = await app.inject({
      method: 'PUT',
      url: `/enquiries/${id}`,
      headers: auth(parentToken, admin.tenant.slug),
      payload: { note: 'parent edit' },
    });
    expect(parentRes.statusCode).toBe(403);

    const anon = await app.inject({
      method: 'PUT',
      url: `/enquiries/${id}`,
      headers: { 'x-tenant-slug': admin.tenant.slug },
      payload: { note: 'anon' },
    });
    expect(anon.statusCode).toBe(401);
  });
});

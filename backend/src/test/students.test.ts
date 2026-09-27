import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, loginAs, setupTestDB, signupSchool, truncateAll } from './helper';

const studentPayload = {
  name: 'Test Kid',
  age: 4,
  dob: '2021-05-01',
  gender: 'Girl',
  parent: 'Test Parent',
  phone: '+911234567890',
  joinedAt: '2026-09-01',
};

function auth(token: string, slug: string) {
  return { authorization: `Bearer ${token}`, 'x-tenant-slug': slug };
}

/** Give an existing user a Teacher membership in the given tenant (no invite API exists). */
async function addTeacherMembership(userId: string, tenantId: string) {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'Teacher')`, [userId, tenantId]);
  } finally {
    await pool.end();
  }
}

describe('students CRUD + roles', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    app = buildTestApp();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('full CRUD as Admin; bad phone -> 400; PUT status; DELETE removes from list', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'crud-admin@example.com', schoolName: 'CRUD School' });
    const h = auth(token, tenant.slug);

    const bad = await app.inject({ method: 'POST', url: '/students', headers: h, payload: { ...studentPayload, phone: 'bad!!' } });
    expect(bad.statusCode).toBe(400);

    const created = await app.inject({ method: 'POST', url: '/students', headers: h, payload: studentPayload });
    expect(created.statusCode).toBe(201);
    const row = created.json() as { data: { id: string } };
    expect(row.data.id).toBeTruthy();

    const list = await app.inject({ method: 'GET', url: '/students', headers: h });
    expect(list.statusCode).toBe(200);
    const listed = (list.json() as { data: Array<{ id: string }> }).data;
    expect(listed.map((s) => s.id)).toContain(row.data.id);

    const put = await app.inject({ method: 'PUT', url: `/students/${row.data.id}`, headers: h, payload: { status: 'inactive' } });
    expect(put.statusCode).toBe(200);

    const del = await app.inject({ method: 'DELETE', url: `/students/${row.data.id}`, headers: h });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/students', headers: h });
    expect((after.json() as { data: Array<{ id: string }> }).data.map((s) => s.id)).not.toContain(row.data.id);
  });

  it('Teacher can POST but cannot DELETE (403); unauthenticated -> 401', async () => {
    const admin = await signupSchool(app, { email: 'stud-admin@example.com', schoolName: 'Role School' });
    const teacherSignup = await signupSchool(app, { email: 'stud-teacher@example.com', schoolName: 'Teacher Home' });
    await addTeacherMembership(teacherSignup.user.id, admin.tenant.id);
    const teacherToken = await loginAs(app, 'stud-teacher@example.com', 'password123');
    const th = auth(teacherToken, admin.tenant.slug);

    const post = await app.inject({ method: 'POST', url: '/students', headers: th, payload: studentPayload });
    expect(post.statusCode).toBe(201);
    const id = (post.json() as { data: { id: string } }).data.id;

    const del = await app.inject({ method: 'DELETE', url: `/students/${id}`, headers: th });
    expect(del.statusCode).toBe(403);

    const anon = await app.inject({ method: 'GET', url: '/students', headers: { 'x-tenant-slug': admin.tenant.slug } });
    expect(anon.statusCode).toBe(401);
  });
});

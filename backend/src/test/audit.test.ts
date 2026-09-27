import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, loginAs, setupTestDB, signupSchool, truncateAll } from './helper';
import { writeAudit } from '../utils/audit';

function auth(token: string, slug: string) {
  return { authorization: `Bearer ${token}`, 'x-tenant-slug': slug };
}

/** Create audit (+payments, for export) tables IF NOT EXISTS so the suite passes even before migrations run. */
async function ensureAuditTables(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "action" text NOT NULL,
        "entity" text NOT NULL,
        "entity_id" text,
        "summary" text NOT NULL DEFAULT '',
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "audit_logs_tenant_created_idx" ON "audit_logs" ("tenant_id", "created_at")`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
        "amount_cents" integer NOT NULL,
        "method" text NOT NULL,
        "reference" text,
        "received_at" date NOT NULL,
        "voided_at" timestamptz,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "updated_at" timestamptz DEFAULT now() NOT NULL
      )`);
  } finally {
    await pool.end();
  }
}

async function addMembership(userId: string, tenantId: string, role: 'Teacher' | 'Parent') {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, $3)`, [userId, tenantId, role]);
  } finally {
    await pool.end();
  }
}

async function setDemo(tenantId: string, demo: boolean) {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`UPDATE tenants SET demo = $1 WHERE id = $2`, [demo, tenantId]);
  } finally {
    await pool.end();
  }
}

describe('audit: log list, backup export, demo rotation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    await ensureAuditTables();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    app = buildTestApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
    await ensureAuditTables();
  });

  it('writeAudit helper inserts a log that GET /audit lists', async () => {
    const { token, tenant, user } = await signupSchool(app, { email: 'audit-admin@example.com', schoolName: 'Audit School' });
    await writeAudit(tenant.id, user.id, 'students.create', 'student', 'stu-1', 'Admitted Test Kid');
    const res = await app.inject({ method: 'GET', url: '/audit?page=1&limit=50', headers: auth(token, tenant.slug) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ action: string; entity: string; summary: string; user: { email: string } | null }> };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const found = body.data.find((r) => r.action === 'students.create');
    expect(found).toMatchObject({ entity: 'student', summary: 'Admitted Test Kid' });
    expect(found?.user?.email).toBe('audit-admin@example.com');
  });

  it('Parent GET /audit is 403 AUDIT_FORBIDDEN; anon is 401', async () => {
    const a = await signupSchool(app, { email: 'audit-a@example.com', schoolName: 'Audit Tenant A' });
    const parentSignup = await signupSchool(app, { email: 'audit-parent@example.com', schoolName: 'Parent Home' });
    await addMembership(parentSignup.user.id, a.tenant.id, 'Parent');
    const parentToken = await loginAs(app, 'audit-parent@example.com', 'password123');

    const denied = await app.inject({ method: 'GET', url: '/audit', headers: auth(parentToken, a.tenant.slug) });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: { code: 'AUDIT_FORBIDDEN' } });

    const anon = await app.inject({ method: 'GET', url: '/audit', headers: { 'x-tenant-slug': a.tenant.slug } });
    expect(anon.statusCode).toBe(401);
  });

  it('Teacher can read the log', async () => {
    const a = await signupSchool(app, { email: 'audit-t-admin@example.com', schoolName: 'Audit Teacher School' });
    const teacherSignup = await signupSchool(app, { email: 'audit-teacher@example.com', schoolName: 'Teacher Home' });
    await addMembership(teacherSignup.user.id, a.tenant.id, 'Teacher');
    const teacherToken = await loginAs(app, 'audit-teacher@example.com', 'password123');
    const res = await app.inject({ method: 'GET', url: '/audit', headers: auth(teacherToken, a.tenant.slug) });
    expect(res.statusCode).toBe(200);
  });

  it('GET /audit/export returns 200 with the full backup keys', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'export-admin@example.com', schoolName: 'Export School' });
    const res = await app.inject({ method: 'GET', url: '/audit/export', headers: auth(token, tenant.slug) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Record<string, unknown> };
    for (const key of ['profile', 'options', 'classes', 'students', 'teachers', 'attendance', 'invoices', 'payments', 'events', 'announcements', 'enquiries']) {
      expect(body.data, `missing backup key: ${key}`).toHaveProperty(key);
    }
  });

  it('POST /audit/rotate-demo without confirm is 400; non-demo tenant is 403', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'rotate-admin@example.com', schoolName: 'Rotate School' });
    await setDemo(tenant.id, true);

    const noConfirm = await app.inject({ method: 'POST', url: '/audit/rotate-demo', headers: auth(token, tenant.slug), payload: {} });
    expect(noConfirm.statusCode).toBe(400);

    const other = await signupSchool(app, { email: 'rotate-plain@example.com', schoolName: 'Plain School' });
    const nonDemo = await app.inject({
      method: 'POST', url: '/audit/rotate-demo', headers: auth(other.token, other.tenant.slug), payload: { confirm: true },
    });
    expect(nonDemo.statusCode).toBe(403);
    expect(nonDemo.json()).toMatchObject({ error: { code: 'NOT_DEMO' } });
  });

  it('POST /audit/rotate-demo on a demo tenant returns a 16-char temp password that works', async () => {
    const email = 'rotate-demo@example.com';
    const { token, tenant } = await signupSchool(app, { email, schoolName: 'Demo Rotate School' });
    await setDemo(tenant.id, true);

    const res = await app.inject({
      method: 'POST', url: '/audit/rotate-demo', headers: auth(token, tenant.slug), payload: { confirm: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; temporaryPassword: string; rotatedCount: number };
    expect(body.ok).toBe(true);
    expect(body.temporaryPassword).toMatch(/^[0-9a-f]{16}$/);
    expect(body.rotatedCount).toBeGreaterThanOrEqual(1);

    // New password logs in; old one no longer works.
    const fresh = await loginAs(app, email, body.temporaryPassword);
    expect(typeof fresh).toBe('string');
    const stale = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'password123' } });
    expect(stale.statusCode).toBe(401);
  });
});

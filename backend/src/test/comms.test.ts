import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, loginAs, setupTestDB, signupSchool, truncateAll } from './helper';

function auth(token: string, slug: string) {
  return { authorization: `Bearer ${token}`, 'x-tenant-slug': slug };
}

/** Create comms tables IF NOT EXISTS so the suite passes even before migrations run. */
async function ensureCommsTables(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "message_deliveries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "announcement_id" uuid REFERENCES "announcements"("id") ON DELETE SET NULL,
        "channel" text NOT NULL,
        "recipient" text NOT NULL,
        "status" text NOT NULL DEFAULT 'queued',
        "provider_message_id" text,
        "error" text,
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "message_deliveries_tenant_idx" ON "message_deliveries" ("tenant_id")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "message_deliveries_announcement_idx" ON "message_deliveries" ("announcement_id")`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "reminder_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "kind" text NOT NULL,
        "target_count" integer NOT NULL DEFAULT 0,
        "sent_count" integer NOT NULL DEFAULT 0,
        "failed_count" integer NOT NULL DEFAULT 0,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "reminder_runs_tenant_idx" ON "reminder_runs" ("tenant_id")`);
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

const studentPayload = {
  name: 'Comms Kid',
  age: 4,
  dob: '2021-05-01',
  gender: 'Girl',
  parent: 'Comms Parent',
  phone: '+911234567890',
  joinedAt: '2026-09-01',
};

describe('comms: templates, announce, deliveries, fee reminders', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    await ensureCommsTables();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    app = buildTestApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
    await ensureCommsTables();
  });

  it('GET /comms/templates lists 4 built-ins with placeholders', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'tmpl-admin@example.com', schoolName: 'Tmpl School' });
    const res = await app.inject({ method: 'GET', url: '/comms/templates', headers: auth(token, tenant.slug) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ key: string; title: string; body: string }> };
    expect(body.data).toHaveLength(4);
    for (const t of body.data) {
      expect(t.key).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.body).toContain('{{');
    }
  });

  it('POST /comms/announce inapp -> 201 with stub-sent deliveries; visible via /deliveries', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'ann-admin@example.com', schoolName: 'Ann School' });
    const h = auth(token, tenant.slug);

    const created = await app.inject({
      method: 'POST',
      url: '/comms/announce',
      headers: h,
      payload: { title: 'Sports day Friday', body: 'Join us for sports day this Friday morning!', audience: 'All Parents', channel: 'inapp' },
    });
    expect(created.statusCode).toBe(201);
    const createdJson = created.json() as { data: { id: string }; deliveries: { total: number; sent: number; failed: number } };
    expect(createdJson.data.id).toBeTruthy();
    expect(createdJson.deliveries.total).toBeGreaterThanOrEqual(1);
    expect(createdJson.deliveries.sent).toBeGreaterThanOrEqual(1);

    const list = await app.inject({
      method: 'GET',
      url: `/comms/deliveries?announcementId=${createdJson.data.id}`,
      headers: h,
    });
    expect(list.statusCode).toBe(200);
    const rows = (list.json() as { data: Array<{ status: string; providerMessageId: string | null }> }).data;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.status === 'sent')).toBe(true);
    expect(rows.every((r) => (r.providerMessageId ?? '').startsWith('stub-'))).toBe(true);
  });

  it('POST /comms/reminders/fee dryRun returns counts without writing deliveries', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'fee-admin@example.com', schoolName: 'Fee School' });
    const h = auth(token, tenant.slug);

    const stu = await app.inject({ method: 'POST', url: '/students', headers: h, payload: studentPayload });
    expect(stu.statusCode).toBe(201);
    const studentId = (stu.json() as { data: { id: string } }).data.id;

    const inv = await app.inject({
      method: 'POST',
      url: '/invoices',
      headers: h,
      payload: { studentId, title: 'Term Fee', amount: 100, dueDate: '2026-08-01', issuedAt: '2026-07-01' },
    });
    expect(inv.statusCode).toBe(201);
    const invoiceId = (inv.json() as { data: { id: string } }).data.id;

    const patch = await app.inject({ method: 'PATCH', url: `/invoices/${invoiceId}`, headers: h, payload: { status: 'overdue' } });
    expect(patch.statusCode).toBe(200);

    const dry = await app.inject({ method: 'POST', url: '/comms/reminders/fee', headers: h, payload: { dryRun: true } });
    expect(dry.statusCode).toBe(200);
    const dryJson = dry.json() as { data: { targetCount: number; totalAmountCents: number } };
    expect(dryJson.data.targetCount).toBe(1);
    expect(dryJson.data.totalAmountCents).toBe(10000);

    // dryRun must not write deliveries.
    const after = await app.inject({ method: 'GET', url: '/comms/deliveries', headers: h });
    expect(after.statusCode).toBe(200);
    expect((after.json() as { data: unknown[] }).data).toHaveLength(0);

    // Real run records a reminder_run + deliveries.
    const send = await app.inject({ method: 'POST', url: '/comms/reminders/fee', headers: h, payload: {} });
    expect(send.statusCode).toBe(200);
    const sendJson = send.json() as { data: { kind: string; targetCount: number; sentCount: number }; deliveries: { sent: number } };
    expect(sendJson.data.kind).toBe('fee');
    expect(sendJson.data.sentCount).toBe(1);

    const runs = await app.inject({ method: 'GET', url: '/comms/reminders', headers: h });
    expect(runs.statusCode).toBe(200);
    expect((runs.json() as { data: unknown[] }).data).toHaveLength(1);
  });

  it('Teacher announce ok; Parent announce 403; anon 401', async () => {
    const admin = await signupSchool(app, { email: 'role-admin@example.com', schoolName: 'Role School' });
    const teacherSignup = await signupSchool(app, { email: 'role-teacher@example.com', schoolName: 'Teacher Home' });
    await addMembership(teacherSignup.user.id, admin.tenant.id, 'Teacher');
    const teacherToken = await loginAs(app, 'role-teacher@example.com', 'password123');

    const parentSignup = await signupSchool(app, { email: 'role-parent@example.com', schoolName: 'Parent Home' });
    await addMembership(parentSignup.user.id, admin.tenant.id, 'Parent');
    const parentToken = await loginAs(app, 'role-parent@example.com', 'password123');

    const payload = { title: 'Teacher notice board', body: 'Reminder: PTM tomorrow at 10am sharp.', audience: 'All Parents' };

    const teacherRes = await app.inject({
      method: 'POST',
      url: '/comms/announce',
      headers: auth(teacherToken, admin.tenant.slug),
      payload,
    });
    expect(teacherRes.statusCode).toBe(201);

    const parentRes = await app.inject({
      method: 'POST',
      url: '/comms/announce',
      headers: auth(parentToken, admin.tenant.slug),
      payload,
    });
    expect(parentRes.statusCode).toBe(403);

    const anon = await app.inject({
      method: 'POST',
      url: '/comms/announce',
      headers: { 'x-tenant-slug': admin.tenant.slug },
      payload,
    });
    expect(anon.statusCode).toBe(401);

    const anonGet = await app.inject({ method: 'GET', url: '/comms/templates', headers: { 'x-tenant-slug': admin.tenant.slug } });
    expect(anonGet.statusCode).toBe(401);
  });
});

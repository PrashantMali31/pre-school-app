import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, loginAs, setupTestDB, signupSchool, truncateAll } from './helper';

function auth(token: string, slug: string) {
  return { authorization: `Bearer ${token}`, 'x-tenant-slug': slug };
}

async function ensurePaymentsTable(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
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
    await pool.query(`CREATE INDEX IF NOT EXISTS "payments_tenant_idx" ON "payments" ("tenant_id")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "payments_invoice_idx" ON "payments" ("invoice_id")`);
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
  name: 'Fee Kid',
  age: 4,
  dob: '2021-05-01',
  gender: 'Girl',
  parent: 'Fee Parent',
  phone: '+911234567890',
  joinedAt: '2026-09-01',
};

async function setupInvoice(app: FastifyInstance, token: string, slug: string, amount = 100) {
  const cls = await app.inject({ method: 'POST', url: '/classes', headers: auth(token, slug), payload: { name: 'Fee Class', capacity: 20 } });
  expect(cls.statusCode).toBe(201);
  const stu = await app.inject({ method: 'POST', url: '/students', headers: auth(token, slug), payload: studentPayload });
  expect(stu.statusCode).toBe(201);
  const studentId = (stu.json() as { data: { id: string } }).data.id;
  const inv = await app.inject({
    method: 'POST', url: '/invoices', headers: auth(token, slug),
    payload: { studentId, title: 'Term Fee', amount, dueDate: '2026-10-01', issuedAt: '2026-09-01' },
  });
  expect(inv.statusCode).toBe(201);
  const invoice = (inv.json() as { data: { id: string; amountCents: number } }).data;
  return { studentId, invoice };
}

describe('payments: partials, voids, guards', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    await ensurePaymentsTable();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    app = buildTestApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
    await ensurePaymentsTable();
  });

  it('partial then full payment flips status to paid; overpayment rejected', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'pay-admin@example.com', schoolName: 'Pay School' });
    const h = auth(token, tenant.slug);
    const { invoice } = await setupInvoice(app, token, tenant.slug, 100);
    const total = 10000;

    const p1 = await app.inject({
      method: 'POST', url: '/payments', headers: h,
      payload: { invoiceId: invoice.id, amountCents: 4000, method: 'UPI', receivedAt: '2026-09-10' },
    });
    expect(p1.statusCode).toBe(201);
    const b1 = p1.json() as { data: { balanceCents: number; totalPaidCents: number } };
    expect(b1.data.totalPaidCents).toBe(4000);
    expect(b1.data.balanceCents).toBe(total - 4000);

    const list1 = await app.inject({ method: 'GET', url: `/payments/invoice/${invoice.id}`, headers: h });
    expect(list1.statusCode).toBe(200);
    expect(list1.json()).toMatchObject({ totalPaidCents: 4000, balanceCents: total - 4000 });

    const over = await app.inject({
      method: 'POST', url: '/payments', headers: h,
      payload: { invoiceId: invoice.id, amountCents: 7000, method: 'Cash', receivedAt: '2026-09-11' },
    });
    expect(over.statusCode).toBe(400);
    expect(over.json()).toMatchObject({ error: { code: 'OVERPAYMENT' } });

    const p2 = await app.inject({
      method: 'POST', url: '/payments', headers: h,
      payload: { invoiceId: invoice.id, amountCents: 6000, method: 'Cash', reference: 'TXN123', receivedAt: '2026-09-11' },
    });
    expect(p2.statusCode).toBe(201);
    expect(p2.json()).toMatchObject({ data: { balanceCents: 0 } });

    const list2 = await app.inject({ method: 'GET', url: `/payments/invoice/${invoice.id}`, headers: h });
    expect(list2.json()).toMatchObject({ totalPaidCents: total, balanceCents: 0 });

    const invList = await app.inject({ method: 'GET', url: '/invoices', headers: h });
    const found = (invList.json() as { data: Array<{ id: string; status: string }> }).data.find((r) => r.id === invoice.id);
    expect(found?.status).toBe('paid');
  });

  it('void restores balance and reverts status; bad uuids 400; missing 404', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'void-admin@example.com', schoolName: 'Void School' });
    const h = auth(token, tenant.slug);
    const { invoice } = await setupInvoice(app, token, tenant.slug, 50);

    const p = await app.inject({
      method: 'POST', url: '/payments', headers: h,
      payload: { invoiceId: invoice.id, amountCents: 5000, method: 'Card', receivedAt: '2026-09-10' },
    });
    expect(p.statusCode).toBe(201);
    const pid = (p.json() as { data: { id: string } }).data.id;

    const bad = await app.inject({ method: 'GET', url: '/payments/invoice/not-a-uuid', headers: h });
    expect(bad.statusCode).toBe(400);

    const miss = await app.inject({ method: 'GET', url: '/payments/invoice/00000000-0000-4000-8000-000000000000', headers: h });
    expect(miss.statusCode).toBe(404);

    const v = await app.inject({ method: 'POST', url: `/payments/${pid}/void`, headers: h, payload: { reason: 'entered twice' } });
    expect(v.statusCode).toBe(200);
    expect(v.json()).toMatchObject({ ok: true });

    const after = await app.inject({ method: 'GET', url: `/payments/invoice/${invoice.id}`, headers: h });
    expect(after.json()).toMatchObject({ totalPaidCents: 0, balanceCents: 5000 });

    const invList = await app.inject({ method: 'GET', url: '/invoices', headers: h });
    const found = (invList.json() as { data: Array<{ id: string; status: string }> }).data.find((r) => r.id === invoice.id);
    expect(found?.status).not.toBe('paid');

    const vmiss = await app.inject({ method: 'POST', url: '/payments/00000000-0000-4000-8000-000000000000/void', headers: h, payload: {} });
    expect(vmiss.statusCode).toBe(404);
  });

  it('cross-tenant invoice rejected; non-admin cannot write but can read', async () => {
    const a = await signupSchool(app, { email: 'pay-a@example.com', schoolName: 'Pay Tenant A' });
    const b = await signupSchool(app, { email: 'pay-b@example.com', schoolName: 'Pay Tenant B' });
    const { invoice } = await setupInvoice(app, a.token, a.tenant.slug, 80);

    const cross = await app.inject({
      method: 'POST', url: '/payments', headers: auth(b.token, b.tenant.slug),
      payload: { invoiceId: invoice.id, amountCents: 1000, method: 'UPI', receivedAt: '2026-09-10' },
    });
    expect([400, 403, 404]).toContain(cross.statusCode);
    if (cross.statusCode === 400) expect(cross.json()).toMatchObject({ error: { code: 'CROSS_TENANT' } });

    const crossGet = await app.inject({ method: 'GET', url: `/payments/invoice/${invoice.id}`, headers: auth(b.token, b.tenant.slug) });
    expect([403, 404]).toContain(crossGet.statusCode);

    const teacherSignup = await signupSchool(app, { email: 'pay-teacher@example.com', schoolName: 'Teacher Home' });
    await addMembership(teacherSignup.user.id, a.tenant.id, 'Teacher');
    const teacherToken = await loginAs(app, 'pay-teacher@example.com', 'password123');
    const th = auth(teacherToken, a.tenant.slug);

    const denied = await app.inject({
      method: 'POST', url: '/payments', headers: th,
      payload: { invoiceId: invoice.id, amountCents: 1000, method: 'UPI', receivedAt: '2026-09-10' },
    });
    expect(denied.statusCode).toBe(403);

    const ok = await app.inject({ method: 'GET', url: `/payments/invoice/${invoice.id}`, headers: th });
    expect(ok.statusCode).toBe(200);

    const anon = await app.inject({ method: 'GET', url: `/payments/invoice/${invoice.id}`, headers: { 'x-tenant-slug': a.tenant.slug } });
    expect(anon.statusCode).toBe(401);
  });
});

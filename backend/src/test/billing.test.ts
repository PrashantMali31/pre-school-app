import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, setupTestDB, signupSchool, truncateAll } from './helper';

function auth(token: string, slug: string) {
  return { authorization: `Bearer ${token}`, 'x-tenant-slug': slug };
}

/** Billing tables IF NOT EXISTS so the suite is self-sufficient (same pattern as safety.test.ts). */
async function ensureBillingTables(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`DO $$ BEGIN CREATE TYPE "subscription_status" AS ENUM('active', 'past_due', 'canceled', 'expired'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await pool.query(`DO $$ BEGIN CREATE TYPE "billing_cycle" AS ENUM('monthly', 'yearly', 'custom'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await pool.query(`DO $$ BEGIN CREATE TYPE "billing_payment_status" AS ENUM('paid', 'failed', 'pending'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "subscription_plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" text NOT NULL UNIQUE,
        "name" text NOT NULL,
        "tagline" text NOT NULL DEFAULT '',
        "price_monthly_cents" integer NOT NULL DEFAULT 0,
        "price_yearly_cents" integer,
        "max_students" integer,
        "max_teachers" integer,
        "features" text[] NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "updated_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "plan_id" uuid NOT NULL REFERENCES "subscription_plans"("id"),
        "status" "subscription_status" NOT NULL DEFAULT 'active',
        "cycle" "billing_cycle" NOT NULL DEFAULT 'monthly',
        "period_start" timestamptz DEFAULT now() NOT NULL,
        "period_end" timestamptz,
        "canceled_at" timestamptz,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "updated_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "subscriptions_tenant_idx" ON "subscriptions" ("tenant_id")`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "billing_payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "subscription_id" uuid REFERENCES "subscriptions"("id") ON DELETE SET NULL,
        "amount_cents" integer NOT NULL,
        "currency" text NOT NULL DEFAULT 'INR',
        "kind" text NOT NULL DEFAULT 'subscription',
        "status" "billing_payment_status" NOT NULL DEFAULT 'paid',
        "provider" text NOT NULL DEFAULT 'test',
        "provider_ref" text,
        "period_start" timestamptz,
        "period_end" timestamptz,
        "paid_at" timestamptz,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
  } finally {
    await pool.end();
  }
}

async function seedPlans(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`INSERT INTO "subscription_plans" (code, name, price_monthly_cents, price_yearly_cents, max_students, max_teachers, features, sort)
      VALUES ('starter','Starter',0,0,50,5,'{"Up to 50 students"}',0),
             ('pro','Pro',99900,999900,500,50,'{"Everything"}',1),
             ('enterprise','Enterprise',0,NULL,NULL,NULL,'{"Custom"}',2)
      ON CONFLICT (code) DO NOTHING`);
  } finally {
    await pool.end();
  }
}

describe('billing', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    await ensureBillingTables();
    app = buildTestApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedPlans();
  });

  it('signup auto-creates an active Starter subscription', async () => {
    const { token, tenant } = await signupSchool(app);
    const res = await app.inject({ method: 'GET', url: '/billing/subscription', headers: auth(token, tenant.slug) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { status: string; plan: { code: string }; periodEnd: null } };
    expect(body.data.status).toBe('active');
    expect(body.data.plan.code).toBe('starter');
    expect(body.data.periodEnd).toBeNull();
  });

  it('lists the plan catalog for any authed user', async () => {
    const { token } = await signupSchool(app);
    const res = await app.inject({ method: 'GET', url: '/billing/plans', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const codes = (res.json() as { data: Array<{ code: string }> }).data.map((p) => p.code);
    expect(codes).toEqual(['starter', 'pro', 'enterprise']);
  });

  it('subscribe to Pro charges ₹999, cancels Starter, syncs the tenant label', async () => {
    const { token, tenant } = await signupSchool(app);
    const res = await app.inject({
      method: 'POST', url: '/billing/subscribe', headers: auth(token, tenant.slug),
      payload: { planCode: 'pro', cycle: 'monthly' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { status: string; plan: { code: string } }; payment: { amountCents: number; status: string; provider: string } };
    expect(body.data.plan.code).toBe('pro');
    expect(body.payment.amountCents).toBe(99900);
    expect(body.payment.status).toBe('paid');
    expect(body.payment.provider).toBe('test');

    const hist = await app.inject({ method: 'GET', url: '/billing/history', headers: auth(token, tenant.slug) });
    const h = hist.json() as { data: Array<{ kind: string; amountCents: number }>; totalPaidCents: number };
    expect(h.data.map((p) => p.kind).sort()).toEqual(['plan_change', 'subscription']);
    expect(h.totalPaidCents).toBe(99900); // starter was ₹0

    // idempotent re-subscribe: no new charge
    const again = await app.inject({
      method: 'POST', url: '/billing/subscribe', headers: auth(token, tenant.slug),
      payload: { planCode: 'pro', cycle: 'monthly' },
    });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { message: string }).message).toMatch(/Already on this plan/);
    const hist2 = await app.inject({ method: 'GET', url: '/billing/history', headers: auth(token, tenant.slug) });
    expect((hist2.json() as { data: unknown[] }).data).toHaveLength(2);
  });

  it('rejects invalid plan/cycle combos', async () => {
    const { token, tenant } = await signupSchool(app);
    const bad1 = await app.inject({ method: 'POST', url: '/billing/subscribe', headers: auth(token, tenant.slug), payload: { planCode: 'starter', cycle: 'yearly' } });
    expect(bad1.statusCode).toBe(400);
    const bad2 = await app.inject({ method: 'POST', url: '/billing/subscribe', headers: auth(token, tenant.slug), payload: { planCode: 'enterprise', cycle: 'monthly' } });
    expect(bad2.statusCode).toBe(400);
  });

  it('renew extends the period; simulated failure flips to past_due', async () => {
    const { token, tenant } = await signupSchool(app);
    await app.inject({ method: 'POST', url: '/billing/subscribe', headers: auth(token, tenant.slug), payload: { planCode: 'pro', cycle: 'monthly' } });
    const before = (await app.inject({ method: 'GET', url: '/billing/subscription', headers: auth(token, tenant.slug) }).then((r) => r.json())) as { data: { periodEnd: string } };

    const ok = await app.inject({ method: 'POST', url: '/billing/renew', headers: auth(token, tenant.slug), payload: {} });
    expect(ok.statusCode).toBe(200);
    const after = (ok.json() as { data: { status: string; periodEnd: string } }).data;
    expect(after.status).toBe('active');
    expect(new Date(after.periodEnd).getTime()).toBeGreaterThan(new Date(before.data.periodEnd).getTime());

    const fail = await app.inject({ method: 'POST', url: '/billing/renew', headers: auth(token, tenant.slug), payload: { simulate: 'fail' } });
    expect(fail.statusCode).toBe(200);
    const f = fail.json() as { data: { status: string }; payment: { status: string } };
    expect(f.data.status).toBe('past_due');
    expect(f.payment.status).toBe('failed');
  });

  it('cancel ends service at period end; double-cancel is rejected', async () => {
    const { token, tenant } = await signupSchool(app);
    await app.inject({ method: 'POST', url: '/billing/subscribe', headers: auth(token, tenant.slug), payload: { planCode: 'pro', cycle: 'monthly' } });
    const c = await app.inject({ method: 'POST', url: '/billing/cancel', headers: auth(token, tenant.slug) });
    expect(c.statusCode).toBe(200);
    expect((c.json() as { data: { status: string } }).data.status).toBe('canceled');
    const c2 = await app.inject({ method: 'POST', url: '/billing/cancel', headers: auth(token, tenant.slug) });
    expect(c2.statusCode).toBe(400);
  });

  it('platform overview is owner-gated and reports MRR + mix', async () => {
    const a = await signupSchool(app);
    const b = await signupSchool(app);
    await app.inject({ method: 'POST', url: '/billing/subscribe', headers: auth(b.token, b.tenant.slug), payload: { planCode: 'pro', cycle: 'monthly' } });

    const denied = await app.inject({ method: 'GET', url: '/billing/platform/overview', headers: { authorization: `Bearer ${a.token}` } });
    expect(denied.statusCode).toBe(403);

    process.env.PLATFORM_OWNER_EMAILS = a.user.email;
    const ok = await app.inject({ method: 'GET', url: '/billing/platform/overview', headers: { authorization: `Bearer ${a.token}` } });
    expect(ok.statusCode).toBe(200);
    const data = (ok.json() as { data: { mrrCents: number; activeSubscriptions: number; planMix: Array<{ code: string; count: number }> } }).data;
    expect(data.activeSubscriptions).toBe(2);
    expect(data.mrrCents).toBe(99900);
    expect(data.planMix.find((m) => m.code === 'pro')?.count).toBe(1);
    delete process.env.PLATFORM_OWNER_EMAILS;
  });
});

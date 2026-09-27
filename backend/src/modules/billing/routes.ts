import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client';
import { billingPayments, subscriptionPlans, subscriptions, tenants } from '../../db/schema';
import { requireAuth, resolveTenant, requireRole, tenantOf } from '../../middlewares/tenant';

/* ------------------------------------------------------------------ */
/* Subscription billing (test mode).                                   */
/*                                                                     */
/* Plans are a seeded catalog (see src/db/seed-billing.ts). Each       */
/* tenant rides one subscription; history is kept as rows (we never    */
/* UPDATE a subscription into a different plan — we cancel + insert).  */
/* Money is simulated: every charge writes a `paid` ledger row with    */
/* provider 'test'. A real gateway later only needs provider + webhook */
/* handling around the same rows.                                      */
/*                                                                     */
/* Expiry is lazy (no cron): reads finalize a lapsed canceled/past_due */
/* subscription to `expired` and drop the tenant back to Starter.      */
/* Platform revenue is gated by PLATFORM_OWNER_EMAILS (comma-separated */
/* login emails) — there is no superadmin role in the data model.      */
/* ------------------------------------------------------------------ */

type Plan = typeof subscriptionPlans.$inferSelect;
type Sub = typeof subscriptions.$inferSelect;

const CYCLES = ['monthly', 'yearly', 'custom'] as const;

function addMonths(d: Date, n: number): Date {
  const c = new Date(d);
  c.setMonth(c.getMonth() + n);
  return c;
}

function addYears(d: Date, n: number): Date {
  const c = new Date(d);
  c.setFullYear(c.getFullYear() + n);
  return c;
}

/** Charge for one period in paise. Custom/quote plans bill ₹0 (offline invoicing). */
function priceFor(plan: Plan, cycle: string): number {
  if (cycle === 'yearly') return plan.priceYearlyCents ?? 0;
  return plan.priceMonthlyCents;
}

/** Period end for a cycle starting at `from`. Null = never expires (free). */
function periodEndFor(plan: Plan, cycle: string, from: Date): Date | null {
  const amount = priceFor(plan, cycle);
  if (amount <= 0) return null;
  return cycle === 'yearly' ? addYears(from, 1) : addMonths(from, 1);
}

function planLabel(code: string): 'Starter' | 'Pro' | 'Enterprise' {
  return code === 'pro' ? 'Pro' : code === 'enterprise' ? 'Enterprise' : 'Starter';
}

/** Latest subscription row for a tenant (history preserved, newest first). */
async function latestSub(tenantId: string): Promise<(Sub & { plan: Plan }) | null> {
  const row = await db
    .select({ sub: subscriptions, plan: subscriptionPlans })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)
    .then((r) => r[0]);
  return row ? { ...row.sub, plan: row.plan } : null;
}

/** Lazy expiry: a lapsed canceled/past_due subscription becomes `expired`
 *  and the tenant label drops back to Starter. Returns the (maybe updated) row. */
async function withExpiry(cur: (Sub & { plan: Plan }) | null): Promise<(Sub & { plan: Plan }) | null> {
  if (!cur) return null;
  if ((cur.status === 'canceled' || cur.status === 'past_due') && cur.periodEnd && new Date(cur.periodEnd) < new Date()) {
    const [updated] = await db.update(subscriptions).set({ status: 'expired' }).where(eq(subscriptions.id, cur.id)).returning();
    await db.update(tenants).set({ plan: 'Starter' }).where(eq(tenants.id, cur.tenantId));
    return { ...updated, plan: cur.plan };
  }
  return cur;
}

/** Shared starter for signup / create-school / backfill paths. */
export async function startSubscription(tenantId: string, planCode: string, cycle: string, userId?: string) {
  const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, planCode)).then((r) => r[0]);
  if (!plan) throw new Error(`Unknown plan: ${planCode}`);
  const now = new Date();
  const [sub] = await db
    .insert(subscriptions)
    .values({ tenantId, planId: plan.id, status: 'active', cycle: cycle as Sub['cycle'], periodStart: now, periodEnd: periodEndFor(plan, cycle, now) })
    .returning();
  const amount = priceFor(plan, cycle);
  const [payment] = await db
    .insert(billingPayments)
    .values({
      tenantId,
      subscriptionId: sub.id,
      amountCents: amount,
      currency: 'INR',
      kind: 'subscription',
      status: 'paid',
      provider: 'test',
      providerRef: `test_${crypto.randomBytes(8).toString('hex')}`,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
      paidAt: now,
      createdBy: userId ?? null,
    })
    .returning();
  await db.update(tenants).set({ plan: planLabel(plan.code) }).where(eq(tenants.id, tenantId));
  return { sub: { ...sub, plan }, payment };
}

function ownerEmails(): string[] {
  return (process.env.PLATFORM_OWNER_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function billingRoutes(app: FastifyInstance) {
  // Plan catalog — any logged-in user (no tenant needed; used pre-subscribe).
  app.get('/plans', { preHandler: requireAuth }, async () => {
    const rows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(subscriptionPlans.sort);
    return { data: rows };
  });

  // Current subscription (+ plan) for this school. Any member can view.
  app.get('/subscription', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const cur = await withExpiry(await latestSub(t.id));
    if (!cur) return { data: null };
    return { data: { ...cur, plan: cur.plan } };
  });

  // Subscribe / change plan — Admin. Idempotent for the same active plan+cycle.
  app.post('/subscribe', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({ planCode: z.enum(['starter', 'pro', 'enterprise']), cycle: z.enum(CYCLES) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const { planCode, cycle } = parsed.data;
    if (planCode === 'starter' && cycle !== 'monthly')
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Starter is monthly only.' } });
    if (planCode === 'enterprise' && cycle !== 'custom')
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Enterprise is custom-billed — pick the custom cycle.' } });
    const t = tenantOf(req);
    const userId = (req.user as { sub: string }).sub;
    const plan = await db.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.code, planCode), eq(subscriptionPlans.isActive, true))).then((r) => r[0]);
    if (!plan) return reply.code(404).send({ error: { code: 'PLAN_NOT_FOUND', message: 'Plan not found.' } });
    if (cycle === 'yearly' && plan.priceYearlyCents == null)
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Yearly billing is not available for this plan.' } });

    const cur = await withExpiry(await latestSub(t.id));
    if (cur && cur.status === 'active' && cur.plan.code === planCode && cur.cycle === cycle) {
      return { data: cur, message: 'Already on this plan.' };
    }
    if (cur && cur.status !== 'expired') {
      await db.update(subscriptions).set({ status: 'canceled', canceledAt: new Date() }).where(eq(subscriptions.id, cur.id));
    }
    const now = new Date();
    const [sub] = await db
      .insert(subscriptions)
      .values({ tenantId: t.id, planId: plan.id, status: 'active', cycle, periodStart: now, periodEnd: periodEndFor(plan, cycle, now) })
      .returning();
    const amount = priceFor(plan, cycle);
    const [payment] = await db
      .insert(billingPayments)
      .values({
        tenantId: t.id,
        subscriptionId: sub.id,
        amountCents: amount,
        currency: 'INR',
        kind: cur ? 'plan_change' : 'subscription',
        status: 'paid',
        provider: 'test',
        providerRef: `test_${crypto.randomBytes(8).toString('hex')}`,
        periodStart: sub.periodStart,
        periodEnd: sub.periodEnd,
        paidAt: now,
        createdBy: userId,
      })
      .returning();
    await db.update(tenants).set({ plan: planLabel(plan.code) }).where(eq(tenants.id, t.id));
    return reply.code(201).send({ data: { ...sub, plan }, payment });
  });

  // Cancel at end of current period (service continues till periodEnd) — Admin.
  app.post('/cancel', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const t = tenantOf(req);
    const cur = await withExpiry(await latestSub(t.id));
    if (!cur || cur.status === 'expired' || cur.status === 'canceled')
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'No active subscription to cancel.' } });
    const [updated] = await db.update(subscriptions).set({ status: 'canceled', canceledAt: new Date() }).where(eq(subscriptions.id, cur.id)).returning();
    return { data: { ...updated, plan: cur.plan } };
  });

  // Renew for another period — Admin. Test-mode `simulate: 'fail'` records a
  // failed charge and flips to past_due (lets the UI prove dunning). Canceled
  // subscriptions must resubscribe instead of renewing.
  app.post('/renew', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({ simulate: z.enum(['success', 'fail']).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const userId = (req.user as { sub: string }).sub;
    const cur = await withExpiry(await latestSub(t.id));
    if (!cur || cur.status === 'canceled')
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'No renewable subscription — subscribe to a plan first.' } });
    if (cur.periodEnd == null) return { data: { ...cur, plan: cur.plan }, message: 'Free plan never expires — nothing to renew.' };
    const now = new Date();
    const base = new Date(cur.periodEnd) > now ? new Date(cur.periodEnd) : now;
    const end = cur.cycle === 'yearly' ? addYears(base, 1) : addMonths(base, 1);
    const amount = priceFor(cur.plan, cur.cycle);
    if (parsed.data.simulate === 'fail') {
      const [failed] = await db
        .insert(billingPayments)
        .values({ tenantId: t.id, subscriptionId: cur.id, amountCents: amount, currency: 'INR', kind: 'renewal', status: 'failed', provider: 'test', providerRef: `test_${crypto.randomBytes(8).toString('hex')}`, periodStart: base, periodEnd: end, createdBy: userId })
        .returning();
      const [updated] = await db.update(subscriptions).set({ status: 'past_due' }).where(eq(subscriptions.id, cur.id)).returning();
      return { data: { ...updated, plan: cur.plan }, payment: failed, message: 'Test charge failed — subscription is past due.' };
    }
    const [payment] = await db
      .insert(billingPayments)
      .values({ tenantId: t.id, subscriptionId: cur.id, amountCents: amount, currency: 'INR', kind: 'renewal', status: 'paid', provider: 'test', providerRef: `test_${crypto.randomBytes(8).toString('hex')}`, periodStart: base, periodEnd: end, paidAt: now, createdBy: userId })
      .returning();
    const [updated] = await db.update(subscriptions).set({ status: 'active', periodEnd: end }).where(eq(subscriptions.id, cur.id)).returning();
    await db.update(tenants).set({ plan: planLabel(cur.plan.code) }).where(eq(tenants.id, t.id));
    return { data: { ...updated, plan: cur.plan }, payment };
  });

  // Billing history (ledger) — Admin.
  app.get('/history', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req) => {
    const t = tenantOf(req);
    const rows = await db.select().from(billingPayments).where(eq(billingPayments.tenantId, t.id)).orderBy(desc(billingPayments.createdAt)).limit(100);
    const totalPaid = rows.filter((r) => r.status === 'paid').reduce((a, r) => a + r.amountCents, 0);
    return { data: rows, totalPaidCents: totalPaid };
  });

  // Platform revenue — SaaS owner only (PLATFORM_OWNER_EMAILS allowlist).
  app.get('/platform/overview', { preHandler: requireAuth }, async (req, reply) => {
    const email = ((req.user as { email?: string }).email ?? '').toLowerCase();
    if (!ownerEmails().includes(email))
      return reply.code(403).send({ error: { code: 'PLATFORM_ONLY', message: 'Platform revenue is visible to the SaaS owner only.' } });
    const all = await db
      .select({ sub: subscriptions, plan: subscriptionPlans, tenant: tenants })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .innerJoin(tenants, eq(subscriptions.tenantId, tenants.id))
      .orderBy(desc(subscriptions.createdAt));
    // Newest row per tenant wins (history preserved).
    const seen = new Set<string>();
    const current = all.filter((r) => (seen.has(r.tenant.id) ? false : (seen.add(r.tenant.id), true)));
    const active = current.filter((r) => r.sub.status === 'active');
    const mrrFor = (plan: Plan, cycle: string) =>
      cycle === 'yearly' ? Math.round((plan.priceYearlyCents ?? 0) / 12) : plan.priceMonthlyCents;
    const mrrCents = active.reduce((a, r) => a + mrrFor(r.plan, r.sub.cycle), 0);
    const mix = new Map<string, { code: string; name: string; count: number; mrrCents: number }>();
    for (const r of active) {
      const m = mix.get(r.plan.code) ?? { code: r.plan.code, name: r.plan.name, count: 0, mrrCents: 0 };
      m.count += 1;
      m.mrrCents += mrrFor(r.plan, r.sub.cycle);
      mix.set(r.plan.code, m);
    }
    const recent = await db
      .select({ p: billingPayments, tenant: tenants })
      .from(billingPayments)
      .innerJoin(tenants, eq(billingPayments.tenantId, tenants.id))
      .orderBy(desc(billingPayments.createdAt))
      .limit(10);
    return {
      data: {
        mrrCents,
        activeSubscriptions: active.length,
        pastDue: current.filter((r) => r.sub.status === 'past_due').length,
        canceled: current.filter((r) => r.sub.status === 'canceled').length,
        expired: current.filter((r) => r.sub.status === 'expired').length,
        totalTenants: current.length,
        planMix: [...mix.values()],
        recentPayments: recent.map((r) => ({ ...r.p, tenantSlug: r.tenant.slug, tenantName: r.tenant.name })),
      },
    };
  });
}

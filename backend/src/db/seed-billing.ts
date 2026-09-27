import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { subscriptionPlans, subscriptions, tenants } from './schema';

/** Plan catalog: Starter free, Pro ₹999/mo (₹9,999/yr), Enterprise custom. */
const PLANS = [
  {
    code: 'starter',
    name: 'Starter',
    tagline: 'For getting started',
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    maxStudents: 50,
    maxTeachers: 5,
    features: ['Up to 50 students', 'Up to 5 teachers', 'Attendance & events', 'Announcements', 'Parent portal'],
    sort: 0,
  },
  {
    code: 'pro',
    name: 'Pro',
    tagline: 'For growing schools',
    priceMonthlyCents: 99900,
    priceYearlyCents: 999900,
    maxStudents: 500,
    maxTeachers: 50,
    features: [
      'Everything in Starter',
      'Up to 500 students & 50 teachers',
      'Fees & billing with receipts',
      'Safety suite: pickup PIN, incidents, transport',
      'Staff leave & payroll',
      'Reports & audit log',
    ],
    sort: 1,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    tagline: 'For groups & chains',
    priceMonthlyCents: 0,
    priceYearlyCents: null as number | null,
    maxStudents: null as number | null,
    maxTeachers: null as number | null,
    features: ['Everything in Pro', 'Unlimited students & staff', 'Priority support', 'Onboarding & migration help'],
    sort: 2,
  },
];

async function main() {
  for (const p of PLANS) {
    const existing = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, p.code)).then((r) => r[0]);
    if (!existing) {
      await db.insert(subscriptionPlans).values(p);
      console.log(`plan created: ${p.code}`);
    } else {
      await db
        .update(subscriptionPlans)
        .set({ name: p.name, tagline: p.tagline, priceMonthlyCents: p.priceMonthlyCents, priceYearlyCents: p.priceYearlyCents, maxStudents: p.maxStudents, maxTeachers: p.maxTeachers, features: p.features, sort: p.sort, isActive: true })
        .where(eq(subscriptionPlans.id, existing.id));
      console.log(`plan updated: ${p.code}`);
    }
  }
  // Backfill: every tenant without a subscription rides free Starter (never expires).
  const starter = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, 'starter')).then((r) => r[0]);
  const allTenants = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants);
  for (const t of allTenants) {
    const sub = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, t.id)).then((r) => r[0]);
    if (!sub) {
      await db.insert(subscriptions).values({ tenantId: t.id, planId: starter.id, status: 'active', cycle: 'monthly', periodStart: new Date(), periodEnd: null });
      await db.update(tenants).set({ plan: 'Starter' }).where(eq(tenants.id, t.id));
      console.log(`starter subscription backfilled: ${t.slug}`);
    }
  }
  console.log('billing seed done');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

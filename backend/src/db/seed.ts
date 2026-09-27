import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { classes, memberships, schoolOptions, schoolProfiles, students, teachers, tenants, users } from './schema';
import { hashPassword, slugify } from '../utils/security';
import { DEFAULT_OPTIONS } from '../utils/defaults';

const DEMOS = [
  { slug: 'little-sprouts', name: 'Little Sprouts', tagline: 'Where little minds bloom', plan: 'Pro' as const, adminName: 'Meera Krishnan', adminEmail: 'demo@little-sprouts.in' },
  { slug: 'sunshine-kids', name: 'Sunshine Kids', tagline: 'Play. Learn. Shine.', plan: 'Starter' as const, adminName: 'Lakshmi Venkat', adminEmail: 'demo@sunshine-kids.in' },
  { slug: 'rainbow-preschool', name: 'Rainbow Preschool', tagline: 'Every colour of childhood', plan: 'Enterprise' as const, adminName: 'Anita Desai', adminEmail: 'demo@rainbow-preschool.in' },
];

const CLASS_DEFS = [
  { name: 'Tiny Tots', ageGroup: '1.5 – 2.5 yrs', capacity: 20, color: '#FF8FB1', room: 'Room A · Sunflower', time: '9:00 – 11:30 AM' },
  { name: 'Little Explorers', ageGroup: '2.5 – 3.5 yrs', capacity: 22, color: '#7C9DFF', room: 'Room B · Rainbow', time: '9:00 – 12:00 PM' },
  { name: 'Curious Cubs', ageGroup: '3.5 – 4.5 yrs', capacity: 24, color: '#4ADE80', room: 'Room C · Jungle', time: '8:30 – 12:30 PM' },
  { name: 'Flying Foxes (UKG)', ageGroup: '4.5 – 6 yrs', capacity: 25, color: '#FB923C', room: 'Room D · Sky', time: '8:30 – 1:00 PM' },
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Refusing to seed demo data in production');
  }
  // Demo logins password — override with DEMO_PASSWORD env (see backend/.env.example). Local only.
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD ?? 'sprouts123');
  for (const d of DEMOS) {
    const slug = slugify(d.slug);
    let tenant = await db.select().from(tenants).where(eq(tenants.slug, slug)).then((r) => r[0]);
    if (!tenant) {
      tenant = await db.insert(tenants).values({ slug, name: d.name, tagline: d.tagline, plan: d.plan, demo: true }).returning().then((r) => r[0]);
      console.log(`tenant created: ${slug}`);
    }
    const profile = await db.select().from(schoolProfiles).where(eq(schoolProfiles.tenantId, tenant.id)).then((r) => r[0]);
    if (!profile) await db.insert(schoolProfiles).values({ tenantId: tenant.id, name: d.name, tagline: d.tagline, phone: '+91 98765 43210', email: `hello@${slug}.in`, address: '42 Rainbow Street', principal: d.adminName });
    const opts = await db.select().from(schoolOptions).where(eq(schoolOptions.tenantId, tenant.id)).then((r) => r[0]);
    if (!opts) await db.insert(schoolOptions).values({ tenantId: tenant.id, ...DEFAULT_OPTIONS });

    const existingClasses = await db.select().from(classes).where(eq(classes.tenantId, tenant.id));
    let classRows = existingClasses;
    if (classRows.length === 0) {
      classRows = await db.insert(classes).values(CLASS_DEFS.map((c) => ({ tenantId: tenant!.id, ...c }))).returning();
      console.log(`  classes seeded: ${classRows.length}`);
    }

    let user = await db.select().from(users).where(eq(users.email, d.adminEmail.toLowerCase())).then((r) => r[0]);
    if (!user) {
      user = await db.insert(users).values({ email: d.adminEmail.toLowerCase(), name: d.adminName, passwordHash }).returning().then((r) => r[0]);
      console.log(`  demo user: ${user.email}`);
    }
    const mem = await db.select().from(memberships).where(eq(memberships.userId, user.id)).then((r) => r.find((m) => m.tenantId === tenant!.id));
    if (!mem) await db.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: 'Admin' });

    // a couple of sample teachers/students if empty
    const tCount = await db.select().from(teachers).where(eq(teachers.tenantId, tenant.id)).then((r) => r.length);
    if (tCount === 0 && classRows.length > 0) {
      await db.insert(teachers).values([
        { tenantId: tenant.id, classId: classRows[0].id, name: 'Ananya Rao', role: 'Lead Educator', phone: '+91 98111 22334', email: `ananya@${slug}.in`, joinedAt: '2023-06-12' },
        { tenantId: tenant.id, classId: classRows[1].id, name: 'Priya Nair', role: 'Lead Educator', phone: '+91 98222 33445', email: `priya@${slug}.in`, joinedAt: '2022-07-01' },
      ]);
    }
    const sCount = await db.select().from(students).where(eq(students.tenantId, tenant.id)).then((r) => r.length);
    if (sCount === 0 && classRows.length > 1) {
      await db.insert(students).values([
        { tenantId: tenant.id, classId: classRows[1].id, name: 'Aarav Sharma', age: 3, dob: '2022-04-12', gender: 'Boy', parent: 'Rohit Sharma', phone: '+91 99001 11223', status: 'active', joinedAt: '2024-06-10' },
        { tenantId: tenant.id, classId: classRows[2].id, name: 'Diya Patel', age: 4, dob: '2021-11-03', gender: 'Girl', parent: 'Neha Patel', phone: '+91 99002 22334', status: 'active', joinedAt: '2024-06-12' },
      ]);
    }
  }
  console.log('seed done');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

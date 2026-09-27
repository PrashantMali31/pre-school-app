import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { buildApp } from '../app';

const TEST_JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxx';

// Authoritative app tables from src/db/schema.ts (no parent_links/invite_tokens present).
const TABLES = [
  'attendance_records',
  'attendance_days',
  'invoices',
  'events',
  'announcements',
  'enquiries',
  'students',
  'teachers',
  'classes',
  'school_options',
  'school_profiles',
  'memberships',
  'refresh_tokens',
  'password_resets',
  'tenants',
  'users',
  'parent_links',
  'invite_tokens',
  'payments',
  'message_deliveries',
  'reminder_runs',
  'audit_logs',
  'pickup_contacts',
  'pickup_log',
  'incidents',
  'timetable_slots',
  'bus_routes',
  'bus_stops',
  'leave_requests',
  'salary_structures',
  'payroll_runs',
  'payslips',
  'billing_payments',
  'subscriptions',
  'subscription_plans',
];

function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set (e.g. postgres://preschool:preschool@localhost:5434/preschool_test)');
  if (!url.includes('preschool_test')) throw new Error(`Refusing to run tests against non-test database: ${url}`);
  return url;
}

/** Called once per test file: asserts test DB URL, runs existing drizzle migrations into it. */
export async function setupTestDB(): Promise<void> {
  const url = testDatabaseUrl();
  // Ensure the shared src/db/client.ts pool (imported later) points at the test DB.
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool);
    // Resolve relative to this file so tests work regardless of cwd.
    await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  } finally {
    await pool.end();
  }
}

/** Called in beforeEach: empty all app tables, restart identities. Single statement + CASCADE so order is safe. */
export async function truncateAll(): Promise<void> {
  const url = testDatabaseUrl();
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  } finally {
    await pool.end();
  }
}

/** Fresh Fastify app (use app.inject() — no network port needed). */
export function buildTestApp(): FastifyInstance {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  return buildApp() as FastifyInstance;
}

let counter = 0;

/** Plan catalog rows that signup depends on (truncateAll wipes them). Idempotent. */
async function seedPlans(): Promise<void> {
  const pool = new Pool({ connectionString: testDatabaseUrl(), max: 1 });
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

export interface SignupResult {
  token: string;
  tenant: { id: string; slug: string; name?: string };
  user: { id: string; name: string; email: string };
}

export async function signupSchool(
  app: FastifyInstance,
  opts: { schoolName?: string; name?: string; email?: string; password?: string } = {}
): Promise<SignupResult> {
  await seedPlans();
  counter += 1;
  const uniq = `${Date.now()}-${counter}-${Math.floor(Math.random() * 1e6)}`;
  const body = {
    schoolName: opts.schoolName ?? `Test School ${uniq}`,
    name: opts.name ?? 'Test Admin',
    email: opts.email ?? `admin-${uniq}@example.com`,
    password: opts.password ?? 'password123',
  };
  const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: body });
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`signup failed (${res.statusCode}): ${res.body}`);
  }
  const json = res.json() as { accessToken: string; tenant: SignupResult['tenant']; user: SignupResult['user'] };
  return { token: json.accessToken, tenant: json.tenant, user: json.user };
}

/** Log in with email/password, return the access token. */
export async function loginAs(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  if (res.statusCode !== 200) {
    throw new Error(`login failed (${res.statusCode}): ${res.body}`);
  }
  return (res.json() as { accessToken: string }).accessToken;
}

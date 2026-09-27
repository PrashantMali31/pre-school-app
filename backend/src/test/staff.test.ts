import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, loginAs, setupTestDB, signupSchool, truncateAll } from './helper';

function auth(token: string, slug: string) {
  return { authorization: `Bearer ${token}`, 'x-tenant-slug': slug };
}

/** Create staff tables IF NOT EXISTS so the suite passes even before migrations run. */
async function ensureStaffTables(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "leave_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "teacher_id" uuid NOT NULL REFERENCES "teachers"("id") ON DELETE CASCADE,
        "kind" text NOT NULL,
        "from_date" date NOT NULL,
        "to_date" date NOT NULL,
        "days" integer NOT NULL,
        "reason" text NOT NULL DEFAULT '',
        "status" text NOT NULL DEFAULT 'pending',
        "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "decided_at" timestamptz,
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "leave_requests_tenant_idx" ON "leave_requests" ("tenant_id")`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "salary_structures" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "teacher_id" uuid NOT NULL REFERENCES "teachers"("id") ON DELETE CASCADE,
        "basic_cents" integer NOT NULL DEFAULT 0,
        "allowances_cents" integer NOT NULL DEFAULT 0,
        "effective_from" date NOT NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "updated_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "salary_structures_teacher_uq" UNIQUE ("teacher_id")
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "salary_structures_tenant_idx" ON "salary_structures" ("tenant_id")`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "payroll_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "month" text NOT NULL,
        "status" text NOT NULL DEFAULT 'draft',
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "payroll_runs_tenant_month_uq" UNIQUE ("tenant_id", "month")
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "payslips" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "run_id" uuid NOT NULL REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
        "teacher_id" uuid NOT NULL REFERENCES "teachers"("id") ON DELETE CASCADE,
        "basic_cents" integer NOT NULL,
        "allowances_cents" integer NOT NULL,
        "unpaid_leave_days" integer NOT NULL DEFAULT 0,
        "leave_deduction_cents" integer NOT NULL DEFAULT 0,
        "net_cents" integer NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "paid_at" timestamptz,
        "paid_method" text,
        "reference" text
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "payslips_run_idx" ON "payslips" ("run_id")`);
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

async function makeTeacher(app: FastifyInstance, token: string, slug: string, name = 'Staff Teacher') {
  const res = await app.inject({
    method: 'POST', url: '/teachers', headers: auth(token, slug),
    payload: { name, role: 'Teacher', phone: '+911234567890', joinedAt: '2026-09-01' },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { data: { id: string } }).data.id;
}

describe('staff leave + payroll', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    await ensureStaffTables();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    app = buildTestApp();
    await app.ready();
  });
  beforeEach(async () => {
    await ensureStaffTables();
    await truncateAll();
  });

  it('leave apply → approve → balance decrements; double-decide 409', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'leave-admin@example.com', schoolName: 'Leave School' });
    const h = auth(token, tenant.slug);
    const teacherId = await makeTeacher(app, token, tenant.slug);

    const applied = await app.inject({
      method: 'POST', url: '/staff/leaves', headers: h,
      payload: { teacherId, kind: 'sick', fromDate: '2026-09-10', toDate: '2026-09-12', reason: 'flu' },
    });
    expect(applied.statusCode).toBe(201);
    const leave = (applied.json() as { data: { id: string; days: number; status: string } }).data;
    expect(leave.days).toBe(3);
    expect(leave.status).toBe('pending');

    // BAD_RANGE guard.
    const badRange = await app.inject({
      method: 'POST', url: '/staff/leaves', headers: h,
      payload: { teacherId, kind: 'casual', fromDate: '2026-09-15', toDate: '2026-09-14' },
    });
    expect(badRange.statusCode).toBe(400);
    expect(badRange.json()).toMatchObject({ error: { code: 'BAD_RANGE' } });

    const list = await app.inject({ method: 'GET', url: `/staff/leaves?teacherId=${teacherId}`, headers: h });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { data: Array<{ id: string }> }).data.map((r) => r.id)).toContain(leave.id);

    const approved = await app.inject({ method: 'POST', url: `/staff/leaves/${leave.id}/approve`, headers: h, payload: {} });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ data: { status: 'approved' } });

    const again = await app.inject({ method: 'POST', url: `/staff/leaves/${leave.id}/approve`, headers: h, payload: {} });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: { code: 'ALREADY_DECIDED' } });

    const rejectAfter = await app.inject({ method: 'POST', url: `/staff/leaves/${leave.id}/reject`, headers: h, payload: {} });
    expect(rejectAfter.statusCode).toBe(409);

    const bal = await app.inject({ method: 'GET', url: `/staff/leaves/balances?teacherId=${teacherId}&year=2026`, headers: h });
    expect(bal.statusCode).toBe(200);
    const body = bal.json() as { data: { sick: { allowance: number; used: number; remaining: number }; unpaid: { used: number } } };
    expect(body.data.sick.allowance).toBe(12);
    expect(body.data.sick.used).toBe(3);
    expect(body.data.sick.remaining).toBe(9);

    // Rejected leave does not consume balance.
    const c2 = await app.inject({
      method: 'POST', url: '/staff/leaves', headers: h,
      payload: { teacherId, kind: 'casual', fromDate: '2026-09-20', toDate: '2026-09-21' },
    });
    const casualId = (c2.json() as { data: { id: string } }).data.id;
    const rej = await app.inject({ method: 'POST', url: `/staff/leaves/${casualId}/reject`, headers: h, payload: { note: 'busy week' } });
    expect(rej.statusCode).toBe(200);
    const bal2 = await app.inject({ method: 'GET', url: `/staff/leaves/balances?teacherId=${teacherId}&year=2026`, headers: h });
    expect((bal2.json() as { data: { casual: { used: number } } }).data.casual.used).toBe(0);
  });

  it('leave edit pending ok; approved edit 409', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'edit-leave@example.com', schoolName: 'Edit Leave' });
    const h = auth(token, tenant.slug);
    const teacherId = await makeTeacher(app, token, tenant.slug, 'Edit Teacher');
    const teacher2 = await makeTeacher(app, token, tenant.slug, 'Edit Teacher 2');

    const applied = await app.inject({
      method: 'POST', url: '/staff/leaves', headers: h,
      payload: { teacherId, kind: 'sick', fromDate: '2026-11-10', toDate: '2026-11-12', reason: 'flu' },
    });
    expect(applied.statusCode).toBe(201);
    const leaveId = (applied.json() as { data: { id: string } }).data.id;

    // Pending edit: change teacher/kind/dates/reason; days recomputed (10→15 = 6 days).
    const edited = await app.inject({
      method: 'PUT', url: `/staff/leaves/${leaveId}`, headers: h,
      payload: { teacherId: teacher2, kind: 'casual', fromDate: '2026-11-10', toDate: '2026-11-15', reason: 'updated' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ data: { teacherId: teacher2, kind: 'casual', days: 6, reason: 'updated', status: 'pending' } });

    // Bad range 400; empty 400.
    const badRange = await app.inject({ method: 'PUT', url: `/staff/leaves/${leaveId}`, headers: h, payload: { fromDate: '2026-11-20', toDate: '2026-11-19' } });
    expect(badRange.statusCode).toBe(400);
    const empty = await app.inject({ method: 'PUT', url: `/staff/leaves/${leaveId}`, headers: h, payload: {} });
    expect(empty.statusCode).toBe(400);

    // Approve, then edit -> 409 ALREADY_DECIDED.
    await app.inject({ method: 'POST', url: `/staff/leaves/${leaveId}/approve`, headers: h, payload: {} });
    const afterApprove = await app.inject({ method: 'PUT', url: `/staff/leaves/${leaveId}`, headers: h, payload: { reason: 'too late' } });
    expect(afterApprove.statusCode).toBe(409);
    expect(afterApprove.json()).toMatchObject({ error: { code: 'ALREADY_DECIDED' } });

    // Rejected also 409.
    const c2 = await app.inject({
      method: 'POST', url: '/staff/leaves', headers: h,
      payload: { teacherId, kind: 'earned', fromDate: '2026-12-01', toDate: '2026-12-02' },
    });
    const rejId = (c2.json() as { data: { id: string } }).data.id;
    await app.inject({ method: 'POST', url: `/staff/leaves/${rejId}/reject`, headers: h, payload: {} });
    const afterReject = await app.inject({ method: 'PUT', url: `/staff/leaves/${rejId}`, headers: h, payload: { reason: 'late' } });
    expect(afterReject.statusCode).toBe(409);
  });

  it('Teacher approve 403; Parent reads 403; anon 401', async () => {
    const admin = await signupSchool(app, { email: 'role-admin@example.com', schoolName: 'Role School' });
    const teacherId = await makeTeacher(app, admin.token, admin.tenant.slug);
    const applied = await app.inject({
      method: 'POST', url: '/staff/leaves', headers: auth(admin.token, admin.tenant.slug),
      payload: { teacherId, kind: 'earned', fromDate: '2026-10-01', toDate: '2026-10-02' },
    });
    const leaveId = (applied.json() as { data: { id: string } }).data.id;

    const teacherSignup = await signupSchool(app, { email: 'role-teacher@example.com', schoolName: 'Teacher Home' });
    await addMembership(teacherSignup.user.id, admin.tenant.id, 'Teacher');
    const teacherToken = await loginAs(app, 'role-teacher@example.com', 'password123');
    const th = auth(teacherToken, admin.tenant.slug);

    // Teacher can read + apply.
    const read = await app.inject({ method: 'GET', url: '/staff/leaves', headers: th });
    expect(read.statusCode).toBe(200);
    // Teacher cannot approve.
    const denied = await app.inject({ method: 'POST', url: `/staff/leaves/${leaveId}/approve`, headers: th, payload: {} });
    expect(denied.statusCode).toBe(403);

    const parentSignup = await signupSchool(app, { email: 'role-parent@example.com', schoolName: 'Parent Home' });
    await addMembership(parentSignup.user.id, admin.tenant.id, 'Parent');
    const parentToken = await loginAs(app, 'role-parent@example.com', 'password123');
    const ph = auth(parentToken, admin.tenant.slug);
    const parentRead = await app.inject({ method: 'GET', url: '/staff/leaves', headers: ph });
    expect(parentRead.statusCode).toBe(403);

    const anon = await app.inject({ method: 'GET', url: '/staff/leaves', headers: { 'x-tenant-slug': admin.tenant.slug } });
    expect(anon.statusCode).toBe(401);
    const anonPost = await app.inject({ method: 'POST', url: '/staff/leaves', headers: { 'x-tenant-slug': admin.tenant.slug }, payload: {} });
    expect(anonPost.statusCode).toBe(401);
  });

  it('salary upsert + run generation math; duplicate month 409; pay → run paid', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'payroll-admin@example.com', schoolName: 'Payroll School' });
    const h = auth(token, tenant.slug);
    const teacherId = await makeTeacher(app, token, tenant.slug, 'Payroll Teacher');

    const upsert = await app.inject({
      method: 'PUT', url: '/staff/salary', headers: h,
      payload: { teacherId, basicCents: 30000, allowancesCents: 15000 },
    });
    expect(upsert.statusCode).toBe(200);
    expect(upsert.json()).toMatchObject({ data: { basicCents: 30000, allowancesCents: 15000 } });

    const got = await app.inject({ method: 'GET', url: `/staff/salary?teacherId=${teacherId}`, headers: h });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ data: { basicCents: 30000, allowancesCents: 15000 } });

    // 2 unpaid days in September 2026.
    const lv = await app.inject({
      method: 'POST', url: '/staff/leaves', headers: h,
      payload: { teacherId, kind: 'unpaid', fromDate: '2026-09-05', toDate: '2026-09-06' },
    });
    expect(lv.statusCode).toBe(201);
    const lvId = (lv.json() as { data: { id: string } }).data.id;
    await app.inject({ method: 'POST', url: `/staff/leaves/${lvId}/approve`, headers: h, payload: {} });

    const run = await app.inject({ method: 'POST', url: '/staff/payroll/runs', headers: h, payload: { month: '2026-09' } });
    expect(run.statusCode).toBe(201);
    const runBody = run.json() as { data: { id: string }; slips: Array<{ id: string; teacherId: string; basicCents: number; allowancesCents: number; unpaidLeaveDays: number; leaveDeductionCents: number; netCents: number }> };
    const runId = runBody.data.id;
    expect(runId).toBeTruthy();
    const slip = runBody.slips.find((s) => s.teacherId === teacherId);
    expect(slip).toBeTruthy();
    // 30-day divisor: round(45000/30*2)=3000; net=42000.
    expect(slip!.unpaidLeaveDays).toBe(2);
    expect(slip!.leaveDeductionCents).toBe(3000);
    expect(slip!.netCents).toBe(30000 + 15000 - 3000);

    const dup = await app.inject({ method: 'POST', url: '/staff/payroll/runs', headers: h, payload: { month: '2026-09' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: { code: 'DUPLICATE_MONTH' } });

    const fin = await app.inject({ method: 'POST', url: `/staff/payroll/runs/${runId}/finalize`, headers: h, payload: {} });
    expect(fin.statusCode).toBe(200);

    const pay = await app.inject({ method: 'POST', url: `/staff/payslips/${slip!.id}/pay`, headers: h, payload: { method: 'Bank' } });
    expect(pay.statusCode).toBe(200);
    expect(pay.json()).toMatchObject({ data: { status: 'paid' } });

    const detail = await app.inject({ method: 'GET', url: `/staff/payroll/runs/${runId}`, headers: h });
    expect(detail.statusCode).toBe(200);
    // All slips paid → run paid.
    expect(detail.json()).toMatchObject({ data: { status: 'paid' } });
  });

  it('cross-tenant teacher rejected 400; bad uuids 400; missing run 404', async () => {
    const a = await signupSchool(app, { email: 'x-a@example.com', schoolName: 'X School A' });
    const b = await signupSchool(app, { email: 'x-b@example.com', schoolName: 'X School B' });
    const teacherId = await makeTeacher(app, a.token, a.tenant.slug, 'X Teacher');
    const bh = auth(b.token, b.tenant.slug);

    const crossApply = await app.inject({
      method: 'POST', url: '/staff/leaves', headers: bh,
      payload: { teacherId, kind: 'sick', fromDate: '2026-09-01', toDate: '2026-09-02' },
    });
    expect(crossApply.statusCode).toBe(400);
    expect(crossApply.json()).toMatchObject({ error: { code: 'CROSS_TENANT' } });

    const crossList = await app.inject({ method: 'GET', url: `/staff/leaves?teacherId=${teacherId}`, headers: bh });
    expect(crossList.statusCode).toBe(400);
    expect(crossList.json()).toMatchObject({ error: { code: 'CROSS_TENANT' } });

    const crossSalary = await app.inject({
      method: 'PUT', url: '/staff/salary', headers: bh,
      payload: { teacherId, basicCents: 1000, allowancesCents: 500 },
    });
    expect(crossSalary.statusCode).toBe(400);

    const badUuid = await app.inject({ method: 'GET', url: '/staff/leaves?teacherId=not-a-uuid', headers: bh });
    expect(badUuid.statusCode).toBe(400);

    const miss = await app.inject({ method: 'GET', url: '/staff/payroll/runs/00000000-0000-4000-8000-000000000000', headers: bh });
    expect(miss.statusCode).toBe(404);
  });
});

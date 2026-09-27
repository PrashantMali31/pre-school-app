import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  leaveRequests,
  payrollRuns,
  payslips,
  salaryStructures,
  teachers,
} from '../../db/schema';
import { requireAuth, requireRole, resolveTenant, tenantOf } from '../../middlewares/tenant';
import { pageResult, parsePaging } from '../../utils/pagination';

/* Staff leave + payroll. Mount: orchestrator registers with prefix `/staff`.
 * All routes require [requireAuth, resolveTenant]; role gates per endpoint.
 *
 * Payroll daily-rate note: leave deductions use a fixed 30-day divisor —
 *   deduction = round((basicCents + allowancesCents) / 30 * unpaidLeaveDays).
 * Unpaid days (kept simple & documented) = approved `unpaid`-kind leave days
 * overlapping the payroll month (prorated by overlap). Paid kinds
 * (sick/casual/earned) within balance do NOT deduct.
 */

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.');
const LEAVE_KINDS = ['sick', 'casual', 'earned', 'unpaid'] as const;
const LEAVE_STATUSES = ['pending', 'approved', 'rejected'] as const;

function parseDateUTC(s: string): Date | null {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function inclusiveDays(from: string, to: string): number {
  const a = parseDateUTC(from)!;
  const b = parseDateUTC(to)!;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

/** Inclusive overlap in days between [aFrom,aTo] and [bFrom,bTo] (YYYY-MM-DD). */
function overlapDays(aFrom: string, aTo: string, bFrom: string, bTo: string): number {
  const start = aFrom > bFrom ? aFrom : bFrom;
  const end = aTo < bTo ? aTo : bTo;
  if (end < start) return 0;
  return inclusiveDays(start, end);
}

function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function findTeacherAnywhere(id: string) {
  return db.select().from(teachers).where(eq(teachers.id, id)).then((r) => r[0] ?? null);
}

export async function staffRoutes(app: FastifyInstance) {
  /* ---------- Leave requests ---------- */

  // GET /leaves/balances — Admin/Teacher. Defined before :id routes.
  app.get('/leaves/balances', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const q = req.query as Record<string, string>;
    const teacherId = (q.teacherId ?? '').trim();
    if (!teacherId) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'teacherId is required.' } });
    if (!uuidSchema.safeParse(teacherId).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid teacherId.' } });
    }
    const t = tenantOf(req);
    const teacher = await findTeacherAnywhere(teacherId);
    if (!teacher) return reply.code(404).send({ error: { code: 'TEACHER_NOT_FOUND', message: 'Teacher not found.' } });
    if (teacher.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Teacher belongs to another school.' } });

    const rawYear = (q.year ?? '').trim();
    const year = rawYear ? Number(rawYear) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid year.' } });
    }
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const rows = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, t.id), eq(leaveRequests.teacherId, teacherId), eq(leaveRequests.status, 'approved')));

    const used: Record<string, number> = { sick: 0, casual: 0, earned: 0, unpaid: 0 };
    for (const r of rows) {
      if (!LEAVE_KINDS.includes(r.kind as (typeof LEAVE_KINDS)[number])) continue;
      used[r.kind] += overlapDays(r.fromDate, r.toDate, yearStart, yearEnd);
    }
    const allowances: Record<string, number> = { sick: 12, casual: 12, earned: 15 };
    const sick = { allowance: 12, used: used.sick, remaining: allowances.sick - used.sick };
    const casual = { allowance: 12, used: used.casual, remaining: allowances.casual - used.casual };
    const earned = { allowance: 15, used: used.earned, remaining: allowances.earned - used.earned };
    const unpaid = { used: used.unpaid };
    const balances = { sick, casual, earned, unpaid };
    return { data: { teacherId, year, sick, casual, earned, unpaid, balances } };
  });

  // GET /leaves — Admin/Teacher (Parent 403 via requireRole).
  app.get('/leaves', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const t = tenantOf(req);
    const q = req.query as Record<string, string>;
    const { page, limit, offset } = parsePaging(q as Record<string, unknown>);

    const teacherId = (q.teacherId ?? '').trim();
    if (teacherId) {
      if (!uuidSchema.safeParse(teacherId).success) {
        return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid teacherId.' } });
      }
      const teacher = await findTeacherAnywhere(teacherId);
      if (!teacher) return reply.code(404).send({ error: { code: 'TEACHER_NOT_FOUND', message: 'Teacher not found.' } });
      if (teacher.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Teacher belongs to another school.' } });
    }
    const status = (q.status ?? '').trim();
    if (status && !LEAVE_STATUSES.includes(status as (typeof LEAVE_STATUSES)[number])) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid status.' } });
    }
    const where = and(
      eq(leaveRequests.tenantId, t.id),
      teacherId ? eq(leaveRequests.teacherId, teacherId) : undefined,
      status ? eq(leaveRequests.status, status) : undefined
    );
    const total = await db.select({ n: count() }).from(leaveRequests).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db
      .select()
      .from(leaveRequests)
      .where(where)
      .orderBy(desc(leaveRequests.createdAt))
      .limit(limit)
      .offset(offset);
    return pageResult(rows, total, page, limit);
  });

  // POST /leaves — Admin/Teacher.
  app.post('/leaves', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({
      teacherId: z.string().uuid(),
      kind: z.enum(['sick', 'casual', 'earned', 'unpaid']),
      fromDate: dateSchema,
      toDate: dateSchema,
      reason: z.string().max(500).optional().default(''),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const teacher = await findTeacherAnywhere(parsed.data.teacherId);
    if (!teacher) return reply.code(404).send({ error: { code: 'TEACHER_NOT_FOUND', message: 'Teacher not found.' } });
    if (teacher.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Teacher belongs to another school.' } });

    const from = parseDateUTC(parsed.data.fromDate);
    const to = parseDateUTC(parsed.data.toDate);
    if (!from || !to) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid date value.' } });
    if (to.getTime() < from.getTime()) return reply.code(400).send({ error: { code: 'BAD_RANGE', message: 'toDate must be on or after fromDate.' } });
    const days = inclusiveDays(parsed.data.fromDate, parsed.data.toDate);
    const row = await db.insert(leaveRequests).values({
      tenantId: t.id,
      teacherId: parsed.data.teacherId,
      kind: parsed.data.kind,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
      days,
      reason: parsed.data.reason ?? '',
      status: 'pending',
    }).returning().then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });

  // PUT /leaves/:id — Admin only. Edit PENDING request (teacher/kind/dates/reason); recompute days.
  app.put('/leaves/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({
      teacherId: z.string().uuid().optional(),
      kind: z.enum(['sick', 'casual', 'earned', 'unpaid']).optional(),
      fromDate: dateSchema.optional(),
      toDate: dateSchema.optional(),
      reason: z.string().max(500).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const t = tenantOf(req);
    const cur = await db.select().from(leaveRequests).where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, t.id))).then((r) => r[0]);
    if (!cur) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Leave request not found.' } });
    if (cur.status !== 'pending') return reply.code(409).send({ error: { code: 'ALREADY_DECIDED', message: 'Leave request already decided.' } });
    if (parsed.data.teacherId) {
      const teacher = await findTeacherAnywhere(parsed.data.teacherId);
      if (!teacher) return reply.code(404).send({ error: { code: 'TEACHER_NOT_FOUND', message: 'Teacher not found.' } });
      if (teacher.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Teacher belongs to another school.' } });
    }
    const fromDate = parsed.data.fromDate ?? cur.fromDate;
    const toDate = parsed.data.toDate ?? cur.toDate;
    const from = parseDateUTC(fromDate);
    const to = parseDateUTC(toDate);
    if (!from || !to) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid date value.' } });
    if (to.getTime() < from.getTime()) return reply.code(400).send({ error: { code: 'BAD_RANGE', message: 'toDate must be on or after fromDate.' } });
    const set: { teacherId?: string; kind?: string; fromDate?: string; toDate?: string; days?: number; reason?: string } = {};
    if (parsed.data.teacherId) set.teacherId = parsed.data.teacherId;
    if (parsed.data.kind) set.kind = parsed.data.kind;
    if (parsed.data.fromDate) set.fromDate = parsed.data.fromDate;
    if (parsed.data.toDate) set.toDate = parsed.data.toDate;
    if (parsed.data.reason !== undefined) set.reason = parsed.data.reason;
    if (parsed.data.fromDate || parsed.data.toDate) set.days = inclusiveDays(fromDate, toDate);
    const row = await db.update(leaveRequests).set(set).where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, t.id))).returning().then((r) => r[0]);
    return { ok: true, data: row };
  });

  // POST /leaves/:id/approve — Admin only.
  app.post('/leaves/:id/approve', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({ note: z.string().max(500).optional() }).safeParse((req.body ?? {}) as unknown);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const t = tenantOf(req);
    const cur = await db.select().from(leaveRequests).where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, t.id))).then((r) => r[0]);
    if (!cur) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Leave request not found.' } });
    if (cur.status !== 'pending') return reply.code(409).send({ error: { code: 'ALREADY_DECIDED', message: 'Leave request already decided.' } });
    const sub = (req.user as { sub?: string } | undefined)?.sub;
    const decidedBy = sub && uuidSchema.safeParse(sub).success ? sub : null;
    const row = await db.update(leaveRequests).set({ status: 'approved', decidedBy, decidedAt: new Date() }).where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, t.id))).returning().then((r) => r[0]);
    return { ok: true, data: row };
  });

  // POST /leaves/:id/reject — Admin only.
  app.post('/leaves/:id/reject', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({ note: z.string().max(500).optional() }).safeParse((req.body ?? {}) as unknown);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const t = tenantOf(req);
    const cur = await db.select().from(leaveRequests).where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, t.id))).then((r) => r[0]);
    if (!cur) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Leave request not found.' } });
    if (cur.status !== 'pending') return reply.code(409).send({ error: { code: 'ALREADY_DECIDED', message: 'Leave request already decided.' } });
    const sub = (req.user as { sub?: string } | undefined)?.sub;
    const decidedBy = sub && uuidSchema.safeParse(sub).success ? sub : null;
    const row = await db.update(leaveRequests).set({ status: 'rejected', decidedBy, decidedAt: new Date() }).where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, t.id))).returning().then((r) => r[0]);
    return { ok: true, data: row };
  });

  /* ---------- Salary structures ---------- */

  // GET /salary — Admin/Teacher.
  app.get('/salary', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const q = req.query as Record<string, string>;
    const teacherId = (q.teacherId ?? '').trim();
    if (!teacherId) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'teacherId is required.' } });
    if (!uuidSchema.safeParse(teacherId).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid teacherId.' } });
    const t = tenantOf(req);
    const teacher = await findTeacherAnywhere(teacherId);
    if (!teacher) return reply.code(404).send({ error: { code: 'TEACHER_NOT_FOUND', message: 'Teacher not found.' } });
    if (teacher.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Teacher belongs to another school.' } });
    const row = await db.select().from(salaryStructures).where(eq(salaryStructures.teacherId, teacherId)).then((r) => r[0]);
    if (!row || row.tenantId !== t.id) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Salary structure not found.' } });
    return { data: row };
  });

  // PUT /salary — Admin only (upsert).
  app.put('/salary', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({
      teacherId: z.string().uuid(),
      basicCents: z.number().int().min(0).max(100000000),
      allowancesCents: z.number().int().min(0).max(100000000),
      effectiveFrom: dateSchema.optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const teacher = await findTeacherAnywhere(parsed.data.teacherId);
    if (!teacher) return reply.code(404).send({ error: { code: 'TEACHER_NOT_FOUND', message: 'Teacher not found.' } });
    if (teacher.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Teacher belongs to another school.' } });
    const effectiveFrom = parsed.data.effectiveFrom ?? todayUTC();
    if (!parseDateUTC(effectiveFrom)) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid effectiveFrom.' } });
    const existing = await db.select().from(salaryStructures).where(eq(salaryStructures.teacherId, parsed.data.teacherId)).then((r) => r[0]);
    if (existing) {
      const row = await db.update(salaryStructures).set({
        basicCents: parsed.data.basicCents,
        allowancesCents: parsed.data.allowancesCents,
        effectiveFrom,
        updatedAt: new Date(),
      }).where(eq(salaryStructures.teacherId, parsed.data.teacherId)).returning().then((r) => r[0]);
      return { ok: true, data: row };
    }
    const row = await db.insert(salaryStructures).values({
      tenantId: t.id,
      teacherId: parsed.data.teacherId,
      basicCents: parsed.data.basicCents,
      allowancesCents: parsed.data.allowancesCents,
      effectiveFrom,
    }).returning().then((r) => r[0]);
    return { ok: true, data: row };
  });

  /* ---------- Payroll ---------- */

  // GET /payroll/runs — Admin/Teacher.
  app.get('/payroll/runs', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req) => {
    const t = tenantOf(req);
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const where = eq(payrollRuns.tenantId, t.id);
    const total = await db.select({ n: count() }).from(payrollRuns).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db.select().from(payrollRuns).where(where).orderBy(desc(payrollRuns.month)).limit(limit).offset(offset);
    return pageResult(rows, total, page, limit);
  });

  // POST /payroll/runs — Admin. Generates slips for active non-deleted teachers.
  app.post('/payroll/runs', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({ month: monthSchema }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const month = parsed.data.month;
    const existing = await db.select().from(payrollRuns).where(and(eq(payrollRuns.tenantId, t.id), eq(payrollRuns.month, month))).then((r) => r[0]);
    if (existing) return reply.code(409).send({ error: { code: 'DUPLICATE_MONTH', message: 'Payroll run already exists for this month.' } });

    const activeTeachers = await db.select().from(teachers).where(and(eq(teachers.tenantId, t.id), eq(teachers.status, 'active'), isNull(teachers.deletedAt))).orderBy(asc(teachers.createdAt));
    const { start, end } = monthBounds(month);
    const approved = await db.select().from(leaveRequests).where(and(eq(leaveRequests.tenantId, t.id), eq(leaveRequests.status, 'approved')));
    const salaryRows = await db.select().from(salaryStructures).where(eq(salaryStructures.tenantId, t.id));
    const salaryByTeacher = new Map(salaryRows.map((s) => [s.teacherId, s]));

    const sub = (req.user as { sub?: string } | undefined)?.sub;
    const createdBy = sub && uuidSchema.safeParse(sub).success ? sub : null;
    const run = await db.insert(payrollRuns).values({ tenantId: t.id, month, status: 'draft', createdBy }).returning().then((r) => r[0]);

    const slips = [];
    for (const teacher of activeTeachers) {
      const sal = salaryByTeacher.get(teacher.id);
      const basic = sal?.basicCents ?? 0;
      const allow = sal?.allowancesCents ?? 0;
      // Simple & documented: only approved `unpaid`-kind days in the month deduct.
      let unpaidDays = 0;
      for (const lv of approved) {
        if (lv.teacherId !== teacher.id) continue;
        if (lv.kind !== 'unpaid') continue;
        unpaidDays += overlapDays(lv.fromDate, lv.toDate, start, end);
      }
      // Fixed 30-day divisor for the daily rate.
      const gross = basic + allow;
      const deduction = Math.round((gross / 30) * unpaidDays);
      const net = Math.max(0, gross - deduction);
      const slip = await db.insert(payslips).values({
        runId: run.id,
        teacherId: teacher.id,
        basicCents: basic,
        allowancesCents: allow,
        unpaidLeaveDays: unpaidDays,
        leaveDeductionCents: deduction,
        netCents: net,
        status: 'pending',
      }).returning().then((r) => r[0]);
      slips.push(slip);
    }
    return reply.code(201).send({ data: { ...run, slips }, slips });
  });

  // GET /payroll/runs/:id — Admin/Teacher (run + slips).
  app.get('/payroll/runs/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const t = tenantOf(req);
    const run = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, t.id))).then((r) => r[0]);
    if (!run) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Payroll run not found.' } });
    const slips = await db.select().from(payslips).where(eq(payslips.runId, id));
    return { data: { ...run, slips }, slips };
  });

  // POST /payroll/runs/:id/finalize — Admin.
  app.post('/payroll/runs/:id/finalize', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const t = tenantOf(req);
    const run = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, t.id))).then((r) => r[0]);
    if (!run) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Payroll run not found.' } });
    if (run.status === 'finalized' || run.status === 'paid') return { ok: true, data: run };
    const row = await db.update(payrollRuns).set({ status: 'finalized' }).where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, t.id))).returning().then((r) => r[0]);
    return { ok: true, data: row };
  });

  // POST /payslips/:id/pay — Admin; run flips to paid when all slips paid.
  app.post('/payslips/:id/pay', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({
      method: z.string().trim().min(1).max(60),
      reference: z.string().trim().max(120).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const t = tenantOf(req);
    const slip = await db.select().from(payslips).where(eq(payslips.id, id)).then((r) => r[0]);
    if (!slip) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Payslip not found.' } });
    const run = await db.select().from(payrollRuns).where(eq(payrollRuns.id, slip.runId)).then((r) => r[0]);
    if (!run || run.tenantId !== t.id) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Payslip not found.' } });
    let updated = slip;
    if (slip.status !== 'paid') {
      updated = await db.update(payslips).set({
        status: 'paid',
        paidAt: new Date(),
        paidMethod: parsed.data.method,
        reference: parsed.data.reference ?? slip.reference,
      }).where(eq(payslips.id, id)).returning().then((r) => r[0]);
    }
    const all = await db.select().from(payslips).where(eq(payslips.runId, run.id));
    if (all.length > 0 && all.every((s) => s.status === 'paid') && run.status !== 'paid') {
      await db.update(payrollRuns).set({ status: 'paid' }).where(eq(payrollRuns.id, run.id));
    }
    return { ok: true, data: updated };
  });
}

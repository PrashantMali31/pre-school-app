import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  announcements,
  attendanceDays,
  attendanceRecords,
  auditLogs,
  classes,
  enquiries,
  events,
  invoices,
  memberships,
  payments,
  schoolOptions,
  schoolProfiles,
  students,
  teachers,
  tenants,
  users,
} from '../../db/schema';
import { requireAuth, requireRole, resolveTenant, tenantOf } from '../../middlewares/tenant';
import { pageResult, parsePaging } from '../../utils/pagination';
import { hashPassword } from '../../utils/security';
import { writeAudit } from '../../utils/audit';

/* Trust module — audit log, backup export, demo-credential hygiene.
 *
 * Mount (orchestrator — app.ts is owned by another agent, do NOT edit here):
 *   import { auditRoutes } from './modules/audit/routes';
 *   app.register(auditRoutes, { prefix: '/audit' });
 *
 *   GET    `/`             — paginated tenant audit logs (Admin + Teacher only;
 *                            Parent gets 403 AUDIT_FORBIDDEN)
 *   GET    `/export`       — full tenant JSON dump for backup (Admin only)
 *   POST   `/rotate-demo`  — rotate demo-admin password(s), body {confirm:true}
 *                            (Admin only, demo tenants only)
 */

/** Run a query, tolerating "table does not exist" (42P01) on databases that
 *  were migrated before this table was added. Returns `fallback` instead of
 *  throwing for 42P01 only — every other error propagates. */
async function tolerateMissingTable<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === '42P01' || /relation .* does not exist/i.test(err?.message ?? '')) return fallback;
    throw e;
  }
}

export async function auditRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const role = (req as unknown as { membershipRole?: string }).membershipRole;
    if (role === 'Parent') {
      return reply
        .code(403)
        .send({ error: { code: 'AUDIT_FORBIDDEN', message: 'Audit logs are available to staff only.' } });
    }
    if (role !== 'Admin' && role !== 'Teacher') {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } });
    }
    const t = tenantOf(req);
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const where = eq(auditLogs.tenantId, t.id);
    const total = await tolerateMissingTable(
      () => db.select({ n: count() }).from(auditLogs).where(where).then((r) => Number(r[0]?.n ?? 0)),
      0
    );
    const rows = await tolerateMissingTable(
      () =>
        db
          .select()
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit)
          .offset(offset),
      [] as typeof auditLogs.$inferSelect[]
    );
    const userIds = [...new Set(rows.map((r) => r.userId).filter((u): u is string => !!u))];
    const userMap = new Map<string, { id: string; name: string; email: string }>();
    if (userIds.length > 0) {
      const found = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(whereUserIn(userIds));
      for (const u of found) userMap.set(u.id, u);
    }
    return pageResult(
      rows.map((r) => ({ ...r, user: r.userId ? (userMap.get(r.userId) ?? null) : null })),
      total,
      page,
      limit
    );
  });

  app.get('/export', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req) => {
    const t = tenantOf(req);
    const tid = eq(classes.tenantId, t.id);
    // Each collection is scoped by tenantId; payments may predate the table.
    const [profile, options, classRows, studentRows, teacherRows, dayRows, invoiceRows, eventRows, announcementRows, enquiryRows] =
      await Promise.all([
        db.select().from(schoolProfiles).where(eq(schoolProfiles.tenantId, t.id)).then((r) => r[0] ?? null),
        db.select().from(schoolOptions).where(eq(schoolOptions.tenantId, t.id)).then((r) => r[0] ?? null),
        db.select().from(classes).where(tid),
        db.select().from(students).where(eq(students.tenantId, t.id)),
        db.select().from(teachers).where(eq(teachers.tenantId, t.id)),
        db.select().from(attendanceDays).where(eq(attendanceDays.tenantId, t.id)),
        db.select().from(invoices).where(eq(invoices.tenantId, t.id)),
        db.select().from(events).where(eq(events.tenantId, t.id)),
        db.select().from(announcements).where(eq(announcements.tenantId, t.id)),
        db.select().from(enquiries).where(eq(enquiries.tenantId, t.id)),
      ]);
    const dayIds = dayRows.map((d) => d.id);
    const allRecs = dayIds.length > 0
      ? await db.select().from(attendanceRecords).where(inArray(attendanceRecords.dayId, dayIds))
      : [];
    const recsByDay = new Map<string, typeof allRecs>();
    for (const r of allRecs) {
      const list = recsByDay.get(r.dayId);
      if (list) list.push(r);
      else recsByDay.set(r.dayId, [r]);
    }
    const attendance = dayRows.map((d) => ({
      ...d,
      records: Object.fromEntries((recsByDay.get(d.id) ?? []).map((r) => [r.studentId, r.status])),
    }));
    const paymentRows = await tolerateMissingTable(
      () => db.select().from(payments).where(eq(payments.tenantId, t.id)),
      [] as typeof payments.$inferSelect[]
    );
    const tenantRow = await db.select().from(tenants).where(eq(tenants.id, t.id)).then((r) => r[0] ?? null);
    return {
      data: {
        tenant: tenantRow ? { id: tenantRow.id, slug: tenantRow.slug, name: tenantRow.name } : { id: t.id, slug: t.slug },
        profile,
        options,
        classes: classRows,
        students: studentRows,
        teachers: teacherRows,
        attendance,
        invoices: invoiceRows,
        payments: paymentRows,
        events: eventRows,
        announcements: announcementRows,
        enquiries: enquiryRows,
        exportedAt: new Date().toISOString(),
      },
    };
  });

  app.post('/rotate-demo', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({ confirm: z.literal(true) }).safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION', message: 'Pass { "confirm": true } to rotate the demo password.' } });
    }
    const t = tenantOf(req);
    const full = await db.select().from(tenants).where(eq(tenants.id, t.id)).then((r) => r[0]);
    if (!full || !full.demo) {
      return reply
        .code(403)
        .send({ error: { code: 'NOT_DEMO', message: 'Password rotation is only available for demo schools.' } });
    }
    const admins = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.tenantId, t.id), eq(memberships.role, 'Admin')));
    if (admins.length === 0) {
      return reply.code(404).send({ error: { code: 'NO_DEMO_ADMIN', message: 'No admin account found for this school.' } });
    }
    // 16-char hex secret (8 random bytes). bcrypt-hashed like auth signup/reset.
    const temporaryPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await hashPassword(temporaryPassword);
    await db.update(users).set({ passwordHash }).where(inArray(users.id, admins.map((m) => m.userId)));
    const callerId = (req.user as { sub: string }).sub;
    await writeAudit(t.id, callerId, 'auth.rotate-demo', 'tenant', t.id, `Rotated demo password for ${admins.length} admin(s)`);
    return {
      ok: true,
      temporaryPassword,
      rotatedCount: admins.length,
      warning: 'Share this temporary password over a secure channel and ask the holder to change it after login. It will not be shown again.',
    };
  });
}

// Narrow helper so the user lookup stays a single typed query.
function whereUserIn(ids: string[]) {
  return inArray(users.id, ids);
}

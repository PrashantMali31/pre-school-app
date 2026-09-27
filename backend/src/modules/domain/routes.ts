import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { announcements, attendanceDays, attendanceRecords, enquiries, events, invoices, parentLinks } from '../../db/schema';
import { requireAuth, resolveTenant, requireRole, roleOf, tenantOf } from '../../middlewares/tenant';
import { pageResult, parsePaging } from '../../utils/pagination';

export async function attendanceRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const where = eq(attendanceDays.tenantId, t.id);
    const total = await db.select({ n: count() }).from(attendanceDays).where(where).then((r) => Number(r[0]?.n ?? 0));
    const days = await db.select().from(attendanceDays).where(where).orderBy(asc(attendanceDays.date)).limit(limit).offset(offset);
    const dayIds = days.map((d) => d.id);
    const allRecs = dayIds.length > 0
      ? await db.select().from(attendanceRecords).where(inArray(attendanceRecords.dayId, dayIds))
      : [];
    const recsByDay = new Map<string, typeof allRecs>();
    for (const r of allRecs) {
      const list = recsByDay.get(r.dayId);
      if (list) list.push(r);
      else recsByDay.set(r.dayId, [r]);
    }
    const out = days.map((d) => ({ ...d, records: Object.fromEntries((recsByDay.get(d.id) ?? []).map((r) => [r.studentId, r.status])) }));
    return pageResult(out.sort((a, b) => String(a.date).localeCompare(String(b.date))), total, page, limit);
  });

  app.put('/:date', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({ records: z.record(z.enum(['present', 'absent', 'late', 'half'])), note: z.string().max(300).optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid attendance payload.' } });
    const date = (req.params as { date: string }).date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply.code(400).send({ error: { code: 'BAD_DATE', message: 'Use YYYY-MM-DD.' } });
    const t = tenantOf(req);
    let day = await db.select().from(attendanceDays).where(and(eq(attendanceDays.tenantId, t.id), eq(attendanceDays.date, date))).then((r) => r[0]);
    if (!day) day = await db.insert(attendanceDays).values({ tenantId: t.id, date, note: parsed.data.note }).returning().then((r) => r[0]);
    else if (parsed.data.note !== undefined) await db.update(attendanceDays).set({ note: parsed.data.note }).where(eq(attendanceDays.id, day.id));
    await db.delete(attendanceRecords).where(eq(attendanceRecords.dayId, day.id));
    const entries = Object.entries(parsed.data.records);
    if (entries.length > 0) await db.insert(attendanceRecords).values(entries.map(([studentId, status]) => ({ dayId: day!.id, studentId, status })));
    return { ok: true };
  });

  app.delete('/:date', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const date = (req.params as { date: string }).date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply.code(400).send({ error: { code: 'BAD_DATE', message: 'Use YYYY-MM-DD.' } });
    const t = tenantOf(req);
    const day = await db.select().from(attendanceDays).where(and(eq(attendanceDays.tenantId, t.id), eq(attendanceDays.date, date))).then((r) => r[0]);
    if (!day) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No attendance for this date.' } });
    await db.delete(attendanceRecords).where(eq(attendanceRecords.dayId, day.id));
    await db.delete(attendanceDays).where(eq(attendanceDays.id, day.id));
    return { ok: true };
  });
}

export async function invoiceRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const status = (req.query as Record<string, string>).status;
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    // Unknown status values matched nothing under the old in-memory filter — preserve that.
    if (status && status !== 'paid' && status !== 'pending' && status !== 'overdue') {
      return pageResult([], 0, page, limit);
    }
    const statusCond = status ? eq(invoices.status, status as 'paid' | 'pending' | 'overdue') : undefined;
    // Parent scoping: only invoices whose student is linked to the parent.
    if (roleOf(req) === 'Parent') {
      const userId = (req.user as { sub: string }).sub;
      const links = await db
        .select({ studentId: parentLinks.studentId })
        .from(parentLinks)
        .where(and(eq(parentLinks.tenantId, t.id), eq(parentLinks.userId, userId)));
      if (links.length === 0) return pageResult([], 0, page, limit);
      const scope = and(
        eq(invoices.tenantId, t.id),
        inArray(invoices.studentId, links.map((l) => l.studentId)),
        ...(statusCond ? [statusCond] : [])
      );
      const total = await db.select({ n: count() }).from(invoices).where(scope).then((r) => Number(r[0]?.n ?? 0));
      const rows = await db.select().from(invoices).where(scope).limit(limit).offset(offset);
      return pageResult(rows, total, page, limit);
    }
    const where = statusCond ? and(eq(invoices.tenantId, t.id), statusCond) : eq(invoices.tenantId, t.id);
    const total = await db.select({ n: count() }).from(invoices).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db.select().from(invoices).where(where).limit(limit).offset(offset);
    return pageResult(rows, total, page, limit);
  });
  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({
      studentId: z.string().uuid(), title: z.string().trim().min(3).max(100),
      amount: z.number().positive().max(1000000), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const number = `INV-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const row = await db.insert(invoices).values({
      tenantId: t.id, number, studentId: parsed.data.studentId, title: parsed.data.title,
      amountCents: Math.round(parsed.data.amount * 100), dueDate: parsed.data.dueDate, issuedAt: parsed.data.issuedAt, status: 'pending',
    }).returning().then((r) => r[0]);
    return reply.code(201).send({ data: { ...row, amount: row.amountCents / 100 } });
  });
  app.post('/:id/pay', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const t = tenantOf(req);
    const rows = await db.update(invoices).set({ status: 'paid', method: 'UPI' }).where(and(eq(invoices.id, id), eq(invoices.tenantId, t.id))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Invoice not found.' } });
    return { ok: true };
  });
  app.patch('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({
      title: z.string().trim().min(3).max(100).optional(),
      amount: z.number().positive().max(1000000).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(['paid', 'pending', 'overdue']).optional(),
      method: z.string().trim().max(60).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const cur = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.tenantId, t.id))).then((r) => r[0]);
    if (!cur) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Invoice not found.' } });
    const d = parsed.data;
    const set: { title?: string; amountCents?: number; dueDate?: string; issuedAt?: string; status?: 'paid' | 'pending' | 'overdue'; method?: string | null } = {};
    if (d.title !== undefined) set.title = d.title;
    if (d.amount !== undefined) set.amountCents = Math.round(d.amount * 100);
    if (d.dueDate !== undefined) set.dueDate = d.dueDate;
    if (d.issuedAt !== undefined) set.issuedAt = d.issuedAt;
    if (d.status !== undefined) set.status = d.status;
    if (d.method !== undefined) set.method = d.method.trim() ? d.method.trim() : null;
    else if (d.status !== undefined) set.method = d.status === 'paid' ? 'UPI' : null;
    const row = await db.update(invoices).set(set).where(and(eq(invoices.id, id), eq(invoices.tenantId, t.id))).returning().then((r) => r[0]);
    return { ok: true, data: { ...row, amount: row.amountCents / 100 } };
  });
  app.delete('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const t = tenantOf(req);
    const rows = await db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.tenantId, t.id))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Invoice not found.' } });
    return { ok: true };
  });
}

export async function eventRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const where = and(eq(events.tenantId, t.id), isNull(events.deletedAt));
    const total = await db.select({ n: count() }).from(events).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db.select().from(events).where(where).orderBy(asc(events.date)).limit(limit).offset(offset);
    return pageResult(rows.sort((a, b) => String(a.date).localeCompare(String(b.date))), total, page, limit);
  });
  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({
      title: z.string().trim().min(3).max(80), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().trim().min(3).max(20), location: z.string().trim().max(80).default('School campus'),
      type: z.string().trim().min(1).max(60), description: z.string().max(500).default(''), color: z.string().max(20).default('#7C9DFF'),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const row = await db.insert(events).values({ tenantId: t.id, ...parsed.data }).returning().then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });
  app.put('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({
      title: z.string().trim().min(3).max(80).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      time: z.string().trim().min(3).max(20).optional(),
      location: z.string().trim().max(80).optional(),
      type: z.string().trim().min(1).max(60).optional(),
      description: z.string().max(500).optional(),
      color: z.string().max(20).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const cur = await db.select().from(events).where(and(eq(events.id, id), eq(events.tenantId, t.id), isNull(events.deletedAt))).then((r) => r[0]);
    if (!cur) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Event not found.' } });
    const row = await db.update(events).set({ ...parsed.data }).where(and(eq(events.id, id), eq(events.tenantId, t.id), isNull(events.deletedAt))).returning().then((r) => r[0]);
    if (!row) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Event not found.' } });
    return { ok: true, data: row };
  });
  app.delete('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const t = tenantOf(req);
    const rows = await db.update(events).set({ deletedAt: new Date() }).where(and(eq(events.id, id), eq(events.tenantId, t.id))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Event not found.' } });
    return { ok: true };
  });
}

export async function announcementRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const where = and(eq(announcements.tenantId, t.id), isNull(announcements.deletedAt));
    const total = await db.select({ n: count() }).from(announcements).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db.select().from(announcements).where(where).orderBy(desc(announcements.createdAt)).limit(limit).offset(offset);
    return pageResult(rows, total, page, limit);
  });
  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({ title: z.string().trim().min(3).max(80), body: z.string().trim().min(5).max(600), audience: z.string().trim().min(2).max(60) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const row = await db.insert(announcements).values({ tenantId: t.id, ...parsed.data }).returning().then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });
  app.put('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({
      title: z.string().trim().min(3).max(80).optional(),
      body: z.string().trim().min(5).max(600).optional(),
      audience: z.string().trim().min(2).max(60).optional(),
      pinned: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const cur = await db.select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.tenantId, t.id), isNull(announcements.deletedAt))).then((r) => r[0]);
    if (!cur) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Announcement not found.' } });
    const row = await db.update(announcements).set({ ...parsed.data }).where(and(eq(announcements.id, id), eq(announcements.tenantId, t.id), isNull(announcements.deletedAt))).returning().then((r) => r[0]);
    if (!row) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Announcement not found.' } });
    return { ok: true, data: row };
  });
  app.post('/:id/pin', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const cur = await db.select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.tenantId, t.id), isNull(announcements.deletedAt))).then((r) => r[0]);
    if (!cur) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Announcement not found.' } });
    await db.update(announcements).set({ pinned: !cur.pinned }).where(and(eq(announcements.id, id), eq(announcements.tenantId, t.id)));
    return { ok: true };
  });
  app.delete('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const t = tenantOf(req);
    const rows = await db.update(announcements).set({ deletedAt: new Date() }).where(and(eq(announcements.id, id), eq(announcements.tenantId, t.id))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Announcement not found.' } });
    return { ok: true };
  });
}

export async function enquiryRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const where = eq(enquiries.tenantId, t.id);
    const total = await db.select({ n: count() }).from(enquiries).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db.select().from(enquiries).where(where).orderBy(desc(enquiries.createdAt)).limit(limit).offset(offset);
    return pageResult(rows, total, page, limit);
  });
  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({
      childName: z.string().trim().min(2).max(60), age: z.number().int().min(1).max(10),
      parent: z.string().trim().min(2).max(60), phone: z.string().trim().min(6).max(20),
      source: z.string().trim().min(1).max(60), note: z.string().max(200).default(''),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const row = await db.insert(enquiries).values({ tenantId: t.id, ...parsed.data }).returning().then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });
  app.put('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({
      childName: z.string().trim().min(2).max(60).optional(),
      age: z.number().int().min(1).max(10).optional(),
      parent: z.string().trim().min(2).max(60).optional(),
      phone: z.string().trim().min(6).max(20).optional(),
      source: z.string().trim().min(1).max(60).optional(),
      note: z.string().max(200).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const cur = await db.select().from(enquiries).where(and(eq(enquiries.id, id), eq(enquiries.tenantId, t.id))).then((r) => r[0]);
    if (!cur) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Enquiry not found.' } });
    const row = await db.update(enquiries).set({ ...parsed.data }).where(and(eq(enquiries.id, id), eq(enquiries.tenantId, t.id))).returning().then((r) => r[0]);
    if (!row) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Enquiry not found.' } });
    return { ok: true, data: row };
  });
  app.post('/:id/move', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({ dir: z.union([z.literal(1), z.literal(-1)]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'dir must be 1 or -1.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const stages = ['New', 'Tour', 'Applied', 'Enrolled'] as const;
    const cur = await db.select().from(enquiries).where(and(eq(enquiries.id, id), eq(enquiries.tenantId, t.id))).then((r) => r[0]);
    if (!cur) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Enquiry not found.' } });
    const next = stages[Math.max(0, Math.min(stages.length - 1, stages.indexOf(cur.stage) + parsed.data.dir))];
    await db.update(enquiries).set({ stage: next }).where(and(eq(enquiries.id, id), eq(enquiries.tenantId, t.id)));
    return { ok: true, data: { stage: next } };
  });
  app.delete('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const t = tenantOf(req);
    const rows = await db.delete(enquiries).where(and(eq(enquiries.id, id), eq(enquiries.tenantId, t.id))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Enquiry not found.' } });
    return { ok: true };
  });
}

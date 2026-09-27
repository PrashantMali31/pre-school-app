import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  busRoutes,
  busStops,
  classes,
  incidents,
  parentLinks,
  pickupContacts,
  pickupLog,
  students,
  teachers,
  timetableSlots,
} from '../../db/schema';
import { requireAuth, requireRole, resolveTenant, roleOf, tenantOf } from '../../middlewares/tenant';
import { hashPassword, verifyPassword } from '../../utils/security';

/* Safety ops. Mount: orchestrator registers with prefix `/safety`.
 * Pickup authorization, health/incident log, class timetable, transport. */

const uuidSchema = z.string().uuid();
const phoneSchema = z.string().trim().min(6).max(20).regex(/^[+\d][\d\s\-()]*$/, 'Enter a valid phone number');
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h).');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const pickupBody = z.object({
  name: z.string().trim().min(2).max(60),
  relation: z.string().trim().max(40).optional().default(''),
  phone: phoneSchema.optional().default(''),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits.').optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
});

const logPickupBody = z.object({
  contactId: z.string().uuid().optional().nullable(),
  note: z.string().trim().max(300).optional(),
});

const incidentBody = z.object({
  studentId: z.string().uuid(),
  kind: z.enum(['injury', 'illness', 'allergy', 'behavior', 'other']),
  severity: z.enum(['low', 'medium', 'high']),
  title: z.string().trim().min(3).max(120),
  detail: z.string().trim().max(1000).optional().default(''),
  occurredAt: dateSchema,
});

const incidentPatch = z.object({
  kind: z.enum(['injury', 'illness', 'allergy', 'behavior', 'other']).optional(),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  title: z.string().trim().min(3).max(120).optional(),
  detail: z.string().trim().max(1000).optional(),
  occurredAt: dateSchema.optional(),
  notifiedParent: z.boolean().optional(),
  studentId: z.string().uuid().optional(),
});

const slotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  activity: z.string().trim().min(2).max(120),
  teacherId: z.string().uuid().nullable().optional(),
});

const routeBody = z.object({
  name: z.string().trim().min(2).max(80),
  vehicleNo: z.string().trim().max(30).optional().default(''),
  driverName: z.string().trim().max(60).optional().default(''),
  driverPhone: z.string().trim().max(20).optional().default(''),
});

const stopBody = z.object({
  name: z.string().trim().min(2).max(80),
  pickupTime: timeSchema,
  order: z.number().int().min(0).max(999).optional().default(0),
});

async function linkedIds(tenantId: string, userId: string): Promise<string[]> {
  const rows = await db
    .select({ studentId: parentLinks.studentId })
    .from(parentLinks)
    .where(and(eq(parentLinks.tenantId, tenantId), eq(parentLinks.userId, userId)));
  return rows.map((r) => r.studentId);
}

/** Load student by id regardless of tenant; null if missing. */
async function findStudentAnywhere(id: string) {
  return db.select().from(students).where(eq(students.id, id)).then((r) => r[0] ?? null);
}

async function findClassAnywhere(id: string) {
  return db.select().from(classes).where(eq(classes.id, id)).then((r) => r[0] ?? null);
}

export async function safetyRoutes(app: FastifyInstance) {
  /* ---------- Pickup contacts ---------- */

  // GET /students/:sid/pickups — list authorized contacts (any member; Parent scoped to linked).
  app.get('/students/:sid/pickups', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const t = tenantOf(req);
    const sid = (req.params as { sid: string }).sid;
    if (!uuidSchema.safeParse(sid).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid student id.' } });
    const stu = await findStudentAnywhere(sid);
    if (!stu) return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
    if (stu.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Student belongs to another school.' } });
    if (roleOf(req) === 'Parent') {
      const ids = await linkedIds(t.id, (req.user as { sub: string }).sub);
      if (!ids.includes(sid)) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not linked to this student.' } });
    }
    const rows = await db
      .select()
      .from(pickupContacts)
      .where(and(eq(pickupContacts.tenantId, t.id), eq(pickupContacts.studentId, sid)))
      .orderBy(asc(pickupContacts.createdAt));
    // Never leak hashes.
    return { data: rows.map(({ pinHash: _h, ...r }) => ({ ...r, hasPin: Boolean(_h) })) };
  });

  // POST /students/:sid/pickups — Admin/Teacher.
  app.post('/students/:sid/pickups', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = pickupBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const sid = (req.params as { sid: string }).sid;
    if (!uuidSchema.safeParse(sid).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid student id.' } });
    const stu = await findStudentAnywhere(sid);
    if (!stu) return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
    if (stu.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Student belongs to another school.' } });
    const pinHash = parsed.data.pin ? await hashPassword(parsed.data.pin) : null;
    const row = await db
      .insert(pickupContacts)
      .values({ tenantId: t.id, studentId: sid, name: parsed.data.name, relation: parsed.data.relation ?? '', phone: parsed.data.phone ?? '', pinHash, isPrimary: parsed.data.isPrimary ?? false })
      .returning()
      .then((r) => r[0]);
    const { pinHash: _h, ...rest } = row;
    void _h;
    return reply.code(201).send({ data: { ...rest, hasPin: Boolean(row.pinHash) } });
  });

  // PUT /pickups/:id — Admin/Teacher. Edit contact (name/relation/phone + optional PIN rotate).
  app.put('/pickups/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({
      name: z.string().trim().min(2).max(60).optional(),
      relation: z.string().trim().max(40).optional(),
      phone: phoneSchema.optional(),
      pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits.').optional().nullable(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const contact = await db.select().from(pickupContacts).where(eq(pickupContacts.id, id)).then((r) => r[0] ?? null);
    if (!contact) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Pickup contact not found.' } });
    const stu = await findStudentAnywhere(contact.studentId);
    if (!stu || stu.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Student belongs to another school.' } });
    const set: { name?: string; relation?: string; phone?: string; pinHash?: string | null } = {};
    if (parsed.data.name !== undefined) set.name = parsed.data.name;
    if (parsed.data.relation !== undefined) set.relation = parsed.data.relation;
    if (parsed.data.phone !== undefined) set.phone = parsed.data.phone;
    if (parsed.data.pin !== undefined) set.pinHash = parsed.data.pin ? await hashPassword(parsed.data.pin) : null;
    const rows = await db.update(pickupContacts).set(set).where(eq(pickupContacts.id, id)).returning();
    const { pinHash: _h, ...rest } = rows[0];
    void _h;
    return { ok: true, data: { ...rest, hasPin: Boolean(rows[0].pinHash) } };
  });

  // DELETE /pickups/:id — Admin/Teacher.
  app.delete('/pickups/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const rows = await db.delete(pickupContacts).where(and(eq(pickupContacts.id, id), eq(pickupContacts.tenantId, t.id))).returning({ id: pickupContacts.id });
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Pickup contact not found.' } });
    return { ok: true };
  });

  // POST /pickups/:id/verify {pin} -> {ok} — any member in tenant.
  app.post('/pickups/:id/verify', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const parsed = z.object({ pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits.') }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const row = await db
      .select()
      .from(pickupContacts)
      .where(and(eq(pickupContacts.id, id), eq(pickupContacts.tenantId, t.id)))
      .then((r) => r[0]);
    if (!row) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Pickup contact not found.' } });
    if (!row.pinHash) return { ok: false };
    const ok = await verifyPassword(parsed.data.pin, row.pinHash);
    return { ok };
  });

  // POST /students/:sid/pickup — log a pickup (Admin/Teacher).
  app.post('/students/:sid/pickup', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = logPickupBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const sid = (req.params as { sid: string }).sid;
    if (!uuidSchema.safeParse(sid).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid student id.' } });
    const stu = await findStudentAnywhere(sid);
    if (!stu) return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
    if (stu.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Student belongs to another school.' } });
    let contactId: string | null = parsed.data.contactId ?? null;
    if (contactId) {
      const c = await db
        .select({ id: pickupContacts.id, studentId: pickupContacts.studentId })
        .from(pickupContacts)
        .where(and(eq(pickupContacts.id, contactId), eq(pickupContacts.tenantId, t.id)))
        .then((r) => r[0]);
      if (!c) return reply.code(404).send({ error: { code: 'CONTACT_NOT_FOUND', message: 'Pickup contact not found.' } });
      if (c.studentId !== sid) return reply.code(400).send({ error: { code: 'CROSS_STUDENT', message: 'Contact is not authorized for this student.' } });
    }
    const verifiedBy = (req.user as { sub?: string } | undefined)?.sub ?? null;
    const sub = verifiedBy && uuidSchema.safeParse(verifiedBy).success ? verifiedBy : null;
    const row = await db
      .insert(pickupLog)
      .values({ tenantId: t.id, studentId: sid, contactId, note: parsed.data.note ?? null, verifiedBy: sub })
      .returning()
      .then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });

  // GET /students/:sid/pickups/log — pickup history (any member; Parent scoped).
  app.get('/students/:sid/pickups/log', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const t = tenantOf(req);
    const sid = (req.params as { sid: string }).sid;
    if (!uuidSchema.safeParse(sid).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid student id.' } });
    const stu = await findStudentAnywhere(sid);
    if (!stu) return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
    if (stu.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Student belongs to another school.' } });
    if (roleOf(req) === 'Parent') {
      const ids = await linkedIds(t.id, (req.user as { sub: string }).sub);
      if (!ids.includes(sid)) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not linked to this student.' } });
    }
    const rows = await db
      .select()
      .from(pickupLog)
      .where(and(eq(pickupLog.tenantId, t.id), eq(pickupLog.studentId, sid)))
      .orderBy(desc(pickupLog.pickedUpAt));
    return { data: rows };
  });

  /* ---------- Incidents ---------- */

  // GET /incidents?studentId= — any member; Parent scoped to linked students.
  app.get('/incidents', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const t = tenantOf(req);
    const query = req.query as Record<string, string>;
    const studentId = (query.studentId ?? '').trim();
    const role = roleOf(req);
    let allowed: string[] | null = null;
    if (role === 'Parent') {
      const ids = await linkedIds(t.id, (req.user as { sub: string }).sub);
      allowed = ids;
      if (studentId) {
        if (!uuidSchema.safeParse(studentId).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid studentId.' } });
        if (!ids.includes(studentId)) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not linked to this student.' } });
      } else if (ids.length === 0) {
        return { data: [] };
      }
    } else if (studentId && !uuidSchema.safeParse(studentId).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid studentId.' } });
    }
    const where = and(
      eq(incidents.tenantId, t.id),
      studentId ? eq(incidents.studentId, studentId) : undefined,
      allowed && !studentId ? inArray(incidents.studentId, allowed) : undefined
    );
    const rows = await db.select().from(incidents).where(where).orderBy(desc(incidents.occurredAt));
    return { data: rows };
  });

  // GET /incidents/:id — any member; Parent scoped.
  app.get('/incidents/:id', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const row = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.id, id), eq(incidents.tenantId, t.id)))
      .then((r) => r[0]);
    if (!row) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Incident not found.' } });
    if (roleOf(req) === 'Parent') {
      const ids = await linkedIds(t.id, (req.user as { sub: string }).sub);
      if (!ids.includes(row.studentId)) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not linked to this student.' } });
    }
    return { data: row };
  });

  // POST /incidents — Admin/Teacher.
  app.post('/incidents', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = incidentBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const stu = await findStudentAnywhere(parsed.data.studentId);
    if (!stu) return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
    if (stu.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Student belongs to another school.' } });
    const sub = (req.user as { sub?: string } | undefined)?.sub;
    const createdBy = sub && uuidSchema.safeParse(sub).success ? sub : null;
    const row = await db
      .insert(incidents)
      .values({ tenantId: t.id, studentId: parsed.data.studentId, kind: parsed.data.kind, severity: parsed.data.severity, title: parsed.data.title, detail: parsed.data.detail ?? '', occurredAt: parsed.data.occurredAt, createdBy })
      .returning()
      .then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });

  // PATCH /incidents/:id — Admin/Teacher.
  app.patch('/incidents/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = incidentPatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    if (parsed.data.studentId) {
      const stu = await findStudentAnywhere(parsed.data.studentId);
      if (!stu) return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
      if (stu.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Student belongs to another school.' } });
    }
    const rows = await db.update(incidents).set(parsed.data).where(and(eq(incidents.id, id), eq(incidents.tenantId, t.id))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Incident not found.' } });
    return { ok: true, data: rows[0] };
  });

  // DELETE /incidents/:id — Admin/Teacher.
  app.delete('/incidents/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const rows = await db.delete(incidents).where(and(eq(incidents.id, id), eq(incidents.tenantId, t.id))).returning({ id: incidents.id });
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Incident not found.' } });
    return { ok: true };
  });

  /* ---------- Timetable ---------- */

  // GET /classes/:cid/timetable — any member.
  app.get('/classes/:cid/timetable', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const t = tenantOf(req);
    const cid = (req.params as { cid: string }).cid;
    if (!uuidSchema.safeParse(cid).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid class id.' } });
    const cls = await findClassAnywhere(cid);
    if (!cls) return reply.code(404).send({ error: { code: 'CLASS_NOT_FOUND', message: 'Class not found.' } });
    if (cls.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Class belongs to another school.' } });
    const rows = await db
      .select()
      .from(timetableSlots)
      .where(and(eq(timetableSlots.tenantId, t.id), eq(timetableSlots.classId, cid)))
      .orderBy(asc(timetableSlots.weekday), asc(timetableSlots.startTime));
    return { data: rows };
  });

  // PUT /classes/:cid/timetable — replace-all (Admin/Teacher).
  app.put('/classes/:cid/timetable', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = z.object({ slots: z.array(slotSchema).max(60) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const cid = (req.params as { cid: string }).cid;
    if (!uuidSchema.safeParse(cid).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid class id.' } });
    const cls = await findClassAnywhere(cid);
    if (!cls) return reply.code(404).send({ error: { code: 'CLASS_NOT_FOUND', message: 'Class not found.' } });
    if (cls.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Class belongs to another school.' } });
    for (const s of parsed.data.slots) {
      if (s.endTime <= s.startTime) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'endTime must be after startTime.' } });
      if (s.teacherId) {
        const teacher = await db.select({ id: teachers.id, tenantId: teachers.tenantId }).from(teachers).where(eq(teachers.id, s.teacherId)).then((r) => r[0]);
        if (!teacher) return reply.code(404).send({ error: { code: 'TEACHER_NOT_FOUND', message: 'Teacher not found.' } });
        if (teacher.tenantId !== t.id) return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Teacher belongs to another school.' } });
      }
    }
    await db.delete(timetableSlots).where(and(eq(timetableSlots.tenantId, t.id), eq(timetableSlots.classId, cid)));
    const rows =
      parsed.data.slots.length > 0
        ? await db
            .insert(timetableSlots)
            .values(parsed.data.slots.map((s) => ({ tenantId: t.id, classId: cid, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, activity: s.activity, teacherId: s.teacherId ?? null })))
            .returning()
        : [];
    return { ok: true, data: rows };
  });

  /* ---------- Transport (bus routes + stops) ---------- */

  // GET /bus/routes — any member.
  app.get('/bus/routes', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const rows = await db.select().from(busRoutes).where(eq(busRoutes.tenantId, t.id)).orderBy(asc(busRoutes.createdAt));
    return { data: rows };
  });

  // POST /bus/routes — Admin.
  app.post('/bus/routes', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = routeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const row = await db.insert(busRoutes).values({ tenantId: t.id, ...parsed.data }).returning().then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });

  // PATCH /bus/routes/:id — Admin.
  app.patch('/bus/routes/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = routeBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const rows = await db.update(busRoutes).set(parsed.data).where(and(eq(busRoutes.id, id), eq(busRoutes.tenantId, t.id))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    return { ok: true, data: rows[0] };
  });

  // DELETE /bus/routes/:id — Admin.
  app.delete('/bus/routes/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const rows = await db.delete(busRoutes).where(and(eq(busRoutes.id, id), eq(busRoutes.tenantId, t.id))).returning({ id: busRoutes.id });
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    return { ok: true };
  });

  async function routeInTenant(tenantId: string, routeId: string) {
    const row = await db.select().from(busRoutes).where(eq(busRoutes.id, routeId)).then((r) => r[0] ?? null);
    if (!row) return { error: 'missing' as const };
    if (row.tenantId !== tenantId) return { error: 'cross' as const };
    return { row };
  }

  // GET /bus/routes/:id/stops — any member.
  app.get('/bus/routes/:id/stops', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const found = await routeInTenant(t.id, id);
    if (found.error === 'missing') return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    if (found.error === 'cross') return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Route belongs to another school.' } });
    const rows = await db.select().from(busStops).where(eq(busStops.routeId, id)).orderBy(asc(busStops.order), asc(busStops.pickupTime));
    return { data: rows };
  });

  // POST /bus/routes/:id/stops — Admin.
  app.post('/bus/routes/:id/stops', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = stopBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const found = await routeInTenant(t.id, id);
    if (found.error === 'missing') return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    if (found.error === 'cross') return reply.code(400).send({ error: { code: 'CROSS_TENANT', message: 'Route belongs to another school.' } });
    const row = await db.insert(busStops).values({ routeId: id, ...parsed.data }).returning().then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });

  // PATCH /bus/stops/:id — Admin.
  app.patch('/bus/stops/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = stopBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const stop = await db.select().from(busStops).where(eq(busStops.id, id)).then((r) => r[0]);
    if (!stop) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Stop not found.' } });
    const found = await routeInTenant(t.id, stop.routeId);
    if (found.error) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Stop not found.' } });
    const rows = await db.update(busStops).set(parsed.data).where(eq(busStops.id, id)).returning();
    return { ok: true, data: rows[0] };
  });

  // DELETE /bus/stops/:id — Admin.
  app.delete('/bus/stops/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const stop = await db.select().from(busStops).where(eq(busStops.id, id)).then((r) => r[0]);
    if (!stop) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Stop not found.' } });
    const found = await routeInTenant(t.id, stop.routeId);
    if (found.error) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Stop not found.' } });
    await db.delete(busStops).where(eq(busStops.id, id));
    return { ok: true };
  });

  void 0;
}

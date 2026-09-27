import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, count, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { memberships, parentLinks, students, users } from '../../db/schema';
import { requireAuth, resolveTenant, requireRole, roleOf, tenantOf } from '../../middlewares/tenant';
import { pageResult, parsePaging } from '../../utils/pagination';

const phone = z.string().trim().min(6).max(20).regex(/^[+\d][\d\s\-()]*$/, 'Enter a valid phone number');
const body = z.object({
  name: z.string().trim().min(2).max(60),
  age: z.number().int().min(1).max(10),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.string().trim().min(1).max(60),
  classId: z.string().uuid().nullable().optional(),
  parent: z.string().trim().min(2).max(60),
  phone,
  email: z.string().trim().email().max(100).optional().or(z.literal('')),
  address: z.string().trim().max(140).optional(),
  emoji: z.string().max(10).default('🧒'),
  color: z.string().max(20).default('#E4EBFF'),
  status: z.enum(['active', 'inactive', 'waitlist']).default('active'),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allergies: z.string().max(140).optional(),
  notes: z.string().max(500).optional(),
});

export async function studentRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const query = req.query as Record<string, string>;
    const q = (query.q ?? '').trim();
    const { page, limit, offset } = parsePaging(query);
    const role = roleOf(req);

    // Parent scoping: only students linked to req.user.sub via parent_links.
    let linkedIds: string[] | null = null;
    if (role === 'Parent') {
      const userId = (req.user as { sub: string }).sub;
      const links = await db
        .select({ studentId: parentLinks.studentId })
        .from(parentLinks)
        .where(and(eq(parentLinks.tenantId, t.id), eq(parentLinks.userId, userId)));
      linkedIds = links.map((l) => l.studentId);
      if (linkedIds.length === 0) return pageResult([], 0, page, limit);
    }

    const base = and(
      eq(students.tenantId, t.id),
      isNull(students.deletedAt),
      linkedIds ? inArray(students.id, linkedIds) : undefined,
      q ? or(ilike(students.name, `%${q}%`), ilike(students.parent, `%${q}%`)) : undefined
    );
    const [{ n: total }] = await db.select({ n: count() }).from(students).where(base);
    const data = await db.select().from(students).where(base).limit(limit).offset(offset);
    return pageResult(data, Number(total), page, limit);
  });

  // Admin: list linked parents for one student.
  app.get('/:id/links', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const student = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, id), eq(students.tenantId, t.id), isNull(students.deletedAt)))
      .then((r) => r[0]);
    if (!student) return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
    const rows = await db
      .select({ userId: users.id, name: users.name, email: users.email })
      .from(parentLinks)
      .innerJoin(users, eq(parentLinks.userId, users.id))
      .where(and(eq(parentLinks.tenantId, t.id), eq(parentLinks.studentId, id)));
    return { data: rows };
  });

  // Admin: link a parent account (by email) to a student. Idempotent.
  app.post('/:id/link', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({ email: z.string().trim().email().max(100) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const student = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, id), eq(students.tenantId, t.id), isNull(students.deletedAt)))
      .then((r) => r[0]);
    if (!student) return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await db.select().from(users).where(eq(users.email, email)).then((r) => r[0]);
    if (!user) return reply.code(404).send({ error: { code: 'USER_NOT_FOUND', message: 'No account with this email yet. Send them a Parent invite from the School page first, then link.' } });
    const mem = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.tenantId, t.id)))
      .then((r) => r[0]);
    if (!mem) return reply.code(403).send({ error: { code: 'NOT_A_MEMBER', message: 'This account has not joined this school yet. Ask them to accept the Parent invite first, then link.' } });
    const existing = await db
      .select({ id: parentLinks.id })
      .from(parentLinks)
      .where(and(eq(parentLinks.tenantId, t.id), eq(parentLinks.userId, user.id), eq(parentLinks.studentId, id)))
      .then((r) => r[0]);
    if (existing) return { ok: true, existed: true };
    await db.insert(parentLinks).values({ tenantId: t.id, userId: user.id, studentId: id });
    return reply.code(201).send({ ok: true, existed: false });
  });

  // Admin: unlink a parent. Supports BOTH:
  //   DELETE /students/:id/link/:userId   (preferred, params)
  //   DELETE /students/:id/link  {userId}  (body fallback)
  const unlink = async (req: FastifyRequest, reply: FastifyReply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string; userId?: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const fromParams = (req.params as { userId?: string }).userId;
    const fromBody = (req.body as { userId?: string } | undefined)?.userId;
    const userId = fromParams ?? fromBody;
    if (!userId || typeof userId !== 'string') {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'userId is required (path param or {userId} body).' } });
    }
    await db
      .delete(parentLinks)
      .where(and(eq(parentLinks.tenantId, t.id), eq(parentLinks.studentId, id), eq(parentLinks.userId, userId)));
    return { ok: true };
  };
  app.delete('/:id/link/:userId', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, unlink);
  app.delete('/:id/link', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, unlink);

  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message, fields: parsed.error.flatten().fieldErrors } });
    const t = tenantOf(req);
    const row = await db.insert(students).values({ tenantId: t.id, ...parsed.data, classId: parsed.data.classId ?? null, email: parsed.data.email || null }).returning().then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });

  app.put('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = body.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const rows = await db.update(students).set({ ...parsed.data }).where(and(eq(students.id, id), eq(students.tenantId, t.id), isNull(students.deletedAt))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Student not found.' } });
    return { ok: true, data: rows[0] };
  });

  app.delete('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const rows = await db.update(students).set({ deletedAt: new Date() }).where(and(eq(students.id, id), eq(students.tenantId, t.id), isNull(students.deletedAt))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Student not found.' } });
    return { ok: true };
  });
}

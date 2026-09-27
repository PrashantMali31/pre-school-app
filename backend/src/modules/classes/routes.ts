import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { classes } from '../../db/schema';
import { requireAuth, resolveTenant, requireRole, tenantOf } from '../../middlewares/tenant';
import { pageResult, parsePaging } from '../../utils/pagination';

const body = z.object({
  name: z.string().trim().min(2).max(60),
  ageGroup: z.string().trim().max(40).default('—'),
  capacity: z.number().int().min(1).max(200),
  room: z.string().trim().max(80).default('—'),
  time: z.string().trim().max(40).default('—'),
  color: z.string().trim().max(20).default('#7C9DFF'),
  teacherId: z.string().uuid().nullable().optional(),
});

export async function classRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const where = and(eq(classes.tenantId, t.id), isNull(classes.deletedAt));
    const total = await db.select({ n: count() }).from(classes).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db.select().from(classes).where(where).limit(limit).offset(offset);
    return pageResult(rows, total, page, limit);
  });

  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const row = await db.insert(classes).values({ tenantId: t.id, ...parsed.data, teacherId: parsed.data.teacherId ?? null }).returning().then((r) => r[0]);
    return reply.code(201).send({ data: row });
  });

  app.put('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = body.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Provide at least one field to update.' } });
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const rows = await db.update(classes).set({ ...parsed.data }).where(and(eq(classes.id, id), eq(classes.tenantId, t.id), isNull(classes.deletedAt))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Class not found.' } });
    return { ok: true, data: rows[0] };
  });

  app.delete('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const { students, teachers } = await import('../../db/schema.js');
    const kids = await db.select({ id: students.id }).from(students).where(and(eq(students.tenantId, t.id), eq(students.classId, id))).limit(1);
    const staff = await db.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.tenantId, t.id), eq(teachers.classId, id))).limit(1);
    if (kids.length > 0 || staff.length > 0) {
      return reply.code(409).send({ error: { code: 'CLASS_IN_USE', message: 'Move linked kids/teachers first.' } });
    }
    const rows = await db.update(classes).set({ deletedAt: new Date() }).where(and(eq(classes.id, id), eq(classes.tenantId, t.id), isNull(classes.deletedAt))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Class not found.' } });
    return { ok: true };
  });
}

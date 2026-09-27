import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { teachers } from '../../db/schema';
import { requireAuth, resolveTenant, requireRole, tenantOf } from '../../middlewares/tenant';
import { pageResult, parsePaging } from '../../utils/pagination';

const body = z.object({
  name: z.string().trim().min(2).max(60),
  role: z.string().trim().min(2).max(60),
  classId: z.string().uuid().nullable().optional(),
  phone: z.string().trim().min(6).max(20),
  email: z.string().trim().email().max(100).optional().or(z.literal('')),
  emoji: z.string().max(10).default('🦉'),
  color: z.string().max(20).default('#E4EBFF'),
  status: z.enum(['active', 'leave']).default('active'),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function teacherRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const where = and(eq(teachers.tenantId, t.id), isNull(teachers.deletedAt));
    const total = await db.select({ n: count() }).from(teachers).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db.select().from(teachers).where(where).limit(limit).offset(offset);
    return pageResult(rows, total, page, limit);
  });
  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const row = await db.insert(teachers).values({ tenantId: t.id, ...parsed.data, classId: parsed.data.classId ?? null, email: parsed.data.email || '' }).returning().then((r) => r[0]);
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
    const rows = await db.update(teachers).set({ ...parsed.data }).where(and(eq(teachers.id, id), eq(teachers.tenantId, t.id), isNull(teachers.deletedAt))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Teacher not found.' } });
    return { ok: true, data: rows[0] };
  });
  app.delete('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    }
    const rows = await db.update(teachers).set({ deletedAt: new Date() }).where(and(eq(teachers.id, id), eq(teachers.tenantId, t.id), isNull(teachers.deletedAt))).returning();
    if (rows.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Teacher not found.' } });
    return { ok: true };
  });
}

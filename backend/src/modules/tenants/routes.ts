import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { schoolOptions, schoolProfiles, tenants } from '../../db/schema';
import { requireAuth, resolveTenant, requireRole, tenantOf } from '../../middlewares/tenant';
import { DEFAULT_OPTIONS } from '../../utils/defaults';
import { slugify } from '../../utils/security';

export async function tenantRoutes(app: FastifyInstance) {
  // schools I belong to
  app.get('/mine', { preHandler: requireAuth }, async (req) => {
    const userId = (req.user as { sub: string }).sub;
    const { memberships } = await import('../../db/schema.js');
    const mems = await db.select().from(memberships).where(eq(memberships.userId, userId));
    const out = [];
    for (const m of mems) {
      const t = await db.select().from(tenants).where(eq(tenants.id, m.tenantId)).then((r) => r[0]);
      if (t) out.push({ ...t, role: m.role });
    }
    return { data: out };
  });

  // create another school (founder becomes Admin)
  app.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z.object({ name: z.string().trim().min(2).max(60), plan: z.enum(['Starter', 'Pro', 'Enterprise']).default('Starter') }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const userId = (req.user as { sub: string }).sub;
    const me = await db.select().from((await import('../../db/schema.js')).users).where(eq((await import('../../db/schema.js')).users.id, userId)).then((r) => r[0]);
    const base = slugify(parsed.data.name);
    let slug = base;
    let n = 2;
    while (await db.select().from(tenants).where(eq(tenants.slug, slug)).then((r) => r[0])) slug = `${base}-${n++}`;
    const tenant = await db.insert(tenants).values({ slug, name: parsed.data.name.trim(), plan: parsed.data.plan }).returning().then((r) => r[0]);
    await db.insert(schoolProfiles).values({ tenantId: tenant.id, name: tenant.name, principal: me?.name ?? '' });
    await db.insert(schoolOptions).values({ tenantId: tenant.id, ...DEFAULT_OPTIONS });
    await db.insert((await import('../../db/schema.js')).memberships).values({ userId, tenantId: tenant.id, role: 'Admin' });
    // Subscription follows the chosen plan (test-mode charge recorded for paid plans).
    const { startSubscription } = await import('../billing/routes.js');
    const code = parsed.data.plan.toLowerCase() as 'starter' | 'pro' | 'enterprise';
    await startSubscription(tenant.id, code, code === 'enterprise' ? 'custom' : 'monthly', userId);
    return reply.code(201).send({ data: tenant });
  });

  // delete a school (Admin of that school only; related rows cascade via FK)
  app.delete('/:slug', { preHandler: requireAuth }, async (req, reply) => {
    const slug = (req.params as { slug?: string }).slug?.trim();
    if (!slug) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'School slug required.' } });
    const userId = (req.user as { sub: string }).sub;
    const tenant = await db.select().from(tenants).where(eq(tenants.slug, slug)).then((r) => r[0]);
    if (!tenant) return reply.code(404).send({ error: { code: 'TENANT_NOT_FOUND', message: 'School not found.' } });
    const { memberships } = await import('../../db/schema.js');
    const mem = await db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenant.id))).then((r) => r[0]);
    if (!mem) return reply.code(403).send({ error: { code: 'NOT_A_MEMBER', message: 'You are not a member of this school.' } });
    if (mem.role !== 'Admin') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Only an Admin can delete this school.' } });
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    return { ok: true };
  });

  // school profile
  app.get('/profile', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const profile = await db.select().from(schoolProfiles).where(eq(schoolProfiles.tenantId, t.id)).then((r) => r[0]);
    return { data: profile };
  });

  app.put('/profile', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({
      name: z.string().trim().min(2).max(60),
      tagline: z.string().trim().min(2).max(80),
      phone: z.string().trim().min(6).max(20),
      email: z.string().trim().email().max(100),
      address: z.string().trim().min(5).max(140),
      principal: z.string().trim().min(2).max(60),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    await db.update(schoolProfiles).set({ ...parsed.data }).where(eq(schoolProfiles.tenantId, t.id));
    await db.update(tenants).set({ name: parsed.data.name }).where(eq(tenants.id, t.id));
    return { ok: true };
  });
}

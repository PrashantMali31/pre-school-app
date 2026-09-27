import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { schoolOptions } from '../../db/schema';
import { requireAuth, resolveTenant, requireRole, tenantOf } from '../../middlewares/tenant';
import { DEFAULT_OPTIONS } from '../../utils/defaults';

const KEYS = ['staffRoles', 'genders', 'eventTypes', 'sources', 'audiences', 'feeTitles'] as const;
const listSchema = z.array(z.string().trim().min(1).max(60)).min(1).max(40);

export async function optionsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const row = await db.select().from(schoolOptions).where(eq(schoolOptions.tenantId, t.id)).then((r) => r[0]);
    return { data: row ?? { tenantId: t.id, ...DEFAULT_OPTIONS } };
  });

  app.put('/:key', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const key = (req.params as { key: string }).key;
    if (!(KEYS as readonly string[]).includes(key)) return reply.code(400).send({ error: { code: 'BAD_KEY', message: 'Unknown option list.' } });
    const parsed = listSchema.safeParse((req.body as { values?: unknown })?.values);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Keep 1–40 options, each 1–60 chars.' } });
    // de-dupe case-insensitively
    const seen = new Set<string>();
    const values: string[] = [];
    for (const v of parsed.data.map((s) => s.trim()).filter(Boolean)) {
      const k = v.toLowerCase();
      if (!seen.has(k)) { seen.add(k); values.push(v); }
    }
    const t = tenantOf(req);
    await db.update(schoolOptions).set({ [key]: values }).where(eq(schoolOptions.tenantId, t.id));
    return { ok: true, data: values };
  });

  app.post('/reset/:key', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const key = (req.params as { key: string }).key as keyof typeof DEFAULT_OPTIONS;
    if (!DEFAULT_OPTIONS[key]) return reply.code(400).send({ error: { code: 'BAD_KEY', message: 'Unknown option list.' } });
    const t = tenantOf(req);
    await db.update(schoolOptions).set({ [key]: [...DEFAULT_OPTIONS[key]] }).where(eq(schoolOptions.tenantId, t.id));
    return { ok: true, data: [...DEFAULT_OPTIONS[key]] };
  });
}

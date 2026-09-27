import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { memberships, tenants } from '../db/schema';

export type Role = 'Admin' | 'Teacher' | 'Parent';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Please log in.' } });
  }
}

/** Resolve tenant from X-Tenant-Slug header (later: subdomain). Verifies membership. */
export async function resolveTenant(req: FastifyRequest, reply: FastifyReply) {
  const slug = (req.headers['x-tenant-slug'] as string | undefined)?.trim();
  if (!slug) return reply.code(400).send({ error: { code: 'TENANT_REQUIRED', message: 'Missing X-Tenant-Slug header.' } });
  const userId = (req.user as { sub: string }).sub;
  const tenant = await db.select().from(tenants).where(eq(tenants.slug, slug)).then((r) => r[0]);
  if (!tenant) return reply.code(404).send({ error: { code: 'TENANT_NOT_FOUND', message: 'School not found.' } });
  const mem = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenant.id)))
    .then((r) => r[0]);
  if (!mem) return reply.code(403).send({ error: { code: 'NOT_A_MEMBER', message: 'You are not a member of this school.' } });
  (req as unknown as { tenant: typeof tenant; membershipRole: Role }).tenant = tenant;
  (req as unknown as { membershipRole: Role }).membershipRole = mem.role as Role;
}

export function requireRole(...allowed: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const role = (req as unknown as { membershipRole?: Role }).membershipRole;
    if (!role || !allowed.includes(role)) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } });
    }
  };
}

export function tenantOf(req: FastifyRequest) {
  return (req as unknown as { tenant: { id: string; slug: string } }).tenant;
}

export function roleOf(req: FastifyRequest): Role {
  return (req as unknown as { membershipRole: Role }).membershipRole;
}

import { eq } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { db } from '../db/client';

/**
 * Cross-tenant FK guard (shared helper for all route modules).
 *
 * Agent A owns domain/classes/students/teachers/import route files — DO NOT
 * duplicate FK logic there. Instead, those files should import this helper and
 * call `requireSameTenant` before linking a row from another table, e.g.:
 *
 * ```ts
 * import { requireSameTenant } from '../../utils/tenantGuard';
 * import { classes, students, teachers } from '../../db/schema';
 *
 * // POST /students with { classId }: class must belong to the request tenant.
 * if (body.classId && !(await requireSameTenant(reply, classes, body.classId, t.id))) return;
 * // POST /invoices with { studentId }: student must belong to the tenant.
 * if (!(await requireSameTenant(reply, students, body.studentId, t.id))) return;
 * // PUT /classes/:id with { teacherId }: teacher must belong to the tenant.
 * if (body.teacherId && !(await requireSameTenant(reply, teachers, body.teacherId, t.id))) return;
 * ```
 *
 * On mismatch the helper replies `400 { error: { code: 'CROSS_TENANT', ... } }`
 * and returns false (caller must return early). On match it returns true.
 * Unknown ids return 404 ROW_NOT_FOUND — deliberately distinct from CROSS_TENANT
 * so clients can tell "missing" from "belongs to another school".
 *
 * Any drizzle table with string `id` + `tenantId` columns works (classes,
 * students, teachers, and friends). Membership-scoped writes in
 * auth/invites/tenants route files already constrain inserts to the resolved
 * tenant id; this helper covers the remaining FK-link case.
 */

// Minimal structural type for drizzle tables that carry id + tenantId columns.
interface TenantRow {
  id: string;
  tenantId: string;
}

interface TenantTable {
  id: unknown;
  tenantId: unknown;
}

/** Load a row by id and check it belongs to `tenantId`. Null => not found. */
export async function assertSameTenant(
  table: TenantTable,
  id: string,
  tenantId: string
): Promise<TenantRow | null | 'cross-tenant'> {
  const rows = await db
    .select({ id: table.id as never, tenantId: table.tenantId as never })
    .from(table as never)
    .where(eq(table.id as never, id as never))
    .then((r) => r as unknown as TenantRow[]);
  const row = rows[0];
  if (!row) return null;
  if (row.tenantId !== tenantId) return 'cross-tenant';
  return row;
}

/**
 * Fastify-friendly wrapper: sends 404 (missing) or 400 CROSS_TENANT and
 * returns false when the check fails; returns true when the FK is safe.
 */
export async function requireSameTenant(
  reply: FastifyReply,
  table: TenantTable,
  id: string,
  tenantId: string,
  label = 'Linked record'
): Promise<boolean> {
  const res = await assertSameTenant(table, id, tenantId);
  if (res === null) {
    void reply.code(404).send({ error: { code: 'ROW_NOT_FOUND', message: `${label} not found.` } });
    return false;
  }
  if (res === 'cross-tenant') {
    void reply.code(400).send({ error: { code: 'CROSS_TENANT', message: `${label} belongs to a different school.` } });
    return false;
  }
  return true;
}

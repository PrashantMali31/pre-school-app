import { db } from '../db/client';
import { auditLogs } from '../db/schema';

/**
 * writeAudit — single writer for the append-only `audit_logs` table.
 *
 *   await writeAudit(tenantId, userId, action, entity, entityId, summary)
 *
 * `userId`/`entityId` accept null (system actions, tenant-level events).
 * Failures are swallowed (warn only) so audit can never break the primary
 * write path — in particular the table may not exist yet in databases that
 * were migrated before this table was added (we never run db:generate /
 * db:migrate from feature work; the orchestrator runs migrations).
 *
 * ---- WIRING POINTS FOR THE ORCHESTRATOR (other agents own these files) ----
 *
 * 1) payments void — backend/src/modules/payments/routes.ts, in the
 *    POST `/:id/void` handler after a successful void:
 *
 *      import { writeAudit } from '../../utils/audit';
 *      await writeAudit(t.id, callerUserId, 'payments.void', 'payment', pid,
 *        `Voided payment ${pid} on invoice ${invoiceId}${reason ? `: ${reason}` : ''}`);
 *
 *    (`t` is tenantOf(req); callerUserId is (req.user as { sub: string }).sub.)
 *
 * 2) comms announce — backend/src/modules/comms/routes.ts, after a successful
 *    announcement broadcast / reminder run:
 *
 *      import { writeAudit } from '../../utils/audit';
 *      await writeAudit(t.id, callerUserId, 'comms.announce', 'announcement', announcementId,
 *        `Announced "${title}" to ${audience} (${sentCount} sent)`);
 *
 * 3) Suggested later (same one-liner shape): students/teachers/invoices
 *    create+delete in backend/src/modules/domain/routes.ts, e.g.
 *    `await writeAudit(t.id, uid, 'students.create', 'student', row.id, \`Admitted ${row.name}\`)`.
 */
export async function writeAudit(
  tenantId: string,
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string
): Promise<void> {
  try {
    await db.insert(auditLogs).values({ tenantId, userId, action, entity, entityId, summary });
  } catch (e) {
    console.warn('[audit] write failed (non-fatal):', e instanceof Error ? e.message : e);
  }
}

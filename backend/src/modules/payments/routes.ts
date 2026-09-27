import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { invoices, parentLinks, payments } from '../../db/schema';
import { requireAuth, requireRole, resolveTenant, roleOf, tenantOf } from '../../middlewares/tenant';

/* Fee-money handling.
 *
 * Mount: orchestrator registers this plugin (e.g. prefix `/payments`).
 * Both styles live in this one file:
 *   Canonical (assuming `/payments` prefix):
 *     POST   `/`                     — record a payment
 *     GET    `/invoice/:invoiceId`   — list payments + totals for one invoice
 *     POST   `/:id/void`             — void a payment (refund/correction)
 *     GET    `/:id`                  — fetch one payment (receipt)
 *   Nested-helper alias (same prefix):
 *     POST   `/:invoiceId/payments`  — same as POST `/` with invoiceId from path
 *     GET    `/:invoiceId/payments`  — same as GET `/invoice/:invoiceId`
 *   If the orchestrator ALSO mounts this plugin under `/invoices`, the nested
 *   aliases resolve as `/invoices/:invoiceId/payments` with no extra code.
 *
 * NOTE on `partial`: invoice_status enum is only paid|pending|overdue and is
 * intentionally NOT altered (other modules depend on it). A partially-paid
 * invoice keeps its pending/overdue status in the DB; "Partial" is a display
 * concept derived as 0 < totalPaidCents < amountCents. Every response carries
 * totalPaidCents + balanceCents so the frontend can render Partial + receipts.
 *
 * Legacy POST /invoices/:id/pay (domain/routes.ts) is untouched and keeps
 * working — it simply flips status to paid. Prefer the payments API below.
 */

const METHODS = ['Cash', 'UPI', 'Card', 'Bank'] as const;

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const createBody = z.object({
  invoiceId: uuidSchema,
  amountCents: z.number().int().positive().max(100_000_000).optional(),
  amount: z.number().positive().max(1_000_000).optional(),
  method: z.enum(METHODS),
  reference: z.string().trim().max(100).optional().nullable(),
  receivedAt: dateSchema,
});

const createNestedBody = z.object({
  amountCents: z.number().int().positive().max(100_000_000).optional(),
  amount: z.number().positive().max(1_000_000).optional(),
  method: z.enum(METHODS),
  reference: z.string().trim().max(100).optional().nullable(),
  receivedAt: dateSchema,
});

const voidBody = z.object({ reason: z.string().trim().max(300).optional() }).nullish();

type InvoiceRow = typeof invoices.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

function err(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, code: number, errCode: string, message: string) {
  return reply.code(code).send({ error: { code: errCode, message } });
}

function toCents(amountCents?: number, amount?: number): number | null {
  if (typeof amountCents === 'number') return Math.round(amountCents);
  if (typeof amount === 'number') return Math.round(amount * 100);
  return null;
}

function serialize(p: PaymentRow) {
  return { ...p, amount: p.amountCents / 100 };
}

async function sumPaid(invoiceId: string): Promise<number> {
  const rows = await db
    .select({ amountCents: payments.amountCents })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.voidedAt)));
  return rows.reduce((a, r) => a + r.amountCents, 0);
}

async function lastMethod(invoiceId: string): Promise<string | null> {
  const rows = await db
    .select({ method: payments.method })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.voidedAt)))
    .orderBy(asc(payments.createdAt))
    .limit(100);
  return rows.length > 0 ? rows[rows.length - 1].method : null;
}

/** Recompute invoice status from totals. Returns the resulting status. */
async function refreshInvoiceStatus(inv: InvoiceRow, totalPaid: number): Promise<InvoiceRow['status']> {
  if (totalPaid >= inv.amountCents) {
    if (inv.status !== 'paid') {
      const method = (await lastMethod(inv.id)) ?? 'UPI';
      await db.update(invoices).set({ status: 'paid', method }).where(eq(invoices.id, inv.id));
    }
    return 'paid';
  }
  if (inv.status === 'paid') {
    await db.update(invoices).set({ status: 'pending', method: null }).where(eq(invoices.id, inv.id));
    return 'pending';
  }
  return inv.status;
}

async function findInvoiceAnyTenant(id: string): Promise<InvoiceRow | undefined> {
  return db.select().from(invoices).where(eq(invoices.id, id)).then((r) => r[0]);
}

async function parentCanSee(req: Parameters<typeof roleOf>[0], tenantId: string, studentId: string): Promise<boolean> {
  if (roleOf(req) !== 'Parent') return true;
  const userId = (req.user as { sub: string }).sub;
  const links = await db
    .select({ studentId: parentLinks.studentId })
    .from(parentLinks)
    .where(and(eq(parentLinks.tenantId, tenantId), eq(parentLinks.userId, userId)));
  return links.some((l) => l.studentId === studentId);
}

async function recordPayment(
  req: Parameters<typeof tenantOf>[0] & { user?: unknown; body?: unknown },
  reply: Parameters<typeof err>[0],
  invoiceId: string,
  rawBody: unknown
) {
  const parsed = (invoiceId ? createNestedBody : createBody).safeParse(rawBody);
  // For the canonical POST `/` the body carries invoiceId; validate it too.
  let invId = invoiceId;
  let cents: number | null = null;
  let method: (typeof METHODS)[number] | undefined;
  let reference: string | null = null;
  let receivedAt = '';
  if (invoiceId) {
    if (!parsed.success) return err(reply, 400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid payment.');
    cents = toCents(parsed.data.amountCents, parsed.data.amount);
    method = parsed.data.method;
    reference = parsed.data.reference?.trim() ? parsed.data.reference.trim() : null;
    receivedAt = parsed.data.receivedAt;
  } else {
    const full = createBody.safeParse(rawBody);
    if (!full.success) return err(reply, 400, 'VALIDATION', full.error.issues[0]?.message ?? 'Invalid payment.');
    invId = full.data.invoiceId;
    cents = toCents(full.data.amountCents, full.data.amount);
    method = full.data.method;
    reference = full.data.reference?.trim() ? full.data.reference.trim() : null;
    receivedAt = full.data.receivedAt;
  }
  if (!uuidSchema.safeParse(invId).success) return err(reply, 400, 'VALIDATION', 'Invalid invoiceId.');
  if (cents === null || !Number.isFinite(cents) || cents <= 0) {
    return err(reply, 400, 'VALIDATION', 'Provide a positive amount (amountCents or amount).');
  }

  const t = tenantOf(req as never);
  const inv = await findInvoiceAnyTenant(invId);
  if (!inv) return err(reply, 404, 'NOT_FOUND', 'Invoice not found.');
  if (inv.tenantId !== t.id) return err(reply, 400, 'CROSS_TENANT', 'Invoice belongs to another school.');

  const paid = await sumPaid(inv.id);
  const balance = inv.amountCents - paid;
  if (balance <= 0) return err(reply, 400, 'OVERPAYMENT', 'Invoice is already paid in full.');
  if (cents > balance) {
    return err(reply, 400, 'OVERPAYMENT', `Amount exceeds balance of ${(balance / 100).toFixed(2)}.`);
  }

  const sub = (req as { user?: { sub?: string } }).user?.sub;
  const createdBy = sub && uuidSchema.safeParse(sub).success ? sub : null;
  const row = await db
    .insert(payments)
    .values({
      tenantId: t.id,
      invoiceId: inv.id,
      amountCents: cents,
      method: method as string,
      reference,
      receivedAt,
      createdBy,
    })
    .returning()
    .then((r) => r[0]);

  const totalPaidCents = paid + cents;
  const balanceCents = inv.amountCents - totalPaidCents;
  const status = await refreshInvoiceStatus(inv, totalPaidCents);
  return reply.code(201).send({ data: { ...serialize(row), totalPaidCents, balanceCents, invoiceStatus: status } });
}

export async function paymentRoutes(app: FastifyInstance) {
  // POST `/` — record payment (Admin only).
  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    return recordPayment(req as never, reply as never, '', req.body);
  });

  // Nested alias POST `/:invoiceId/payments` (Admin only).
  app.post('/:invoiceId/payments', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const { invoiceId } = req.params as { invoiceId: string };
    if (!uuidSchema.safeParse(invoiceId).success) return err(reply as never, 400, 'VALIDATION', 'Invalid id.');
    return recordPayment(req as never, reply as never, invoiceId, req.body);
  });

  // GET `/invoice/:invoiceId` — list + totals (any role; Parents scoped to linked students).
  const listByInvoice = async (req: never, reply: never, invoiceId: string) => {
    const r = req as unknown as Parameters<typeof tenantOf>[0];
    const rp = reply as unknown as Parameters<typeof err>[0];
    if (!uuidSchema.safeParse(invoiceId).success) return err(rp, 400, 'VALIDATION', 'Invalid id.');
    const t = tenantOf(r);
    const inv = await findInvoiceAnyTenant(invoiceId);
    if (!inv || inv.tenantId !== t.id) return err(rp, 404, 'NOT_FOUND', 'Invoice not found.');
    if (!(await parentCanSee(r, t.id, inv.studentId))) return err(rp, 404, 'NOT_FOUND', 'Invoice not found.');
    const rows = await db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, inv.id), eq(payments.tenantId, t.id)))
      .orderBy(asc(payments.receivedAt));
    const totalPaidCents = rows.filter((p) => !p.voidedAt).reduce((a, p) => a + p.amountCents, 0);
    const balanceCents = inv.amountCents - totalPaidCents;
    return { data: rows.map(serialize), totalPaidCents, balanceCents, invoice: { id: inv.id, status: inv.status, amountCents: inv.amountCents } };
  };
  app.get('/invoice/:invoiceId', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const { invoiceId } = req.params as { invoiceId: string };
    return listByInvoice(req as never, reply as never, invoiceId);
  });

  // Nested alias GET `/:invoiceId/payments` (any role).
  app.get('/:invoiceId/payments', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const { invoiceId } = req.params as { invoiceId: string };
    return listByInvoice(req as never, reply as never, invoiceId);
  });

  // GET `/:id` — single payment (any role; Parents scoped via the invoice link).
  app.get('/:id', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const t = tenantOf(req);
    const row = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.tenantId, t.id))).then((r) => r[0]);
    if (!row) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Payment not found.' } });
    const inv = await findInvoiceAnyTenant(row.invoiceId);
    if (!inv || inv.tenantId !== t.id) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Payment not found.' } });
    if (!(await parentCanSee(req, t.id, inv.studentId))) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Payment not found.' } });
    const totalPaidCents = await sumPaid(inv.id);
    return { data: serialize(row), totalPaidCents, balanceCents: inv.amountCents - totalPaidCents };
  });

  // POST `/:id/void` — void a payment (Admin only). Idempotent.
  app.post('/:id/void', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsedBody = voidBody.safeParse(req.body);
    if (!parsedBody.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsedBody.error.issues[0]?.message } });
    const { id } = req.params as { id: string };
    if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    const t = tenantOf(req);
    const row = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.tenantId, t.id))).then((r) => r[0]);
    if (!row) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Payment not found.' } });
    if (!row.voidedAt) {
      await db.update(payments).set({ voidedAt: new Date() }).where(eq(payments.id, row.id));
    }
    const inv = await findInvoiceAnyTenant(row.invoiceId);
    if (inv && inv.tenantId === t.id) {
      const totalPaidCents = await sumPaid(inv.id);
      await refreshInvoiceStatus(inv, totalPaidCents);
    }
    return { ok: true };
  });
}

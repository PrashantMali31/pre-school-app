import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  announcements,
  invoices,
  memberships,
  messageDeliveries,
  reminderRuns,
  students,
} from '../../db/schema';
import { requireAuth, requireRole, resolveTenant, tenantOf } from '../../middlewares/tenant';
import { pageResult, parsePaging } from '../../utils/pagination';
import { deliver, type CommsChannel } from './provider';

/* Parent communication.
 * Mount: orchestrator registers this plugin with prefix `/comms`.
 *   GET  `/templates`       — built-in message templates (any member)
 *   POST `/announce`        — create announcement + fan-out deliveries (Admin/Teacher)
 *   GET  `/deliveries`      — paginated delivery log for tenant (any member)
 *   GET  `/reminders`       — reminder run history (any member)
 *   POST `/reminders/fee`   — fee reminders to overdue parents (Admin only)
 */

export interface MessageTemplate {
  key: string;
  title: string;
  body: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'fee_reminder',
    title: 'Fee reminder',
    body: 'Dear {{parent}}, this is a gentle reminder that {{student}}\u2019s fee of \u20B9{{amount}} was due on {{dueDate}}. Please pay at your earliest convenience. \u2014 {{school}}',
  },
  {
    key: 'absence_alert',
    title: 'Absence alert',
    body: 'Hi {{parent}}, {{student}} was marked absent on {{date}}. Please reply if you need to share anything with the class teacher. \u2014 {{school}}',
  },
  {
    key: 'event_invite',
    title: 'Event invite',
    body: 'You\u2019re invited, {{parent}}! {{event}} is on {{date}} at {{time}} ({{location}}). We\u2019d love to see {{student}} there. \u2014 {{school}}',
  },
  {
    key: 'admissions_followup',
    title: 'Admissions follow-up',
    body: 'Hi {{parent}}, thanks for your interest in our school for {{child}}! We\u2019d love to host you for a campus tour \u2014 reply to this message to pick a slot. \u2014 {{school}}',
  },
];

// Same shape as the announcements POST in domain/routes.ts.
const announcementShape = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(5).max(600),
  audience: z.string().trim().min(2).max(60),
});

const announceBody = z.object({
  title: announcementShape.shape.title,
  body: announcementShape.shape.body,
  audience: announcementShape.shape.audience.optional().default('All Parents'),
  channel: z.enum(['inapp', 'sms', 'whatsapp']).optional().default('inapp'),
});

const uuidSchema = z.string().uuid();

type DeliveryCounts = { total: number; sent: number; failed: number; queued: number };

function countDeliveries(rows: Array<{ status: string }>): DeliveryCounts {
  return {
    total: rows.length,
    sent: rows.filter((r) => r.status === 'sent').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    queued: rows.filter((r) => r.status === 'queued').length,
  };
}

export async function commsRoutes(app: FastifyInstance) {
  // GET /templates — 4 built-ins with {{placeholders}}.
  app.get('/templates', { preHandler: [requireAuth, resolveTenant] }, async () => {
    return { data: MESSAGE_TEMPLATES };
  });

  // POST /announce — create announcement + fan-out deliveries (Admin/Teacher).
  app.post('/announce', { preHandler: [requireAuth, resolveTenant, requireRole('Admin', 'Teacher')] }, async (req, reply) => {
    const parsed = announceBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid announcement.' } });
    const t = tenantOf(req);
    const channel = parsed.data.channel as CommsChannel;

    const row = await db
      .insert(announcements)
      .values({ tenantId: t.id, title: parsed.data.title, body: parsed.data.body, audience: parsed.data.audience })
      .returning()
      .then((r) => r[0]);

    // Resolve recipients: inapp -> member userIds; sms/whatsapp -> distinct parent phones.
    let recipients: string[] = [];
    if (channel === 'inapp') {
      const mems = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.tenantId, t.id));
      recipients = [...new Set(mems.map((m) => m.userId).filter(Boolean))];
      if (recipients.length === 0) recipients = ['all'];
    } else {
      const studs = await db
        .select({ phone: students.phone })
        .from(students)
        .where(and(eq(students.tenantId, t.id), isNull(students.deletedAt)));
      recipients = [...new Set(studs.map((s) => (s.phone ?? '').trim()).filter((p) => p.length >= 6))];
    }

    const text = `${parsed.data.title}\n${parsed.data.body}`;
    const inserted =
      recipients.length > 0
        ? await db
            .insert(messageDeliveries)
            .values(recipients.map((recipient) => ({ tenantId: t.id, announcementId: row.id, channel, recipient, status: 'queued' as const })))
            .returning()
        : [];

    const final: Array<{ status: string }> = [];
    for (const d of inserted) {
      try {
        const res = await deliver(channel, d.recipient, text);
        const status = res.ok ? 'sent' : 'failed';
        await db
          .update(messageDeliveries)
          .set({ status, providerMessageId: res.providerMessageId ?? null, error: res.error ?? null })
          .where(eq(messageDeliveries.id, d.id));
        final.push({ status });
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Delivery error.';
        await db.update(messageDeliveries).set({ status: 'failed', error }).where(eq(messageDeliveries.id, d.id));
        final.push({ status: 'failed' });
      }
    }

    return reply.code(201).send({ data: row, deliveries: countDeliveries(final) });
  });

  // GET /deliveries — paginated log for tenant, optional ?announcementId= filter.
  app.get('/deliveries', { preHandler: [requireAuth, resolveTenant] }, async (req, reply) => {
    const t = tenantOf(req);
    const query = req.query as Record<string, string>;
    const { page, limit, offset } = parsePaging(query);
    const announcementId = (query.announcementId ?? '').trim();

    if (announcementId) {
      if (!uuidSchema.safeParse(announcementId).success) {
        return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invalid announcementId.' } });
      }
      const ann = await db
        .select({ id: announcements.id })
        .from(announcements)
        .where(and(eq(announcements.id, announcementId), eq(announcements.tenantId, t.id)))
        .then((r) => r[0]);
      if (!ann) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Announcement not found.' } });
      const where = and(eq(messageDeliveries.tenantId, t.id), eq(messageDeliveries.announcementId, announcementId));
      const total = await db.select({ n: count() }).from(messageDeliveries).where(where).then((r) => Number(r[0]?.n ?? 0));
      const rows = await db
        .select()
        .from(messageDeliveries)
        .where(where)
        .orderBy(desc(messageDeliveries.createdAt))
        .limit(limit)
        .offset(offset);
      return pageResult(rows, total, page, limit);
    }

    const where = eq(messageDeliveries.tenantId, t.id);
    const total = await db.select({ n: count() }).from(messageDeliveries).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db
      .select()
      .from(messageDeliveries)
      .where(where)
      .orderBy(desc(messageDeliveries.createdAt))
      .limit(limit)
      .offset(offset);
    return pageResult(rows, total, page, limit);
  });

  // GET /reminders — reminder run history for tenant.
  app.get('/reminders', { preHandler: [requireAuth, resolveTenant] }, async (req) => {
    const t = tenantOf(req);
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const where = eq(reminderRuns.tenantId, t.id);
    const total = await db.select({ n: count() }).from(reminderRuns).where(where).then((r) => Number(r[0]?.n ?? 0));
    const rows = await db
      .select()
      .from(reminderRuns)
      .where(where)
      .orderBy(desc(reminderRuns.createdAt))
      .limit(limit)
      .offset(offset);
    return pageResult(rows, total, page, limit);
  });

  // POST /reminders/fee — fee reminders to parents with balance > 0 (Admin only).
  app.post('/reminders/fee', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = z.object({ dryRun: z.boolean().optional().default(false) }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' } });
    const t = tenantOf(req);

    const open = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, t.id), inArray(invoices.status, ['pending', 'overdue'] as const)));

    // Paid totals from the payments table IF it exists (works pre-migration too).
    const paidByInvoice = new Map<string, number>();
    try {
      const { payments } = await import('../../db/schema.js');
      const rows = await db.select().from(payments).where(eq(payments.tenantId, t.id));
      for (const p of rows as Array<{ invoiceId: string; amountCents: number; voidedAt: unknown }>) {
        if (p.voidedAt) continue;
        paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amountCents);
      }
    } catch {
      /* payments table missing (pre-migration) — treat everything as unpaid */
    }

    const studs = await db
      .select({ id: students.id, name: students.name, parent: students.parent, phone: students.phone })
      .from(students)
      .where(and(eq(students.tenantId, t.id), isNull(students.deletedAt)));
    const byId = new Map(studs.map((s) => [s.id, s]));

    // One entry per distinct parent phone with balance > 0.
    const byPhone = new Map<string, { parent: string; studentNames: string[]; totalAmountCents: number; invoiceCount: number }>();
    for (const inv of open) {
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const balance = inv.amountCents - paid;
      if (balance <= 0) continue;
      const s = byId.get(inv.studentId);
      const phone = (s?.phone ?? '').trim();
      if (phone.length < 6) continue;
      const cur = byPhone.get(phone) ?? { parent: s?.parent ?? 'Parent', studentNames: [], totalAmountCents: 0, invoiceCount: 0 };
      if (s && !cur.studentNames.includes(s.name)) cur.studentNames.push(s.name);
      cur.totalAmountCents += balance;
      cur.invoiceCount += 1;
      if (s?.parent) cur.parent = s.parent;
      byPhone.set(phone, cur);
    }

    const parents = [...byPhone.entries()].map(([phone, v]) => ({ phone, ...v }));
    const targetCount = parents.length;
    const totalAmountCents = parents.reduce((a, p) => a + p.totalAmountCents, 0);

    if (parsed.data.dryRun) {
      return { data: { dryRun: true, kind: 'fee', targetCount, totalAmountCents, parents } };
    }

    const sub = (req.user as { sub?: string } | undefined)?.sub;
    const createdBy = sub && uuidSchema.safeParse(sub).success ? sub : null;
    const run = await db
      .insert(reminderRuns)
      .values({ tenantId: t.id, kind: 'fee', targetCount, sentCount: 0, failedCount: 0, createdBy })
      .returning()
      .then((r) => r[0]);

    let sent = 0;
    let failed = 0;
    for (const p of parents) {
      const body = `Dear ${p.parent}, this is a gentle reminder that ${p.studentNames.join(', ') || 'your child'} has an outstanding fee balance of \u20B9${(p.totalAmountCents / 100).toLocaleString('en-IN')} across ${p.invoiceCount} invoice(s). Please pay at your earliest convenience.`;
      const ins = await db
        .insert(messageDeliveries)
        .values({ tenantId: t.id, announcementId: null, channel: 'sms', recipient: p.phone, status: 'queued' as const })
        .returning()
        .then((r) => r[0]);
      try {
        const { sendSMS } = await import('./provider.js');
        const res = await sendSMS(p.phone, body);
        const status = res.ok ? 'sent' : 'failed';
        if (res.ok) sent += 1;
        else failed += 1;
        await db
          .update(messageDeliveries)
          .set({ status, providerMessageId: res.providerMessageId ?? null, error: res.error ?? null })
          .where(eq(messageDeliveries.id, ins.id));
      } catch (e) {
        failed += 1;
        await db.update(messageDeliveries).set({ status: 'failed', error: e instanceof Error ? e.message : 'Delivery error.' }).where(eq(messageDeliveries.id, ins.id));
      }
    }

    const updated = await db
      .update(reminderRuns)
      .set({ sentCount: sent, failedCount: failed })
      .where(eq(reminderRuns.id, run.id))
      .returning()
      .then((r) => r[0]);

    return { data: updated, deliveries: { total: targetCount, sent, failed, queued: 0 }, totalAmountCents };
  });
}

import { api } from './api';

export type CommsChannel = 'inapp' | 'sms' | 'whatsapp';

export interface MessageTemplate {
  key: string;
  title: string;
  body: string;
}

export interface Delivery {
  id: string;
  tenantId?: string;
  announcementId: string | null;
  channel: string;
  recipient: string;
  status: 'queued' | 'sent' | 'failed' | string;
  providerMessageId?: string | null;
  error?: string | null;
  createdAt?: string;
}

export interface DeliveryCounts {
  total: number;
  sent: number;
  failed: number;
  queued: number;
}

export interface ReminderRun {
  id: string;
  kind: string;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  createdAt?: string;
}

export interface FeePreviewParent {
  phone: string;
  parent: string;
  studentNames: string[];
  totalAmountCents: number;
  invoiceCount: number;
}

export interface FeeDryRun {
  dryRun: true;
  kind: string;
  targetCount: number;
  totalAmountCents: number;
  parents: FeePreviewParent[];
}

export const rupees = (cents: number) => `\u20B9${(cents / 100).toLocaleString('en-IN')}`;

export async function listTemplates(slug: string): Promise<MessageTemplate[]> {
  const res = await api<{ data: MessageTemplate[] }>('/comms/templates', { tenantSlug: slug });
  return res.data ?? [];
}

export async function postAnnounce(
  slug: string,
  input: { title: string; body: string; audience: string; channel: CommsChannel }
): Promise<{ data: { id: string }; deliveries: DeliveryCounts }> {
  return api('/comms/announce', { method: 'POST', tenantSlug: slug, body: JSON.stringify(input) });
}

export async function listDeliveries(
  slug: string,
  opts: { announcementId?: string; page?: number; limit?: number } = {}
): Promise<{ data: Delivery[]; total: number }> {
  const params = new URLSearchParams();
  if (opts.announcementId) params.set('announcementId', opts.announcementId);
  params.set('page', String(opts.page ?? 1));
  params.set('limit', String(opts.limit ?? 100));
  const res = await api<{ data: Delivery[]; total: number }>(`/comms/deliveries?${params.toString()}`, {
    tenantSlug: slug,
  });
  return { data: res.data ?? [], total: res.total ?? (res.data ?? []).length };
}

export async function listReminders(slug: string): Promise<{ data: ReminderRun[]; total: number }> {
  const res = await api<{ data: ReminderRun[]; total: number }>('/comms/reminders', { tenantSlug: slug });
  return { data: res.data ?? [], total: res.total ?? (res.data ?? []).length };
}

export async function feeReminderDryRun(slug: string): Promise<FeeDryRun> {
  const res = await api<{ data: FeeDryRun }>('/comms/reminders/fee', {
    method: 'POST',
    tenantSlug: slug,
    body: JSON.stringify({ dryRun: true }),
  });
  return res.data;
}

export async function sendFeeReminders(
  slug: string
): Promise<{ data: ReminderRun; deliveries: DeliveryCounts; totalAmountCents: number }> {
  return api('/comms/reminders/fee', {
    method: 'POST',
    tenantSlug: slug,
    body: JSON.stringify({ dryRun: false }),
  });
}

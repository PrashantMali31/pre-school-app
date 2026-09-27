import { api } from './api';

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank';

export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank'];

export interface Payment {
  id: string;
  tenantId?: string;
  invoiceId: string;
  invoice_id?: string;
  amountCents: number;
  amount?: number;
  method: string;
  reference?: string | null;
  receivedAt: string;
  received_at?: string;
  voidedAt?: string | null;
  voided_at?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoicePayments {
  data: Payment[];
  totalPaidCents: number;
  balanceCents: number;
  invoice?: { id: string; status: string; amountCents: number };
}

export interface RecordPaymentInput {
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
  reference?: string;
  receivedAt: string; // YYYY-MM-DD
}

const norm = (p: Payment): Payment => ({
  ...p,
  invoiceId: p.invoiceId ?? p.invoice_id ?? '',
  receivedAt: p.receivedAt ?? p.received_at ?? '',
  voidedAt: p.voidedAt ?? p.voided_at ?? null,
});

export async function listInvoicePayments(slug: string, invoiceId: string): Promise<InvoicePayments> {
  const res = await api<{ data: Payment[]; totalPaidCents: number; balanceCents: number; invoice?: InvoicePayments['invoice'] }>(
    `/payments/invoice/${encodeURIComponent(invoiceId)}`,
    { tenantSlug: slug }
  );
  return { ...res, data: (res.data ?? []).map(norm) };
}

export async function recordPayment(slug: string, input: RecordPaymentInput) {
  const res = await api<{ data: Payment & { totalPaidCents: number; balanceCents: number; invoiceStatus: string } }>(
    '/payments',
    {
      method: 'POST',
      tenantSlug: slug,
      body: JSON.stringify({
        invoiceId: input.invoiceId,
        amountCents: input.amountCents,
        method: input.method,
        reference: input.reference?.trim() ? input.reference.trim() : undefined,
        receivedAt: input.receivedAt,
      }),
    }
  );
  return { ...res, data: norm(res.data as Payment) };
}

export async function voidPayment(slug: string, id: string, reason?: string) {
  return api<{ ok: true }>(`/payments/${encodeURIComponent(id)}/void`, {
    method: 'POST',
    tenantSlug: slug,
    body: JSON.stringify(reason?.trim() ? { reason: reason.trim() } : {}),
  });
}

export const rupees = (cents: number) => `₹${(cents / 100).toLocaleString('en-IN')}`;

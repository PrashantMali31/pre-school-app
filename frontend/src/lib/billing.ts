'use client';
import { api } from '@/lib/api';

export type PlanCode = 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly' | 'custom';
export type SubStatus = 'active' | 'past_due' | 'canceled' | 'expired';

export interface Plan {
  id: string;
  code: PlanCode;
  name: string;
  tagline: string;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
  maxStudents: number | null;
  maxTeachers: number | null;
  features: string[];
}

export interface Subscription {
  id: string;
  status: SubStatus;
  cycle: BillingCycle;
  periodStart: string;
  periodEnd: string | null;
  canceledAt: string | null;
  plan: Plan;
}

export interface BillingPayment {
  id: string;
  amountCents: number;
  currency: string;
  kind: string;
  status: 'paid' | 'failed' | 'pending';
  provider: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PlatformOverview {
  mrrCents: number;
  activeSubscriptions: number;
  pastDue: number;
  canceled: number;
  expired: number;
  totalTenants: number;
  planMix: Array<{ code: string; name: string; count: number; mrrCents: number }>;
  recentPayments: Array<BillingPayment & { tenantSlug: string; tenantName: string }>;
}

/** Paise → ₹ display. */
export const inr = (cents: number): string => `₹${(cents / 100).toLocaleString('en-IN')}`;

export async function listPlans(): Promise<Plan[]> {
  const res = await api<{ data: Plan[] }>('/billing/plans');
  return res.data ?? [];
}

export async function getSubscription(slug: string): Promise<Subscription | null> {
  const res = await api<{ data: Subscription | null }>('/billing/subscription', { tenantSlug: slug });
  return res.data;
}

export async function subscribePlan(slug: string, planCode: PlanCode, cycle: BillingCycle): Promise<{ data: Subscription; payment: BillingPayment; message?: string }> {
  return api('/billing/subscribe', { method: 'POST', tenantSlug: slug, body: JSON.stringify({ planCode, cycle }) });
}

export async function cancelSubscription(slug: string): Promise<{ data: Subscription }> {
  return api('/billing/cancel', { method: 'POST', tenantSlug: slug });
}

export async function renewSubscription(slug: string, simulate?: 'success' | 'fail'): Promise<{ data: Subscription; payment?: BillingPayment; message?: string }> {
  return api('/billing/renew', { method: 'POST', tenantSlug: slug, body: JSON.stringify(simulate ? { simulate } : {}) });
}

export async function billingHistory(slug: string): Promise<{ data: BillingPayment[]; totalPaidCents: number }> {
  const res = await api<{ data: BillingPayment[]; totalPaidCents: number }>('/billing/history', { tenantSlug: slug });
  return { data: res.data ?? [], totalPaidCents: res.totalPaidCents ?? 0 };
}

/** Platform revenue — returns null when the viewer isn't the SaaS owner (403). */
export async function platformOverview(): Promise<PlatformOverview | null> {
  try {
    const res = await api<{ data: PlatformOverview }>('/billing/platform/overview');
    return res.data;
  } catch {
    return null;
  }
}

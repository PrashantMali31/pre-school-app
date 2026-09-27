'use client';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeIndianRupee, CalendarClock, CreditCard, Crown, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Btn, Card, ConfirmDialog, PageHeader, Pill, type PendingConfirm } from '@/components/ui';
import {
  billingHistory,
  cancelSubscription,
  getSubscription,
  inr,
  listPlans,
  platformOverview,
  renewSubscription,
  subscribePlan,
  type BillingCycle,
  type BillingPayment,
  type Plan,
  type PlatformOverview,
  type SubStatus,
  type Subscription,
} from '@/lib/billing';

const STATUS_PILL: Record<SubStatus, { color: string; text: string; label: string }> = {
  active: { color: '#DFF7E5', text: '#15803D', label: 'Active' },
  past_due: { color: '#FFE4E6', text: '#B91C1C', label: 'Past due' },
  canceled: { color: '#F1F1F4', text: '#6B6580', label: 'Canceled' },
  expired: { color: '#F1F1F4', text: '#6B6580', label: 'Expired' },
};

const KIND_LABEL: Record<string, string> = { subscription: 'First subscription', renewal: 'Renewal', plan_change: 'Plan change' };

const PLAN_ACCENT: Record<string, string> = { starter: '#4ADE80', pro: '#7C9DFF', enterprise: '#C084FC' };

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function BillingPage() {
  const { activeSlug, tenant } = useAuth();
  const slug = activeSlug ?? '';
  const isAdmin = tenant?.role === 'Admin';

  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [platform, setPlatform] = useState<PlatformOverview | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setErr('');
    try {
      const [p, s, h, plat] = await Promise.all([listPlans(), getSubscription(slug), billingHistory(slug), platformOverview()]);
      setPlans(p);
      setSub(s);
      setPayments(h.data);
      setTotalPaid(h.totalPaidCents);
      setPlatform(plat);
      if (s && s.cycle !== 'custom') setCycle(s.cycle);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load billing.');
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional billing fetch on mount/slug change
    void load();
  }, [load]);

  const refresh = async (msg?: string) => {
    await load();
    if (msg) {
      setNotice(msg);
      setTimeout(() => setNotice(''), 4000);
    }
  };

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setErr('');
    try {
      const msg = await fn();
      await refresh(typeof msg === 'string' ? msg : undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Billing action failed.');
    } finally {
      setBusy('');
    }
  };

  const doSubscribe = (plan: Plan, c: BillingCycle) =>
    run(`sub-${plan.code}`, async () => {
      const r = await subscribePlan(slug, plan.code, c);
      return r.message ?? `${plan.name} activated ✓`;
    });

  const doRenew = (simulate?: 'success' | 'fail') =>
    run('renew', async () => {
      const r = await renewSubscription(slug, simulate);
      return r.message ?? 'Renewed ✓';
    });

  const askCancel = () =>
    setConfirm({
      title: 'Cancel subscription?',
      message: `Cancel ${sub?.plan.name ?? 'your plan'}? Service continues till ${fmtDate(sub?.periodEnd ?? null)}.`,
      confirmLabel: 'Cancel plan',
      onConfirm: () => run('cancel', async () => {
        await cancelSubscription(slug);
        return 'Subscription canceled — service continues till the period ends.';
      }),
    });

  if (!slug) return <PageHeader title="Billing & Subscription 💳" sub="Select a school first." />;
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Billing & Subscription 💳" sub="Plans, renewals & revenue" />
        <Card className="p-6 text-center">
          <p className="font-black">Admin only 🔒</p>
          <p className="mt-1 text-[13px] font-semibold text-[#8A84A0]">Ask your school Admin to manage the subscription.</p>
        </Card>
      </div>
    );
  }

  const left = sub?.periodEnd ? daysLeft(sub.periodEnd) : null;
  const pill = sub ? STATUS_PILL[sub.status] : null;
  const maxMrr = Math.max(1, ...(platform?.planMix.map((m) => m.mrrCents) ?? [1]));

  return (
    <div>
      <PageHeader title="Billing & Subscription 💳" sub="Plans, renewals & revenue — test mode, no real money moves" />

      {err && <p role="alert" className="mb-4 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{err}</p>}
      {notice && <p role="status" className="mb-4 rounded-2xl bg-[#DFF7E5] px-4 py-3 text-[13px] font-bold text-[#15803D]">{notice}</p>}
      {sub?.status === 'past_due' && (
        <p role="alert" className="mb-4 rounded-2xl bg-[#FEF3C7] px-4 py-3 text-[13px] font-bold text-[#8A6D00]">
          ⚠️ Last charge failed — renew to stay on {sub.plan.name}, or pick another plan below.
        </p>
      )}

      {/* Current subscription */}
      <Card className="relative overflow-hidden p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-[#7C9DFF]/25 to-[#FF8FB1]/25 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#1E1B2E] text-white"><Crown size={24} /></span>
            <div>
              <p className="flex flex-wrap items-center gap-2 text-[20px] font-black">
                {sub ? sub.plan.name : 'No subscription'}
                {pill && <Pill color={pill.color} text={pill.text}>{pill.label}</Pill>}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-[#8A84A0]">
                {sub ? (
                  <>
                    {sub.cycle === 'custom' ? 'Custom billing' : `${inr(sub.cycle === 'yearly' ? (sub.plan.priceYearlyCents ?? 0) : sub.plan.priceMonthlyCents)} / ${sub.cycle === 'yearly' ? 'year' : 'month'}`}
                    {' · '}
                    {sub.periodEnd ? <>renews {fmtDate(sub.periodEnd)}{left != null && left >= 0 ? ` (${left}d left)` : ''}</> : 'never expires'}
                  </>
                ) : (
                  'Pick a plan below to get started.'
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {sub && sub.periodEnd && (sub.status === 'active' || sub.status === 'past_due' || sub.status === 'expired') && (
              <Btn variant="dark" onClick={() => doRenew()} disabled={busy !== ''} title="Charge another period now">
                <RefreshCw size={15} /> {busy === 'renew' ? 'Renewing…' : 'Renew now'}
              </Btn>
            )}
            {sub && (sub.status === 'active' || sub.status === 'past_due') && (
              <Btn onClick={askCancel} disabled={busy !== ''} title="Service continues till the period ends">
                <XCircle size={15} /> Cancel
              </Btn>
            )}
          </div>
        </div>
      </Card>

      {/* Plans */}
      <h2 className="mb-3 mt-8 text-[15px] font-black">💎 Plans <span className="font-bold text-[#8A84A0]">· prices in INR</span></h2>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p, i) => {
          const current = sub?.plan.code === p.code && sub.status === 'active';
          const c: BillingCycle = p.code === 'enterprise' ? 'custom' : p.code === 'starter' ? 'monthly' : cycle;
          const price = c === 'yearly' ? (p.priceYearlyCents ?? p.priceMonthlyCents * 12) : p.priceMonthlyCents;
          return (
            <motion.div key={p.code} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card className={`relative h-full p-6 ${current ? 'ring-4 ring-[#7C9DFF]/20 !border-[#7C9DFF]' : ''}`}>
                {current && (
                  <span className="absolute -top-3 left-5 rounded-full bg-[#7C9DFF] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    Current plan
                  </span>
                )}
                <span className="grid h-11 w-11 place-items-center rounded-2xl text-white text-lg font-black" style={{ background: PLAN_ACCENT[p.code] ?? '#7C9DFF' }}>
                  {p.name.charAt(0)}
                </span>
                <p className="mt-3 text-[18px] font-black">{p.name}</p>
                <p className="text-[12px] font-bold text-[#8A84A0]">{p.tagline}</p>
                <p className="mt-3 text-[30px] font-black tracking-tight">
                  {p.priceYearlyCents == null && p.priceMonthlyCents === 0 ? 'Custom' : inr(price)}
                  {!(p.priceYearlyCents == null && p.priceMonthlyCents === 0) && (
                    <span className="text-[13px] font-bold text-[#8A84A0]"> /{c === 'yearly' ? 'yr' : 'mo'}</span>
                  )}
                </p>
                {p.code === 'pro' && (
                  <div className="mt-2 flex gap-1.5">
                    {(['monthly', 'yearly'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setCycle(m)}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-black capitalize cursor-pointer transition ${cycle === m ? 'bg-[#1E1B2E] text-white' : 'bg-black/[0.05] dark:bg-white/10'}`}
                      >
                        {m}{m === 'yearly' ? ' · save 17%' : ''}
                      </button>
                    ))}
                  </div>
                )}
                <ul className="mt-4 space-y-1.5">
                  {(p.maxStudents != null || p.maxTeachers != null) && (
                    <li className="text-[12.5px] font-bold text-[#6B6580] dark:text-white/70">
                      {p.maxStudents != null ? `Up to ${p.maxStudents} students` : 'Unlimited students'}
                      {p.maxTeachers != null ? ` · ${p.maxTeachers} teachers` : ''}
                    </li>
                  )}
                  {p.features.map((f) => (
                    <li key={f} className="text-[12.5px] font-semibold text-[#6B6580] dark:text-white/65">✓ {f}</li>
                  ))}
                </ul>
                <Btn
                  className="mt-5 w-full"
                  variant={current ? 'soft' : 'dark'}
                  disabled={current || busy !== ''}
                  onClick={() => doSubscribe(p, c)}
                >
                  <CreditCard size={15} />
                  {busy === `sub-${p.code}` ? 'Working…' : current ? 'Current plan ✓' : sub ? `Switch to ${p.name}` : `Choose ${p.name}`}
                </Btn>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Spend + history */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="p-6">
          <p className="flex items-center gap-2 text-[14px] font-black"><BadgeIndianRupee size={16} /> Spend</p>
          <p className="mt-3 text-[30px] font-black tracking-tight">{inr(totalPaid)}</p>
          <p className="text-[12px] font-bold text-[#8A84A0]">total paid · {payments.length} charge{payments.length === 1 ? '' : 's'}</p>
          <p className="mt-3 flex items-start gap-1.5 text-[12px] font-semibold text-[#8A84A0]">
            <CalendarClock size={14} className="mt-0.5 shrink-0" />
            {sub?.periodEnd ? `Next charge ${inr(sub.cycle === 'yearly' ? (sub.plan.priceYearlyCents ?? 0) : sub.plan.priceMonthlyCents)} on ${fmtDate(sub.periodEnd)}` : 'No upcoming charges'}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-[14px] font-black">Billing history 🧾</p>
          {payments.length === 0 ? (
            <p className="mt-2 text-[13px] font-semibold text-[#8A84A0]">No charges yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#F1E6D8] px-4 py-2.5 dark:border-white/10">
                  <span className="min-w-0 flex-1 text-[13px] font-black">
                    {KIND_LABEL[p.kind] ?? p.kind}
                    <span className="block text-[11px] font-bold text-[#8A84A0]">{fmtDate(p.createdAt)} · {p.provider} test</span>
                  </span>
                  <span className="text-[14px] font-black">{inr(p.amountCents)}</span>
                  <Pill color={p.status === 'paid' ? '#DFF7E5' : '#FFE4E6'} text={p.status === 'paid' ? '#15803D' : '#B91C1C'}>
                    {p.status}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Platform revenue (SaaS owner only — hidden otherwise) */}
      {platform && (
        <div className="mt-8">
          <h2 className="mb-3 text-[15px] font-black">📈 Platform revenue <span className="font-bold text-[#8A84A0]">· all schools</span></h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-[12px] font-black uppercase tracking-widest text-[#8A84A0]">MRR</p>
              <p className="mt-1 text-[28px] font-black tracking-tight">{inr(platform.mrrCents)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] font-black uppercase tracking-widest text-[#8A84A0]">Active subs</p>
              <p className="mt-1 text-[28px] font-black tracking-tight">{platform.activeSubscriptions}<span className="text-[14px] font-bold text-[#8A84A0]"> / {platform.totalTenants}</span></p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] font-black uppercase tracking-widest text-[#8A84A0]">Needs attention</p>
              <p className="mt-1 text-[28px] font-black tracking-tight">{platform.pastDue}<span className="text-[14px] font-bold text-[#8A84A0]"> past due · {platform.canceled} canceled</span></p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] font-black uppercase tracking-widest text-[#8A84A0]">Plan mix</p>
              <div className="mt-2 space-y-1.5">
                {platform.planMix.map((m) => (
                  <div key={m.code}>
                    <div className="flex justify-between text-[11px] font-black"><span className="capitalize">{m.name} · {m.count}</span><span>{inr(m.mrrCents)}</span></div>
                    <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: PLAN_ACCENT[m.code] ?? '#7C9DFF' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(m.mrrCents / maxMrr) * 100}%` }}
                        transition={{ duration: 0.7 }}
                      />
                    </div>
                  </div>
                ))}
                {platform.planMix.length === 0 && <p className="text-[12px] font-semibold text-[#8A84A0]">No paid plans yet.</p>}
              </div>
            </Card>
          </div>
          {platform.recentPayments.length > 0 && (
            <Card className="mt-4 p-6">
              <p className="text-[14px] font-black">Recent charges 💰</p>
              <ul className="mt-3 space-y-2">
                {platform.recentPayments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#F1E6D8] px-4 py-2.5 text-[13px] dark:border-white/10">
                    <span className="min-w-0 flex-1 font-black">{p.tenantName} <span className="font-bold text-[#8A84A0]">/{p.tenantSlug} · {KIND_LABEL[p.kind] ?? p.kind}</span></span>
                    <span className="font-black">{inr(p.amountCents)}</span>
                    <Pill color={p.status === 'paid' ? '#DFF7E5' : '#FFE4E6'} text={p.status === 'paid' ? '#15803D' : '#B91C1C'}>{p.status}</Pill>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

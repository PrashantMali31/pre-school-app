'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarOff, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Btn, Card, PageHeader } from '@/components/ui';
import { listLeaves, listPayrollRuns } from '@/lib/staff';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export default function StaffHubPage() {
  const { activeSlug } = useAuth();
  const slug = activeSlug ?? '';
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<number | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!slug) return;
    setErr('');
    try {
      const leaves = await listLeaves(slug, { status: 'pending' });
      setPending(leaves.filter((l) => l.status === 'pending').length);
    } catch (e) {
      setPending(null);
      setErr(errMsg(e));
    }
    try {
      const runs = await listPayrollRuns(slug);
      setDrafts(runs.filter((r) => r.status === 'draft').length);
    } catch (e) {
      setDrafts(null);
      setErr((prev) => (prev ? prev : errMsg(e)));
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!slug) return <PageHeader title="Staff 👩‍🏫" sub="Select a school first." />;

  const cards = [
    {
      href: '/staff/leave',
      icon: <CalendarOff size={22} />,
      title: 'Leave',
      sub: 'Apply, approve & track balances',
      stat: pending === null ? '—' : String(pending),
      statLabel: 'pending requests',
      bg: '#FFF4CC',
    },
    {
      href: '/staff/payroll',
      icon: <Wallet size={22} />,
      title: 'Payroll',
      sub: 'Runs, payslips & salaries',
      stat: drafts === null ? '—' : String(drafts),
      statLabel: 'draft runs',
      bg: '#DFF7E5',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Staff 👩‍🏫"
        sub="Leave & payroll — pick a section to get started"
        right={
          <>
            <Btn variant="soft" onClick={() => router.push('/staff/leave')}>
              Leave
            </Btn>
            <Btn variant="dark" onClick={() => router.push('/staff/payroll')}>
              Payroll
            </Btn>
          </>
        }
      />
      {err && (
        <p role="alert" className="mb-4 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
          {err}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="block">
            <Card className="card-hover p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: c.bg }}>
                  {c.icon}
                </span>
                <div>
                  <p className="text-[18px] font-black">{c.title}</p>
                  <p className="text-[13px] font-semibold text-[#8A84A0]">{c.sub}</p>
                </div>
              </div>
              <p className="mt-4 text-[30px] font-black leading-none">{c.stat}</p>
              <p className="mt-1 text-[12px] font-black uppercase tracking-wider text-[#8A84A0]">{c.statLabel}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

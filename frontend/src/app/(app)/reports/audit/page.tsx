'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { AuditLog, fetchAuditLogs } from '@/lib/audit';
import { Btn, Card, PageHeader, Pager, Pill } from '@/components/ui';

const PAGE_SIZE = 25;

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

export default function AuditReportPage() {
  const { tenant, activeSlug } = useAuth();
  const role = tenant?.role;
  const allowed = role === 'Admin' || role === 'Teacher';

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (p: number) => {
      if (!activeSlug) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAuditLogs(activeSlug, p, PAGE_SIZE);
        setLogs(res.data);
        setTotal(res.total);
        setPage(res.page);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the audit log.');
      } finally {
        setLoading(false);
      }
    },
    [activeSlug]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional server -> table fetch on mount/tenant-change
    if (allowed) void load(1);
  }, [allowed, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Audit log 🛡️" sub="Who did what, when" />
        <Card className="p-6">
          <h3 className="font-black text-[16px]">🔒 Admin-only area</h3>
          <p className="mt-1 text-[13px] font-medium text-[#8A84A0]">
            The audit log is available to school staff (Admins and Teachers). Ask your school admin for access.
          </p>
          <Link href="/reports" className="mt-4 inline-block rounded-2xl bg-[#1E1B2E] px-4 py-2.5 text-[13px] font-black text-white hover:bg-black">
            ← Back to Reports
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Audit log 🛡️"
        sub={`${total} event${total === 1 ? '' : 's'} · newest first`}
        right={<Btn variant="soft" onClick={() => void load(page)}>↻ Refresh</Btn>}
      />
      {error && <div className="mb-4 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-sm font-bold text-[#E11D48]">{error}</div>}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#F5EEDF] text-[11px] uppercase tracking-wider text-[#8A84A0]">
                <th className="px-4 py-3 font-black">Action</th>
                <th className="px-4 py-3 font-black">Entity</th>
                <th className="px-4 py-3 font-black">Summary</th>
                <th className="px-4 py-3 font-black">User</th>
                <th className="px-4 py-3 font-black">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-[#F5EEDF]/60 last:border-0">
                  <td className="px-4 py-2.5 font-extrabold whitespace-nowrap"><Pill color="#E4EBFF" text="#1E1B2E">{l.action}</Pill></td>
                  <td className="px-4 py-2.5 font-bold text-[#5B5670] whitespace-nowrap">{l.entity}</td>
                  <td className="px-4 py-2.5 font-medium text-[#5B5670] max-w-[320px] truncate" title={l.summary}>{l.summary || '—'}</td>
                  <td className="px-4 py-2.5 font-bold whitespace-nowrap">{l.user ? `${l.user.name} · ${l.user.email}` : '—'}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#8A84A0] whitespace-nowrap">{fmtTime(l.createdAt)}</td>
                </tr>
              ))}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-[#8A84A0]">No audit events yet.</td></tr>
              )}
              {loading && logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-[#8A84A0]">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F5EEDF] px-4 py-3">
          <p className="text-[12px] font-bold text-[#8A84A0]">Page {page} of {totalPages}</p>
          <Pager page={page} totalPages={totalPages} onPage={(p) => void load(p)} small />
        </div>
      </Card>
    </div>
  );
}

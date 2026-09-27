'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  Btn,
  Card,
  ConfirmDialog,
  Empty,
  Err,
  Field,
  PageHeader,
  Pill,
  errStyle,
  inputCls,
  type PendingConfirm,
} from '@/components/ui';
import {
  STAFF_PAY_METHODS,
  createPayrollRun,
  finalizePayrollRun,
  getPayrollRun,
  getSalary,
  listPayrollRuns,
  listTeachersLite,
  payPayslip,
  putSalary,
  rupees,
  type PayrollRun,
  type PayrollRunDetail,
  type TeacherLite,
} from '@/lib/staff';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

function runPill(status: string) {
  const s = status.toLowerCase();
  if (s === 'finalized' || s === 'paid') return { color: '#DFF7E5', text: '#16A34A' };
  if (s === 'draft' || s === 'pending') return { color: '#FFF4CC', text: '#8A6D00' };
  return { color: '#EEF2FF', text: '#3730A3' };
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function StaffPayrollPage() {
  const { activeSlug, tenant } = useAuth();
  const slug = activeSlug ?? '';
  const isAdmin = tenant?.role === 'Admin';

  const [teachers, setTeachers] = useState<TeacherLite[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [monthErr, setMonthErr] = useState('');
  const [genErr, setGenErr] = useState('');
  const [generating, setGenerating] = useState(false);

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsErr, setRunsErr] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayrollRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState('');

  const [methods, setMethods] = useState<Record<string, string>>({});
  const [payErr, setPayErr] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const [salTeacher, setSalTeacher] = useState('');
  const [salBasic, setSalBasic] = useState('');
  const [salAllow, setSalAllow] = useState('');
  const [salErr, setSalErr] = useState('');
  const [salFieldErrs, setSalFieldErrs] = useState<Record<string, string | undefined>>({});
  const [salLoading, setSalLoading] = useState(false);
  const [salSaving, setSalSaving] = useState(false);
  const [salLoaded, setSalLoaded] = useState(false);

  const nameOf = useMemo(() => {
    const m = new Map(teachers.map((t) => [t.id, t.name]));
    return (id: string) => m.get(id) ?? id;
  }, [teachers]);

  const loadRuns = useCallback(async () => {
    if (!slug) return;
    setRunsLoading(true);
    setRunsErr('');
    try {
      const r = await listPayrollRuns(slug);
      setRuns(r);
      if (!selectedId && r.length > 0) setSelectedId(r[0].id);
    } catch (e) {
      setRuns([]);
      setRunsErr(errMsg(e));
    } finally {
      setRunsLoading(false);
    }
  }, [slug, selectedId]);

  const loadDetail = useCallback(async () => {
    if (!slug || !selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailErr('');
    try {
      setDetail(await getPayrollRun(slug, selectedId));
    } catch (e) {
      setDetail(null);
      setDetailErr(errMsg(e));
    } finally {
      setDetailLoading(false);
    }
  }, [slug, selectedId]);

  const loadSalary = useCallback(async () => {
    if (!slug || !salTeacher) {
      setSalLoaded(false);
      return;
    }
    setSalLoading(true);
    setSalErr('');
    try {
      const s = await getSalary(slug, salTeacher);
      setSalBasic(s ? String(s.basicCents / 100) : '');
      setSalAllow(s ? String(s.allowancesCents / 100) : '');
      setSalLoaded(true);
    } catch (e) {
      setSalLoaded(false);
      setSalErr(errMsg(e));
    } finally {
      setSalLoading(false);
    }
  }, [slug, salTeacher]);

  useEffect(() => {
    if (!slug) return;
    listTeachersLite(slug)
      .then((t) => {
        setTeachers(t);
        if (!salTeacher && t.length > 0) setSalTeacher(t[0].id);
      })
      .catch(() => setTeachers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on mount/slug change
    void loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on run change
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on teacher change
    void loadSalary();
  }, [loadSalary]);

  const generate = async () => {
    if (!MONTH_RE.test(month.trim())) {
      setMonthErr('Pick a month (YYYY-MM).');
      return;
    }
    setMonthErr('');
    if (!slug) {
      setGenErr('No school selected.');
      return;
    }
    setGenerating(true);
    setGenErr('');
    try {
      const run = await createPayrollRun(slug, month.trim());
      await loadRuns();
      setSelectedId(run.id);
    } catch (e) {
      // A run for this month already exists (409) — open it AND say so.
      // Swallowing the error silently confused users (looks like nothing happened).
      const msg = errMsg(e);
      if (/already exists|duplicate/i.test(msg)) {
        try {
          const list = await listPayrollRuns(slug);
          setRuns(list);
          const existing = list.find((r) => r.month === month.trim());
          if (existing) setSelectedId(existing.id);
        } catch {
          await loadRuns();
        }
        setGenErr(`Payroll run for ${month.trim()} already exists — opened it below.`);
      } else {
        setGenErr(msg);
      }
    } finally {
      setGenerating(false);
    }
  };

  const doPay = async (slipId: string) => {
    const method = methods[slipId] ?? STAFF_PAY_METHODS[1];
    if (!slug) {
      setPayErr('No school selected.');
      return;
    }
    setPayingId(slipId);
    setPayErr('');
    try {
      await payPayslip(slug, slipId, method);
      await loadDetail();
    } catch (e) {
      setPayErr(errMsg(e));
    } finally {
      setPayingId(null);
    }
  };

  const askPay = (slipId: string, teacherId: string, netCents: number) => {
    const method = methods[slipId] ?? STAFF_PAY_METHODS[1];
    setConfirm({
      title: `Pay ${rupees(netCents)}?`,
      message: `Pay ${rupees(netCents)} to ${nameOf(teacherId)} via ${method}? This marks the slip paid.`,
      confirmLabel: 'Pay',
      onConfirm: () => doPay(slipId),
    });
  };

  const askFinalize = () => {
    if (!detail) return;
    setConfirm({
      title: `Finalize ${detail.month} run?`,
      message: `Finalizing locks the ${detail.month} payroll run. This cannot be undone.`,
      confirmLabel: 'Finalize',
      onConfirm: async () => {
        if (!slug) {
          setPayErr('No school selected.');
          return;
        }
        setFinalizing(true);
        setPayErr('');
        try {
          await finalizePayrollRun(slug, detail.id);
          await loadRuns();
          await loadDetail();
        } catch (e) {
          setPayErr(errMsg(e));
        } finally {
          setFinalizing(false);
        }
      },
    });
  };

  const saveSalary = async () => {
    const errs: Record<string, string> = {};
    const basic = Number(salBasic);
    const allow = salAllow.trim() === '' ? 0 : Number(salAllow);
    if (!salTeacher) errs.teacher = 'Pick a teacher.';
    if (!salBasic.trim() || !Number.isFinite(basic) || basic < 0) errs.basic = 'Enter basic pay in ₹ (0 or more).';
    if (salAllow.trim() !== '' && (!Number.isFinite(allow) || allow < 0)) errs.allow = 'Enter allowances in ₹ (0 or more).';
    setSalFieldErrs(errs);
    if (Object.values(errs).some(Boolean)) return;
    if (!slug) {
      setSalErr('No school selected.');
      return;
    }
    setSalSaving(true);
    setSalErr('');
    try {
      await putSalary(slug, {
        teacherId: salTeacher,
        basicCents: Math.round(basic * 100),
        allowancesCents: Math.round(allow * 100),
      });
      await loadSalary();
    } catch (e) {
      setSalErr(errMsg(e));
    } finally {
      setSalSaving(false);
    }
  };

  if (!slug) return <PageHeader title="Payroll 💸" sub="Select a school first." />;

  return (
    <div>
      <PageHeader
        title="Payroll 💸"
        sub={`${runs.length} runs · payslips, deductions & salaries`}
        right={
          <Btn variant="dark" onClick={generate} disabled={!isAdmin || generating} title={isAdmin ? undefined : 'Admin only'}>
            {generating ? 'Generating…' : 'Generate run'}
          </Btn>
        }
      />
      {!isAdmin && (
        <Card className="mb-4 p-4">
          <p className="text-[13px] font-bold text-[#6B6580]">You have read-only access — only Admins can generate runs, edit salaries, finalize or pay.</p>
        </Card>
      )}

      <Card className="p-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Month (YYYY-MM)">
            <input className={inputCls} style={errStyle(monthErr)} value={month} onChange={(e) => { setMonth(e.target.value); setMonthErr(''); setGenErr(''); }} placeholder="2026-09" />
            <Err msg={monthErr} />
          </Field>
          <div className="flex items-end">
            <Btn variant="soft" onClick={generate} disabled={!isAdmin || generating} title={isAdmin ? undefined : 'Admin only'}>
              {generating ? 'Generating…' : 'Generate run ✨'}
            </Btn>
          </div>
        </div>
        {genErr && (
          <p role="alert" className="mt-3 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
            {genErr}
          </p>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="p-4">
          <p className="text-[14px] font-black">Runs</p>
          {runsLoading && <p className="mt-2 text-[13px] font-semibold text-[#8A84A0]">Loading runs…</p>}
          {runsErr && (
            <p role="alert" className="mt-2 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
              {runsErr}
            </p>
          )}
          {!runsLoading && !runsErr && runs.length === 0 && (
            <Empty title="No runs yet 🧾" sub="Generate your first monthly payroll run above." />
          )}
          <div className="mt-2 space-y-2">
            {runs.map((r) => {
              const pill = runPill(r.status);
              const active = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2.5 text-left cursor-pointer transition ${active ? 'border-[#1E1B2E] bg-[#FFFEFB]' : 'border-[#F1E6D8] hover:bg-black/[0.02]'}`}
                >
                  <span className="flex-1">
                    <span className="block text-[14px] font-black">{r.month}</span>
                    <span className="block text-[11px] font-semibold text-[#8A84A0]">{r.id.slice(0, 8)}</span>
                  </span>
                  <Pill color={pill.color} text={pill.text}>
                    {r.status}
                  </Pill>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          {!selectedId ? (
            <Empty title="Pick a run 🧾" sub="Select a payroll run on the left to see its payslips." />
          ) : detailLoading ? (
            <p className="text-[13px] font-semibold text-[#8A84A0]">Loading run…</p>
          ) : detailErr ? (
            <p role="alert" className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
              {detailErr}
            </p>
          ) : detail ? (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-[16px] font-black">{detail.month} payroll</p>
                <Pill color={runPill(detail.status).color} text={runPill(detail.status).text}>
                  {detail.status}
                </Pill>
                <Btn variant="soft" onClick={askFinalize} disabled={!isAdmin || finalizing} title={isAdmin ? undefined : 'Admin only'}>
                  {finalizing ? 'Finalizing…' : 'Finalize'}
                </Btn>
              </div>
              {payErr && (
                <p role="alert" className="mt-3 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
                  {payErr}
                </p>
              )}
              {(detail.slips ?? []).length === 0 ? (
                <div className="mt-3">
                  <Empty title="No slips 🧾" sub="This run has no payslips yet." />
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-[13px]">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-[#9A93B0]">
                        <th className="py-2 pr-2 font-black">Teacher</th>
                        <th className="py-2 pr-2 font-black">Basic</th>
                        <th className="py-2 pr-2 font-black">Allowances</th>
                        <th className="py-2 pr-2 font-black">Unpaid days</th>
                        <th className="py-2 pr-2 font-black">Deduction</th>
                        <th className="py-2 pr-2 font-black">Net</th>
                        <th className="py-2 pr-2 font-black">Status</th>
                        <th className="py-2 font-black">Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.slips.map((s) => {
                        const pill = runPill(s.status);
                        const paid = s.status.toLowerCase() === 'paid';
                        return (
                          <tr key={s.id} className="border-t border-[#F5EEDF]">
                            <td className="py-2 pr-2 font-bold">{nameOf(s.teacherId)}</td>
                            <td className="py-2 pr-2 font-semibold">{rupees(s.basicCents)}</td>
                            <td className="py-2 pr-2 font-semibold">{rupees(s.allowancesCents)}</td>
                            <td className="py-2 pr-2 font-semibold">{s.unpaidLeaveDays}</td>
                            <td className="py-2 pr-2 font-semibold text-[#E11D48]">{rupees(s.leaveDeductionCents)}</td>
                            <td className="py-2 pr-2 font-black">{rupees(s.netCents)}</td>
                            <td className="py-2 pr-2">
                              <Pill color={pill.color} text={pill.text}>
                                {s.status}
                              </Pill>
                            </td>
                            <td className="py-2">
                              {paid ? (
                                <span className="text-[12px] font-semibold text-[#8A84A0]">
                                  {s.paidAt ?? 'paid'}
                                  {s.paidMethod ? ` · ${s.paidMethod}` : ''}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <select
                                    aria-label={`Payment method for ${nameOf(s.teacherId)}`}
                                    className={`${inputCls} !w-auto !px-2 !py-1.5 text-[12px]`}
                                    value={methods[s.id] ?? STAFF_PAY_METHODS[1]}
                                    onChange={(e) => setMethods((m) => ({ ...m, [s.id]: e.target.value }))}
                                    disabled={!isAdmin || payingId === s.id}
                                  >
                                    {STAFF_PAY_METHODS.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                  <Btn variant="dark" onClick={() => askPay(s.id, s.teacherId, s.netCents)} disabled={!isAdmin || payingId === s.id} title={isAdmin ? undefined : 'Admin only'}>
                                    {payingId === s.id ? 'Paying…' : 'Pay'}
                                  </Btn>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <p className="text-[15px] font-black">Salary editor 💰</p>
        <p className="mt-1 text-[13px] font-semibold text-[#8A84A0]">Amounts in ₹ — stored as paise (cents).</p>
        <div className="mt-3 grid sm:grid-cols-3 gap-3">
          <Field label="Teacher">
            <select className={inputCls} style={errStyle(salFieldErrs.teacher)} value={salTeacher} onChange={(e) => setSalTeacher(e.target.value)} disabled={!isAdmin}>
              <option value="">Select teacher…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Err msg={salFieldErrs.teacher} />
          </Field>
          <Field label="Basic pay (₹)">
            <input type="number" min={0} className={inputCls} style={errStyle(salFieldErrs.basic)} value={salBasic} onChange={(e) => { setSalBasic(e.target.value); setSalFieldErrs((p) => ({ ...p, basic: undefined })); }} placeholder="e.g. 25000" disabled={!isAdmin} />
            <Err msg={salFieldErrs.basic} />
          </Field>
          <Field label="Allowances (₹)">
            <input type="number" min={0} className={inputCls} style={errStyle(salFieldErrs.allow)} value={salAllow} onChange={(e) => { setSalAllow(e.target.value); setSalFieldErrs((p) => ({ ...p, allow: undefined })); }} placeholder="e.g. 5000" disabled={!isAdmin} />
            <Err msg={salFieldErrs.allow} />
          </Field>
        </div>
        {salLoading && <p className="mt-2 text-[13px] font-semibold text-[#8A84A0]">Loading salary…</p>}
        {salLoaded && !salLoading && salTeacher && (
          <p className="mt-2 text-[12px] font-semibold text-[#8A84A0]">
            Current: {rupees(Math.round(Number(salBasic || 0) * 100))} + {rupees(Math.round(Number(salAllow || 0) * 100))} allowances
          </p>
        )}
        {salErr && (
          <p role="alert" className="mt-3 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
            {salErr}
          </p>
        )}
        <div className="mt-3">
          <Btn variant="dark" onClick={saveSalary} disabled={!isAdmin || salSaving} title={isAdmin ? undefined : 'Admin only'}>
            {salSaving ? 'Saving…' : 'Save salary ✨'}
          </Btn>
        </div>
      </Card>

      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

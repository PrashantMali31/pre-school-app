'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Btn, Card, Empty, Err, Field, Modal, PageHeader, Pill, errStyle, inputCls } from '@/components/ui';
import {
  LEAVE_KINDS,
  approveLeave,
  createLeave,
  getLeaveBalances,
  listLeaves,
  listTeachersLite,
  rejectLeave,
  updateLeave,
  type LeaveBalances,
  type LeaveKind,
  type StaffLeave,
  type TeacherLite,
} from '@/lib/staff';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

function statusPill(status: StaffLeave['status']) {
  if (status === 'approved') return { color: '#DFF7E5', text: '#16A34A' };
  if (status === 'rejected') return { color: '#FFE4E6', text: '#E11D48' };
  return { color: '#FFF4CC', text: '#8A6D00' };
}

function BalanceBar({ label, allowed, used, left }: { label: string; allowed: number; used: number; left: number }) {
  const pct = allowed > 0 ? Math.min(100, Math.round((used / allowed) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-[#F1E6D8] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-black capitalize">{label}</p>
        <p className="text-[12px] font-bold text-[#8A84A0]">
          {used}/{allowed} used · {left} left
        </p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#F6F0E6]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} leave used`}>
        <div className="h-full rounded-full bg-gradient-to-r from-[#FF8FB1] to-[#7C9DFF]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function StaffLeavePage() {
  const { activeSlug, tenant } = useAuth();
  const slug = activeSlug ?? '';
  const isAdmin = tenant?.role === 'Admin';

  const [teachers, setTeachers] = useState<TeacherLite[]>([]);
  const [teacherFilter, setTeacherFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [balances, setBalances] = useState<LeaveBalances | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balErr, setBalErr] = useState('');

  const [form, setForm] = useState({ teacherId: '', kind: 'sick' as LeaveKind, fromDate: '', toDate: '', reason: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string | undefined>>({});
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ teacherId: '', kind: 'sick' as LeaveKind, fromDate: '', toDate: '', reason: '' });
  const [editErrors, setEditErrors] = useState<Record<string, string | undefined>>({});
  const [editErr, setEditErr] = useState('');

  const nameOf = useMemo(() => {
    const m = new Map(teachers.map((t) => [t.id, t.name]));
    return (id: string) => m.get(id) ?? id;
  }, [teachers]);

  const loadTeachers = useCallback(async () => {
    if (!slug) return;
    try {
      setTeachers(await listTeachersLite(slug));
    } catch {
      setTeachers([]);
    }
  }, [slug]);

  const loadLeaves = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setLoadErr('');
    try {
      setLeaves(await listLeaves(slug, { teacherId: teacherFilter || undefined, status: statusFilter || undefined }));
    } catch (e) {
      setLeaves([]);
      setLoadErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [slug, teacherFilter, statusFilter]);

  const loadBalances = useCallback(async () => {
    if (!slug || !teacherFilter) {
      setBalances(null);
      setBalErr('');
      return;
    }
    setBalLoading(true);
    setBalErr('');
    try {
      setBalances(await getLeaveBalances(slug, { teacherId: teacherFilter, year: year.trim() || undefined }));
    } catch (e) {
      setBalances(null);
      setBalErr(errMsg(e));
    } finally {
      setBalLoading(false);
    }
  }, [slug, teacherFilter, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on mount/slug change
    void loadTeachers();
  }, [loadTeachers]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on filter change
    void loadLeaves();
  }, [loadLeaves]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on teacher/year change
    void loadBalances();
  }, [loadBalances]);

  const upd = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFormErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.teacherId) errs.teacherId = 'Pick a teacher.';
    if (!LEAVE_KINDS.includes(form.kind)) errs.kind = 'Pick a leave kind.';
    if (!DATE_RE.test(form.fromDate)) errs.fromDate = 'Pick a start date (YYYY-MM-DD).';
    if (!DATE_RE.test(form.toDate)) errs.toDate = 'Pick an end date (YYYY-MM-DD).';
    if (DATE_RE.test(form.fromDate) && DATE_RE.test(form.toDate) && form.toDate < form.fromDate) {
      errs.toDate = 'End date cannot be before start date.';
    }
    setFormErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    if (!slug) {
      setFormErr('No school selected.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await createLeave(slug, {
        teacherId: form.teacherId,
        kind: form.kind,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason,
      });
      setForm((f) => ({ ...f, fromDate: '', toDate: '', reason: '' }));
      setFormErrors({});
      await loadLeaves();
      await loadBalances();
    } catch (e) {
      setFormErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id: string, how: 'approve' | 'reject') => {
    if (!slug) {
      setActionErr('No school selected.');
      return;
    }
    setActingId(id);
    setActionErr('');
    try {
      if (how === 'approve') await approveLeave(slug, id);
      else await rejectLeave(slug, id);
      await loadLeaves();
      await loadBalances();
    } catch (e) {
      setActionErr(errMsg(e));
    } finally {
      setActingId(null);
    }
  };

  const updEdit = (k: keyof typeof editForm, v: string) => {
    setEditForm((f) => ({ ...f, [k]: v }));
    setEditErrors((e) => ({ ...e, [k]: undefined }));
  };

  const resetEdit = () => {
    setEditForm({ teacherId: '', kind: 'sick', fromDate: '', toDate: '', reason: '' });
    setEditErrors({});
    setEditErr('');
    setEditId(null);
  };

  const openEdit = (l: StaffLeave) => {
    if (l.status !== 'pending') return;
    setEditForm({ teacherId: l.teacherId, kind: l.kind, fromDate: l.fromDate, toDate: l.toDate, reason: l.reason ?? '' });
    setEditErrors({});
    setEditErr('');
    setEditId(l.id);
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!editId || !slug) return;
    const errs: Record<string, string> = {};
    if (!editForm.teacherId) errs.teacherId = 'Pick a teacher.';
    if (!LEAVE_KINDS.includes(editForm.kind)) errs.kind = 'Pick a leave kind.';
    if (!DATE_RE.test(editForm.fromDate)) errs.fromDate = 'Pick a start date (YYYY-MM-DD).';
    if (!DATE_RE.test(editForm.toDate)) errs.toDate = 'Pick an end date (YYYY-MM-DD).';
    if (DATE_RE.test(editForm.fromDate) && DATE_RE.test(editForm.toDate) && editForm.toDate < editForm.fromDate) {
      errs.toDate = 'End date cannot be before start date.';
    }
    setEditErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setSaving(true);
    setEditErr('');
    try {
      await updateLeave(slug, editId, {
        teacherId: editForm.teacherId,
        kind: editForm.kind,
        fromDate: editForm.fromDate,
        toDate: editForm.toDate,
        reason: editForm.reason,
      });
      setShowEdit(false);
      resetEdit();
      await loadLeaves();
      await loadBalances();
    } catch (e) {
      setEditErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (!slug) return <PageHeader title="Leave 🗓️" sub="Select a school first." />;

  return (
    <div>
      <PageHeader title="Leave 🗓️" sub={`${leaves.length} requests · balances per teacher`} />
      {loadErr && (
        <p role="alert" className="mb-4 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
          {loadErr}
        </p>
      )}
      {actionErr && (
        <p role="alert" className="mb-4 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
          {actionErr}
        </p>
      )}

      <Card className="p-5">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Teacher">
            <select className={inputCls} value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
              <option value="">All teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
          <Field label="Balance year">
            <input className={inputCls} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" inputMode="numeric" />
          </Field>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <p className="text-[15px] font-black">Balances 📊</p>
        {!teacherFilter ? (
          <p className="mt-1 text-[13px] font-semibold text-[#8A84A0]">Pick a teacher above to see allowed / used / left.</p>
        ) : balLoading ? (
          <p className="mt-2 text-[13px] font-semibold text-[#8A84A0]">Loading balances…</p>
        ) : balErr ? (
          <p role="alert" className="mt-2 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
            {balErr}
          </p>
        ) : balances ? (
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {(['sick', 'casual', 'earned'] as const).map((k) => (
              <BalanceBar
                key={k}
                label={k}
                allowed={balances[k].allowed ?? 0}
                used={balances[k].used ?? 0}
                left={balances[k].left ?? 0}
              />
            ))}
            <div className="rounded-2xl border border-[#F1E6D8] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-black capitalize">unpaid</p>
                <p className="text-[12px] font-bold text-[#8A84A0]">{balances.unpaid.used ?? 0} days used</p>
              </div>
              <p className="mt-1 text-[12px] font-semibold text-[#8A84A0]">Unpaid leave has no yearly allowance — it deducts from payroll.</p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="mt-4 p-5">
        <p className="text-[15px] font-black">Apply for leave ✨</p>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <Field label="Teacher">
            <select className={inputCls} style={errStyle(formErrors.teacherId)} value={form.teacherId} onChange={(e) => upd('teacherId', e.target.value)}>
              <option value="">Select teacher…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Err msg={formErrors.teacherId} />
          </Field>
          <Field label="Kind">
            <select className={inputCls} style={errStyle(formErrors.kind)} value={form.kind} onChange={(e) => upd('kind', e.target.value)}>
              {LEAVE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <Err msg={formErrors.kind} />
          </Field>
          <Field label="From date">
            <input type="date" className={inputCls} style={errStyle(formErrors.fromDate)} value={form.fromDate} onChange={(e) => upd('fromDate', e.target.value)} />
            <Err msg={formErrors.fromDate} />
          </Field>
          <Field label="To date">
            <input type="date" className={inputCls} style={errStyle(formErrors.toDate)} value={form.toDate} onChange={(e) => upd('toDate', e.target.value)} />
            <Err msg={formErrors.toDate} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Reason (optional)">
              <input className={inputCls} value={form.reason} onChange={(e) => upd('reason', e.target.value)} placeholder="e.g. Family function" />
            </Field>
          </div>
        </div>
        {formErr && (
          <p role="alert" className="mt-3 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">
            {formErr}
          </p>
        )}
        <div className="mt-3">
          <Btn variant="dark" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Apply for leave ✨'}
          </Btn>
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {loading && <Card className="p-5 text-[13px] font-semibold text-[#8A84A0]">Loading leaves…</Card>}
        {!loading && leaves.length === 0 && !loadErr && (
          <Card>
            <Empty title="No leaves here 🌤️" sub="No requests match these filters. New applications appear here." />
          </Card>
        )}
        {leaves.map((l) => {
          const pill = statusPill(l.status);
          const busy = actingId === l.id;
          return (
            <Card key={l.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 basis-40 text-[14px] font-black">
                  {nameOf(l.teacherId)} <span className="font-bold text-[#8A84A0]">· {l.kind} · {l.days}d</span>
                </p>
                <Pill color={pill.color} text={pill.text}>
                  {l.status}
                </Pill>
              </div>
              <p className="mt-1 text-[12px] font-semibold text-[#8A84A0]">
                {l.fromDate} → {l.toDate}
                {l.reason ? ` · ${l.reason}` : ''}
                {l.decidedAt ? ` · decided ${l.decidedAt}` : ''}
              </p>
              {l.status === 'pending' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Btn variant="soft" onClick={() => decide(l.id, 'approve')} disabled={!isAdmin || busy} title={isAdmin ? undefined : 'Admin only'}>
                    {busy ? 'Working…' : 'Approve'}
                  </Btn>
                  <Btn variant="soft" onClick={() => decide(l.id, 'reject')} disabled={!isAdmin || busy} title={isAdmin ? undefined : 'Admin only'}>
                    {busy ? 'Working…' : 'Reject'}
                  </Btn>
                  {isAdmin && (
                    <button onClick={() => openEdit(l)} aria-label={`Edit leave for ${nameOf(l.teacherId)}`} title={`Edit leave for ${nameOf(l.teacherId)}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF]"><Pencil size={15} /></button>
                  )}
                </div>
              )}
              {l.status !== 'pending' && (
                <p className="mt-2 text-[12px] font-bold text-[#8A84A0]">Read-only — already {l.status}.</p>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={showEdit} onClose={() => { setShowEdit(false); resetEdit(); }} label="Edit leave request">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between"><h3 className="text-[18px] font-black">Edit leave ✏️</h3><button onClick={() => { setShowEdit(false); resetEdit(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Teacher">
              <select className={inputCls} style={errStyle(editErrors.teacherId)} value={editForm.teacherId} onChange={(e) => updEdit('teacherId', e.target.value)}>
                <option value="">Select teacher…</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Err msg={editErrors.teacherId} />
            </Field>
            <Field label="Kind">
              <select className={inputCls} style={errStyle(editErrors.kind)} value={editForm.kind} onChange={(e) => updEdit('kind', e.target.value)}>
                {LEAVE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <Err msg={editErrors.kind} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From date">
                <input type="date" className={inputCls} style={errStyle(editErrors.fromDate)} value={editForm.fromDate} onChange={(e) => updEdit('fromDate', e.target.value)} />
                <Err msg={editErrors.fromDate} />
              </Field>
              <Field label="To date">
                <input type="date" className={inputCls} style={errStyle(editErrors.toDate)} value={editForm.toDate} onChange={(e) => updEdit('toDate', e.target.value)} />
                <Err msg={editErrors.toDate} />
              </Field>
            </div>
            <Field label="Reason">
              <input className={inputCls} value={editForm.reason} onChange={(e) => updEdit('reason', e.target.value)} placeholder="e.g. Family function" />
            </Field>
            {editErr && <p role="alert" className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{editErr}</p>}
            <Btn className="w-full" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes ✓'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Btn, Card, ConfirmDialog, Err, Field, Modal, PageHeader, Pill, errStyle, inputCls, type PendingConfirm } from '@/components/ui';
import {
  createIncident, deleteIncident, listIncidents, listStudentsLite, patchIncident,
  type Incident, type IncidentKind, type IncidentSeverity,
} from '@/lib/safety';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export default function HealthPage() {
  const { activeSlug, tenant } = useAuth();
  const slug = activeSlug ?? '';
  const canWrite = tenant?.role === 'Admin' || tenant?.role === 'Teacher';
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<Incident[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ studentId: '', kind: 'injury' as IncidentKind, severity: 'low' as IncidentSeverity, title: '', detail: '', occurredAt: new Date().toISOString().slice(0, 10) });
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', detail: '', kind: 'injury' as IncidentKind, severity: 'low' as IncidentSeverity, occurredAt: '', notifiedParent: false });
  const [editErrors, setEditErrors] = useState<Record<string, string | undefined>>({});

  const load = useCallback(async () => {
    if (!slug) return;
    setErr(null);
    try {
      const [s, r] = await Promise.all([listStudentsLite(slug), listIncidents(slug, filter || undefined)]);
      setStudents(s);
      setRows(r);
      if (!form.studentId && s.length > 0) setForm((f) => ({ ...f, studentId: s[0].id }));
    } catch (e) { setErr(errMsg(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on mount/slug change
    void load(); }, [load]);

  const add = async () => {
    setBusy(true); setErr(null);
    try {
      await createIncident(slug, { studentId: form.studentId, kind: form.kind, severity: form.severity, title: form.title.trim(), detail: form.detail.trim(), occurredAt: form.occurredAt });
      setForm((f) => ({ ...f, title: '', detail: '' }));
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const toggle = async (r: Incident) => {
    setErr(null);
    try {
      await patchIncident(slug, r.id, { notifiedParent: !r.notifiedParent });
      await load();
    } catch (e) { setErr(errMsg(e)); }
  };

  const updEdit = (k: keyof typeof editForm, v: string | boolean) => {
    setEditForm((f) => ({ ...f, [k]: v }));
    setEditErrors((e) => ({ ...e, [k]: undefined }));
  };

  const resetEdit = () => {
    setEditForm({ title: '', detail: '', kind: 'injury', severity: 'low', occurredAt: '', notifiedParent: false });
    setEditErrors({});
    setEditId(null);
  };

  const openEdit = (r: Incident) => {
    setEditForm({ title: r.title, detail: r.detail, kind: r.kind, severity: r.severity, occurredAt: r.occurredAt, notifiedParent: r.notifiedParent });
    setEditErrors({});
    setEditId(r.id);
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!editId) return;
    const errs: Record<string, string | undefined> = {};
    if (editForm.title.trim().length < 3) errs.title = 'Title needs at least 3 characters.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editForm.occurredAt)) errs.occurredAt = 'Use YYYY-MM-DD.';
    setEditErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true); setErr(null);
    try {
      await patchIncident(slug, editId, {
        title: editForm.title.trim(),
        detail: editForm.detail.trim(),
        kind: editForm.kind,
        severity: editForm.severity,
        occurredAt: editForm.occurredAt,
        notifiedParent: editForm.notifiedParent,
      });
      setShowEdit(false);
      resetEdit();
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setErr(null);
    try { await deleteIncident(slug, id); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  const askRemove = (row: Incident) => {
    setConfirm({
      title: `Delete "${row.title}"?`,
      message: `Delete incident "${row.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => remove(row.id),
    });
  };

  if (!slug) return <PageHeader title="Health 🩹" sub="Select a school first." />;

  return (
    <div>
      <PageHeader title="Health 🩹" sub={`${rows.length} incidents · parents ${canWrite ? 'notified via toggle' : 'read-only'}`} />
      {err && <p className="mb-3 rounded-xl bg-[#FFE9EF] px-4 py-2 text-[13px] font-bold text-[#E11D48]">{err}</p>}
      <Card className="p-5">
        <Field label="Filter by student">
          <select className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All students</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </Card>

      {canWrite && (
        <Card className="mt-4 p-5">
          <p className="font-black">Log incident</p>
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            <select className={inputCls} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className={inputCls} placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as IncidentKind })}>
              {['injury', 'illness', 'allergy', 'behavior', 'other'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select className={inputCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as IncidentSeverity })}>
              {['low', 'medium', 'high'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input type="date" className={inputCls} value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
            <input className={inputCls} placeholder="Detail" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
          </div>
          <div className="mt-2"><Btn onClick={add} disabled={busy || !form.studentId || form.title.trim().length < 3}>Save incident</Btn></div>
        </Card>
      )}

      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-[14px] flex-1 min-w-[160px]">{r.title}</p>
              <Pill color={r.severity === 'high' ? '#FFE9EF' : r.severity === 'medium' ? '#FFF4CC' : '#EAFBEF'} text={r.severity === 'high' ? '#E11D48' : '#6B5B00'}>{r.severity}</Pill>
              <Pill>{r.kind}</Pill>
              <Pill color={r.notifiedParent ? '#EAFBEF' : '#F1F1F4'} text={r.notifiedParent ? '#16A34A' : '#6B6580'}>{r.notifiedParent ? 'parent notified' : 'not notified'}</Pill>
            </div>
            <p className="mt-1 text-[12px] font-semibold text-[#8A84A0]">{r.occurredAt} · {students.find((s) => s.id === r.studentId)?.name ?? r.studentId}</p>
            {r.detail && <p className="mt-1 text-[13px] font-medium">{r.detail}</p>}
            {canWrite && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => toggle(r)} className="rounded-lg bg-[#F6F0E6] px-3 py-1.5 text-[12px] font-black cursor-pointer">{r.notifiedParent ? 'Mark un-notified' : 'Mark notified'}</button>
                <button onClick={() => openEdit(r)} aria-label={`Edit ${r.title}`} title={`Edit ${r.title}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF]"><Pencil size={15} /></button>
                <button onClick={() => askRemove(r)} aria-label={`Delete ${r.title}`} className="rounded-lg bg-[#FFE9EF] px-3 py-1.5 text-[12px] font-black text-[#E11D48] cursor-pointer">Delete</button>
              </div>
            )}
          </Card>
        ))}
        {rows.length === 0 && <Card className="p-6 text-center text-[13px] font-semibold text-[#8A84A0]">No incidents recorded.</Card>}
      </div>
      <Modal open={showEdit} onClose={() => { setShowEdit(false); resetEdit(); }} label="Edit incident">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between"><h3 className="text-[18px] font-black">Edit incident ✏️</h3><button onClick={() => { setShowEdit(false); resetEdit(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Title"><input data-autofocus className={inputCls} style={errStyle(editErrors.title)} value={editForm.title} onChange={(e) => updEdit('title', e.target.value)} /><Err msg={editErrors.title} /></Field>
            <Field label="Detail"><input className={inputCls} value={editForm.detail} onChange={(e) => updEdit('detail', e.target.value)} placeholder="What happened…" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind"><select className={inputCls} value={editForm.kind} onChange={(e) => updEdit('kind', e.target.value as IncidentKind)}>{['injury', 'illness', 'allergy', 'behavior', 'other'].map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
              <Field label="Severity"><select className={inputCls} value={editForm.severity} onChange={(e) => updEdit('severity', e.target.value as IncidentSeverity)}>{['low', 'medium', 'high'].map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
            </div>
            <Field label="Occurred on"><input type="date" className={inputCls} style={errStyle(editErrors.occurredAt)} value={editForm.occurredAt} onChange={(e) => updEdit('occurredAt', e.target.value)} /><Err msg={editErrors.occurredAt} /></Field>
            <label className="flex items-center gap-2 text-[13px] font-bold"><input type="checkbox" checked={editForm.notifiedParent} onChange={(e) => updEdit('notifiedParent', e.target.checked)} /> Parent notified</label>
            <Btn className="w-full" onClick={saveEdit} disabled={busy}>Save changes ✓</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

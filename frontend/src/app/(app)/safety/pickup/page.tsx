'use client';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Btn, Card, ConfirmDialog, Err, Field, Modal, PageHeader, errStyle, inputCls, type PendingConfirm } from '@/components/ui';
import {
  createPickupContact, deletePickupContact, listPickupContacts, listPickupLog, listStudentsLite,
  logPickup, updatePickupContact, verifyPickupPin, type PickupContact, type PickupLogEntry,
} from '@/lib/safety';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export default function PickupPage() {
  const { activeSlug, tenant } = useAuth();
  const slug = activeSlug ?? '';
  const canWrite = tenant?.role === 'Admin' || tenant?.role === 'Teacher';
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [sid, setSid] = useState('');
  const [contacts, setContacts] = useState<PickupContact[]>([]);
  const [log, setLog] = useState<PickupLogEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', relation: '', phone: '', pin: '', isPrimary: false });
  const [note, setNote] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', relation: '', phone: '', pin: '' });
  const [editErrors, setEditErrors] = useState<Record<string, string | undefined>>({});
  const [pinFor, setPinFor] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinResult, setPinResult] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const loadStudents = useCallback(async () => {
    if (!slug) return;
    try {
      const s = await listStudentsLite(slug);
      setStudents(s);
      if (!sid && s.length > 0) setSid(s[0].id);
    } catch (e) { setErr(errMsg(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const load = useCallback(async (id: string) => {
    if (!slug || !id) return;
    setErr(null);
    try {
      const [c, l] = await Promise.all([listPickupContacts(slug, id), listPickupLog(slug, id)]);
      setContacts(c);
      setLog(l);
    } catch (e) { setErr(errMsg(e)); }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on mount/slug change
    void loadStudents(); }, [loadStudents]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on selection change
    if (sid) void load(sid); }, [sid, load]);

  const add = async () => {
    if (!sid || !canWrite) return;
    setBusy(true); setErr(null);
    try {
      await createPickupContact(slug, sid, {
        name: form.name.trim(), relation: form.relation.trim(), phone: form.phone.trim(),
        pin: form.pin.trim() ? form.pin.trim() : undefined, isPrimary: form.isPrimary,
      });
      setForm({ name: '', relation: '', phone: '', pin: '', isPrimary: false });
      await load(sid);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const updEdit = (k: keyof typeof editForm, v: string) => {
    setEditForm((f) => ({ ...f, [k]: v }));
    setEditErrors((e) => ({ ...e, [k]: undefined }));
  };

  const resetEdit = () => {
    setEditForm({ name: '', relation: '', phone: '', pin: '' });
    setEditErrors({});
    setEditId(null);
  };

  const openEdit = (c: PickupContact) => {
    setEditForm({ name: c.name, relation: c.relation, phone: c.phone, pin: '' });
    setEditErrors({});
    setEditId(c.id);
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!editId) return;
    const errs: Record<string, string | undefined> = {};
    if (editForm.name.trim().length < 2) errs.name = 'Name needs at least 2 characters.';
    if (editForm.phone.trim() && editForm.phone.trim().length < 6) errs.phone = 'Enter a valid phone number.';
    if (editForm.pin.trim() && !/^\d{4}$/.test(editForm.pin.trim())) errs.pin = 'PIN must be 4 digits.';
    setEditErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true); setErr(null);
    try {
      await updatePickupContact(slug, editId, {
        name: editForm.name.trim(),
        relation: editForm.relation.trim(),
        phone: editForm.phone.trim(),
        ...(editForm.pin.trim() ? { pin: editForm.pin.trim() } : {}),
      });
      setShowEdit(false);
      resetEdit();
      await load(sid);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setErr(null);
    try { await deletePickupContact(slug, id); await load(sid); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const askRemove = (contact: PickupContact) => {
    setConfirm({
      title: `Remove ${contact.name}?`,
      message: `Remove pickup contact "${contact.name}"? They will no longer be authorized for pickup.`,
      confirmLabel: 'Delete',
      onConfirm: () => remove(contact.id),
    });
  };

  const doLog = async (contactId: string | null) => {
    setBusy(true); setErr(null);
    try { await logPickup(slug, sid, { contactId, note: note.trim() || undefined }); setNote(''); await load(sid); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const doVerify = async () => {
    if (!pinFor || !pinInput) return;
    setErr(null); setPinResult(null);
    try {
      const ok = await verifyPickupPin(slug, pinFor, pinInput);
      setPinResult(ok ? 'PIN verified ✓' : 'PIN does not match.');
    } catch (e) { setErr(errMsg(e)); }
  };

  if (!slug) return <PageHeader title="Pickup 🔑" sub="Select a school first." />;

  return (
    <div>
      <PageHeader title="Pickup 🔑" sub="Authorized contacts, PIN check & daily log" />
      {err && <p className="mb-3 rounded-xl bg-[#FFE9EF] px-4 py-2 text-[13px] font-bold text-[#E11D48]">{err}</p>}
      <Card className="p-5">
        <Field label="Student">
          <select className={inputCls} value={sid} onChange={(e) => setSid(e.target.value)}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </Card>

      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="font-black">Authorized contacts</p>
          {contacts.length === 0 && <p className="mt-2 text-[13px] font-semibold text-[#8A84A0]">No contacts yet.</p>}
          {contacts.map((c) => (
            <div key={c.id} className="mt-2 flex items-center gap-2 rounded-xl border border-[#F1E6D8] p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black">{c.name} {c.isPrimary ? '⭐' : ''}</p>
                <p className="text-[12px] font-semibold text-[#8A84A0]">{c.relation} · {c.phone} · {c.hasPin ? 'PIN set' : 'no PIN'}</p>
              </div>
              {canWrite && (
                <>
                  <button onClick={() => doLog(c.id)} disabled={busy} className="rounded-lg bg-[#EAFBEF] px-2.5 py-1.5 text-[11px] font-black text-[#16A34A] cursor-pointer disabled:opacity-50">Log pickup</button>
                  <button onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`} title={`Edit ${c.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF]"><Pencil size={15} /></button>
                  <button onClick={() => askRemove(c)} disabled={busy} aria-label={`Remove ${c.name}`} className="rounded-lg bg-[#FFE9EF] px-2.5 py-1.5 text-[11px] font-black text-[#E11D48] cursor-pointer disabled:opacity-50">Remove</button>
                </>
              )}
            </div>
          ))}
          {canWrite && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className={inputCls} placeholder="Relation" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
                <input className={inputCls} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <input className={inputCls} placeholder="4-digit PIN (optional)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} maxLength={4} />
              </div>
              <label className="flex items-center gap-2 text-[13px] font-bold"><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} /> Primary contact</label>
              <Btn onClick={add} disabled={busy || form.name.trim().length < 2}>Add contact</Btn>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="font-black">Verify PIN</p>
            <div className="mt-2 flex gap-2">
              <select className={inputCls} value={pinFor} onChange={(e) => setPinFor(e.target.value)}>
                <option value="">Select contact…</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className={inputCls} placeholder="PIN" value={pinInput} onChange={(e) => setPinInput(e.target.value)} maxLength={4} />
              <Btn onClick={doVerify}>Check</Btn>
            </div>
            {pinResult && <p className="mt-2 text-[13px] font-bold">{pinResult}</p>}
          </Card>

          <Card className="p-5">
            <p className="font-black">Pickup log</p>
            {canWrite && (
              <div className="mt-2 flex gap-2">
                <input className={inputCls} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <Btn variant="soft" onClick={() => doLog(null)} disabled={busy || !sid}>Log w/o contact</Btn>
              </div>
            )}
            {log.length === 0 && <p className="mt-2 text-[13px] font-semibold text-[#8A84A0]">No pickups logged.</p>}
            {log.map((l) => (
              <p key={l.id} className="mt-1.5 text-[12px] font-semibold text-[#5B5670]">
                {new Date(l.pickedUpAt).toLocaleString()} · {contacts.find((c) => c.id === l.contactId)?.name ?? '—'} {l.note ? `· ${l.note}` : ''}
              </p>
            ))}
          </Card>
        </div>
      </div>
      <Modal open={showEdit} onClose={() => { setShowEdit(false); resetEdit(); }} label="Edit pickup contact">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between"><h3 className="text-[18px] font-black">Edit contact ✏️</h3><button onClick={() => { setShowEdit(false); resetEdit(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Name"><input data-autofocus className={inputCls} style={errStyle(editErrors.name)} value={editForm.name} onChange={(e) => updEdit('name', e.target.value)} placeholder="e.g. Grandma" /><Err msg={editErrors.name} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Relation"><input className={inputCls} value={editForm.relation} onChange={(e) => updEdit('relation', e.target.value)} placeholder="e.g. Grandmother" /></Field>
              <Field label="Phone"><input className={inputCls} style={errStyle(editErrors.phone)} value={editForm.phone} onChange={(e) => updEdit('phone', e.target.value)} placeholder="+91 …" /><Err msg={editErrors.phone} /></Field>
            </div>
            <Field label="New 4-digit PIN (optional — leave blank to keep)"><input className={inputCls} style={errStyle(editErrors.pin)} value={editForm.pin} onChange={(e) => updEdit('pin', e.target.value)} placeholder="••••" maxLength={4} /><Err msg={editErrors.pin} /></Field>
            <Btn className="w-full" onClick={saveEdit} disabled={busy}>Save changes ✓</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

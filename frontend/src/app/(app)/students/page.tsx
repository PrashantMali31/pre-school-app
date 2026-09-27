'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link2, Pencil, Phone, Plus, Search, Trash2, X } from 'lucide-react';
import { useDB, uid } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Avatar, Btn, Card, ConfirmDialog, Empty, Err, Field, Modal, PageHeader, Pager, PendingConfirm, Pill, errStyle, inputCls } from '@/components/ui';
import { FieldErrors, studentFormSchema, validateFields } from '@/lib/schemas';
import { ensureOptions } from '@/lib/options';
import { Student } from '@/lib/types';

const EMOJIS = ['🚀', '🌸', '🐥', '🦋', '🦖', '🍓', '⚽', '🐝', '🎨', '🌈', '🧸', '⭐'];
const COLORS = ['#FFE4EC', '#E4EBFF', '#FFF4CC', '#DFF7E5', '#E9D5FF', '#FFEDD5', '#E0F2FE'];

export default function StudentsPage() {
  const { db, update, tenantSlug } = useDB();
  const { tenant } = useAuth();
  const isAdmin = tenant?.role === 'Admin';
  const options = ensureOptions((db as { options?: unknown }).options);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', age: '3', gender: options.genders[0] ?? 'Girl', classId: '', parent: '', phone: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const upd = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const list = useMemo(() => db.students.filter((s) => {
    const okQ = (s.name + s.parent).toLowerCase().includes(q.toLowerCase());
    const okF = filter === 'all' ? true : filter === 'waitlist' ? s.status === 'waitlist' : s.classId === filter;
    return okQ && okF;
  }), [db.students, q, filter]);

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  // Derived (no effect): reset to page 1 when search/filters change the list
  // (via handlers below) or data shrinks below the page start.
  const safePage = (page - 1) * PAGE_SIZE >= list.length ? 1 : page;
  const paged = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const clsName = (id: string) => db.classes.find((c) => c.id === id)?.name ?? '—';

  const resetForm = () => {
    setForm({ name: '', age: '3', gender: options.genders[0] ?? 'Girl', classId: '', parent: '', phone: '' });
    setErrors({});
    setEditId(null);
  };

  const openEdit = (s: Student) => {
    setForm({ name: s.name, age: String(s.age), gender: s.gender, classId: s.classId, parent: s.parent, phone: s.phone });
    setErrors({});
    setEditId(s.id);
    setShow(true);
  };

  const save = () => {
    const { errors: errs, value } = validateFields(studentFormSchema, form);
    if (!value) {
      setErrors(errs);
      return;
    }
    if (editId) {
      const classId = value.classId || db.classes[0]?.id || 'c1';
      update((p) => ({
        ...p,
        students: p.students.map((x) => x.id === editId
          ? { ...x, name: value.name, age: value.age, gender: value.gender, classId, parent: value.parent, phone: value.phone }
          : x),
      }));
      setShow(false);
      resetForm();
      return;
    }
    add();
  };

  const add = () => {
    const { errors: errs, value } = validateFields(studentFormSchema, form);
    if (!value) {
      setErrors(errs);
      return;
    }
    const st: Student = {
      id: uid('s'), name: value.name, age: value.age, dob: `${new Date().getFullYear() - value.age}-01-01`,
      gender: value.gender, classId: value.classId || db.classes[0]?.id || 'c1',
      parent: value.parent, phone: value.phone, emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)], status: 'active', joinedAt: new Date().toISOString().slice(0, 10),
    };
    update((p) => ({ ...p, students: [st, ...p.students] }));
    setShow(false);
    setForm({ name: '', age: '3', gender: options.genders[0] ?? 'Girl', classId: '', parent: '', phone: '' });
    setErrors({});
  };

  const remove = (id: string) => update((p) => ({ ...p, students: p.students.filter((s) => s.id !== id) }));

  return (
    <div>
      <PageHeader title="Students 👧🧒" sub={`${db.students.length} total · ${db.students.filter(s=>s.status==='active').length} active · saved to localStorage`} right={<Btn variant="dark" onClick={() => { resetForm(); setShow(true); }}><Plus size={16} /> Admit kid</Btn>} />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 rounded-2xl bg-white border border-[#F1E6D8] px-4 py-2.5 flex-1 min-w-[220px]">
          <Search size={16} className="text-[#9A93B0]" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name or parent…" className="flex-1 outline-none text-sm font-semibold bg-transparent" />
        </div>
        {[{ v: 'all', l: 'All' }, { v: 'waitlist', l: 'Waitlist' }, ...db.classes.map((c) => ({ v: c.id, l: c.name }))].map((f) => (
          <button key={f.v} onClick={() => { setFilter(f.v); setPage(1); }} className={`rounded-full px-4 py-2.5 text-[12px] font-black cursor-pointer transition ${filter === f.v ? 'bg-[#1E1B2E] text-white' : 'bg-white border border-[#F1E6D8]'}`}>{f.l}</button>
        ))}
      </div>

      {list.length === 0 && <Card><Empty title="No kids found" sub="Try a different search — or admit your first student to start growing the garden." action={<Btn variant="dark" onClick={() => { resetForm(); setShow(true); }}><Plus size={15} /> Admit kid</Btn>} /></Card>}

      <motion.div layout className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {paged.map((s) => (
            <motion.div key={s.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <Card className="card-hover p-5">
                <div className="flex items-start gap-3">
                  <Avatar emoji={s.emoji} color={s.color} size={52} name={s.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-black truncate">{s.name}</p>
                    <p className="text-[12px] font-bold text-[#8A84A0]">{clsName(s.classId)} · {s.age}y · {s.gender}</p>
                  </div>
                  <Pill color={s.status === 'active' ? '#EAFBEF' : s.status === 'waitlist' ? '#FFF4CC' : '#F1F1F4'} text={s.status === 'active' ? '#16A34A' : '#8A6D00'}>{s.status}</Pill>
                </div>
                <div className="mt-4 space-y-1.5 text-[13px] font-semibold text-[#5B5670]">
                  <p>👪 {s.parent}</p>
                  <p className="flex items-center gap-1.5"><Phone size={13} /> {s.phone}</p>
                  {s.allergies && <p>⚠️ Allergic: {s.allergies}</p>}
                </div>
                {isAdmin && tenantSlug ? <ParentLinks studentId={s.id} slug={tenantSlug} /> : null}
                <div className="mt-4 flex gap-2">
                  <button onClick={() => update((p) => ({ ...p, students: p.students.map((x) => x.id === s.id ? { ...x, status: x.status === 'active' ? 'waitlist' : 'active' } : x) }))} className="flex-1 rounded-xl bg-[#F6F0E6] py-2 text-[12px] font-black cursor-pointer hover:bg-[#EFE3D0]">Toggle status</button>
                  <button onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`} title={`Edit ${s.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF]"><Pencil size={15} /></button>
                  <button onClick={() => setConfirm({ title: `Delete ${s.name}?`, message: `“${s.name}” will be removed. This cannot be undone.`, confirmLabel: 'Delete', onConfirm: () => remove(s.id) })} aria-label={`Remove ${s.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFE9EF] text-[#E11D48] cursor-pointer hover:bg-[#FFD6E3]"><Trash2 size={15} /></button>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      <Pager page={safePage} totalPages={totalPages} onPage={setPage} />

      <Modal open={show} onClose={() => { setShow(false); resetForm(); }} label={editId ? 'Edit student' : 'Admit new kid'}>
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between"><h3 className="text-[18px] font-black">{editId ? 'Edit kid ✏️' : 'Admit new kid 🎈'}</h3><button onClick={() => { setShow(false); resetForm(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Child name"><input data-autofocus className={inputCls} style={errStyle(errors.name)} value={form.name} onChange={(e) => upd('name', e.target.value)} placeholder="e.g. Aarav Sharma" /><Err msg={errors.name} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age"><input type="number" min={1} max={10} className={inputCls} style={errStyle(errors.age)} value={form.age} onChange={(e) => upd('age', e.target.value)} /><Err msg={errors.age} /></Field>
              <Field label="Gender"><select className={inputCls} value={form.gender} onChange={(e) => upd('gender', e.target.value)}>{options.genders.map((g) => <option key={g} value={g}>{g}</option>)}</select></Field>
            </div>
            <Field label="Class"><select className={inputCls} value={form.classId} onChange={(e) => upd('classId', e.target.value)}><option value="">Auto-assign</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Parent name"><input className={inputCls} style={errStyle(errors.parent)} value={form.parent} onChange={(e) => upd('parent', e.target.value)} placeholder="e.g. Rohit Sharma" /><Err msg={errors.parent} /></Field>
            <Field label="Phone"><input className={inputCls} style={errStyle(errors.phone)} value={form.phone} onChange={(e) => upd('phone', e.target.value)} placeholder="+91 …" /><Err msg={errors.phone} /></Field>
            <Btn className="w-full" onClick={save}>{editId ? 'Save changes ✓' : 'Add to school ✨'}</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

interface LinkedParent {
  userId: string;
  name: string;
  email: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Server-synced rows carry a uuid; freshly added rows keep a client temp id
 *  until their POST resolves and the id swap remounts this card. */
const isSyncedId = (v: string) => UUID_RE.test(v);

/** Admin-only per-student parent account linking (prompt email -> POST link; list + unlink). */
function ParentLinks({ studentId, slug }: { studentId: string; slug: string }) {
  const { tenant } = useAuth();
  const isAdmin = tenant?.role === 'Admin';
  const [links, setLinks] = useState<LinkedParent[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // Not on the server yet (POST in flight) — the id swap remounts this card
    // and the effect refires with the real uuid. Skip to avoid a 400 storm.
    if (!isSyncedId(studentId)) return () => { live = false; };
    api<{ data: LinkedParent[] }>(`/students/${studentId}/links`, { tenantSlug: slug })
      .then((r) => {
        if (live) setLinks(r.data ?? []);
      })
      .catch(() => {
        /* non-fatal: leave list empty, link button still works */
      });
    return () => {
      live = false;
    };
  }, [studentId, slug]);

  if (!isAdmin) return null;

  const link = async () => {
    const email = window.prompt('Parent account email:')?.trim();
    if (!email) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/students/${studentId}/link`, { method: 'POST', tenantSlug: slug, body: JSON.stringify({ email }) });
      const r = await api<{ data: LinkedParent[] }>(`/students/${studentId}/links`, { tenantSlug: slug });
      setLinks(r.data ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Link failed.');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (userId: string) => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/students/${studentId}/link/${userId}`, { method: 'DELETE', tenantSlug: slug });
      setLinks((l) => l.filter((x) => x.userId !== userId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unlink failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl bg-[#FFFEFB] border border-[#F5EEDF] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-wide text-[#8A84A0]">🔗 Linked parents</p>
        <button onClick={link} disabled={busy || !isSyncedId(studentId)} title={isSyncedId(studentId) ? undefined : 'Saving… try again in a moment'} className="flex items-center gap-1 rounded-lg bg-[#F6F0E6] px-2.5 py-1.5 text-[11px] font-black cursor-pointer hover:bg-[#EFE3D0] disabled:opacity-50 disabled:cursor-wait">
          <Link2 size={12} /> Link parent
        </button>
      </div>
      {links.length === 0 && <p className="mt-1.5 text-[12px] font-semibold text-[#8A84A0]">No parent account linked.</p>}
      {links.map((l) => (
        <div key={l.userId} className="mt-1.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#5B5670]" title={l.email}>{l.name} · {l.email}</p>
          <button onClick={() => unlink(l.userId)} disabled={busy} aria-label={`Unlink ${l.email}`} className="rounded-lg bg-[#FFE9EF] px-2 py-1 text-[11px] font-black text-[#E11D48] cursor-pointer hover:bg-[#FFD6E3] disabled:opacity-50">
            Unlink
          </button>
        </div>
      ))}
      {err && <p className="mt-1.5 text-[12px] font-bold text-[#E11D48]">{err}</p>}
    </div>
  );
}

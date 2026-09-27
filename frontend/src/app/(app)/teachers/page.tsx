'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useDB, uid } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { Avatar, Btn, Card, ConfirmDialog, Err, Field, Modal, PageHeader, Pager, PendingConfirm, Pill, errStyle, inputCls } from '@/components/ui';
import { FieldErrors, teacherFormSchema, validateFields } from '@/lib/schemas';
import { ensureOptions } from '@/lib/options';
import { Teacher } from '@/lib/types';

export default function TeachersPage() {
  const { db, update } = useDB();
  const { tenant } = useAuth();
  const isAdmin = tenant?.role === 'Admin';
  const options = ensureOptions((db as { options?: unknown }).options);
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', role: options.staffRoles[0] ?? 'Lead Educator', phone: '', classId: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(db.teachers.length / PAGE_SIZE));
  // Derived (no effect): reset to page 1 when data shrinks below the page start.
  const safePage = (page - 1) * PAGE_SIZE >= db.teachers.length ? 1 : page;
  const paged = db.teachers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const upd = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const resetForm = () => {
    setForm({ name: '', role: options.staffRoles[0] ?? 'Lead Educator', phone: '', classId: '' });
    setErrors({});
    setEditId(null);
  };

  const openEdit = (t: Teacher) => {
    setForm({ name: t.name, role: t.role, phone: t.phone, classId: t.classId ?? '' });
    setErrors({});
    setEditId(t.id);
    setShow(true);
  };

  const save = () => {
    const { errors: errs, value } = validateFields(teacherFormSchema, form);
    if (!value) {
      setErrors(errs);
      return;
    }
    if (editId) {
      update((p) => ({
        ...p,
        teachers: p.teachers.map((x) => x.id === editId
          ? { ...x, name: value.name, role: value.role, phone: value.phone, classId: value.classId || x.classId }
          : x),
      }));
      setShow(false);
      resetForm();
      return;
    }
    add();
  };

  const add = () => {
    const { errors: errs, value } = validateFields(teacherFormSchema, form);
    if (!value) {
      setErrors(errs);
      return;
    }
    update((p) => ({
      ...p, teachers: [{ id: uid('t'), name: value.name, role: value.role, classId: value.classId || p.classes[0]?.id || 'c1', phone: value.phone, email: '', emoji: '🦉', color: '#E4EBFF', status: 'active', joinedAt: new Date().toISOString().slice(0, 10) }, ...p.teachers],
    }));
    setShow(false);
    setForm({ name: '', role: options.staffRoles[0] ?? 'Lead Educator', phone: '', classId: '' });
    setErrors({});
  };

  return (
    <div>
      <PageHeader title="Teachers 🍎" sub={`${db.teachers.length} educators · mentors of little minds`} right={<Btn variant="dark" onClick={() => { resetForm(); setShow(true); }} disabled={!isAdmin} title={isAdmin ? undefined : 'Admin only'}><Plus size={16} /> Add teacher</Btn>} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {paged.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="card-hover p-5">
              <div className="flex items-center gap-3">
                <Avatar emoji={t.emoji} color={t.color} size={52} />
                <div className="flex-1 min-w-0"><p className="font-black truncate">{t.name}</p><p className="text-[12px] font-bold text-[#8A84A0]">{t.role}</p></div>
                <Pill color={t.status === 'active' ? '#EAFBEF' : '#FFF4CC'} text={t.status === 'active' ? '#16A34A' : '#8A6D00'}>{t.status}</Pill>
              </div>
              <div className="mt-3 rounded-2xl bg-[#FFFEFB] border border-[#F5EEDF] p-3 text-[13px] font-semibold text-[#5B5670]">
                <p>🏫 {db.classes.find((c) => c.id === t.classId)?.name ?? 'Floating'}</p>
                <p>📞 {t.phone}</p>
                <p>👶 {db.students.filter((s) => s.classId === t.classId && s.status === 'active').length} kids in class</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => update((p) => ({ ...p, teachers: p.teachers.map((x) => x.id === t.id ? { ...x, status: x.status === 'active' ? 'leave' : 'active' } : x) }))} disabled={!isAdmin} title={isAdmin ? 'Toggle leave' : 'Admin only'} className="flex-1 rounded-xl bg-[#F6F0E6] py-2 text-[12px] font-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">Toggle leave</button>
                <button onClick={() => openEdit(t)} disabled={!isAdmin} title={isAdmin ? `Edit ${t.name}` : 'Admin only'} aria-label={`Edit ${t.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF] disabled:opacity-40 disabled:cursor-not-allowed"><Pencil size={15} /></button>
                <button onClick={() => setConfirm({ title: `Delete ${t.name}?`, message: `“${t.name}” will be removed. This cannot be undone.`, confirmLabel: 'Delete', onConfirm: () => update((p) => ({ ...p, teachers: p.teachers.filter((x) => x.id !== t.id) })) })} disabled={!isAdmin} title={isAdmin ? `Remove ${t.name}` : 'Admin only'} aria-label={`Remove ${t.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFE9EF] text-[#E11D48] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 size={15} /></button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
      <Pager page={safePage} totalPages={totalPages} onPage={setPage} />
      <Modal open={show} onClose={() => { setShow(false); resetForm(); }} label={editId ? 'Edit educator' : 'Add educator'}>
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex justify-between items-center"><h3 className="font-black text-[18px]">{editId ? 'Edit educator ✏️' : 'Add educator ✨'}</h3><button onClick={() => { setShow(false); resetForm(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Name"><input data-autofocus className={inputCls} style={errStyle(errors.name)} value={form.name} onChange={(e) => upd('name', e.target.value)} placeholder="e.g. Divya Sharma" /><Err msg={errors.name} /></Field>
            <Field label="Role"><select className={inputCls} value={form.role} onChange={(e) => upd('role', e.target.value)}>{options.staffRoles.map((r) => <option key={r} value={r}>{r}</option>)}</select><p className="mt-1 text-[11px] font-semibold text-[#9A93B0]">Manage roles in <Link href="/options" className="font-black text-[#7C9DFF] hover:underline">Options & Masters</Link></p></Field>
            <Field label="Class"><select className={inputCls} value={form.classId} onChange={(e) => upd('classId', e.target.value)}><option value="">Floating</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Phone"><input className={inputCls} style={errStyle(errors.phone)} value={form.phone} onChange={(e) => upd('phone', e.target.value)} placeholder="+91 …" /><Err msg={errors.phone} /></Field>
            <Btn className="w-full" onClick={save}>{editId ? 'Save changes ✓' : 'Add teacher'}</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

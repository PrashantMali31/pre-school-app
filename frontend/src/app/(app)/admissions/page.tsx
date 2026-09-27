'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, GraduationCap, Pencil, Phone, Plus, Trash2, X } from 'lucide-react';
import { useDB, uid, todayISO } from '@/lib/store';
import { STAGES, useEnquiries, type Enquiry, type EnquiryStage } from '@/lib/enquiries';
import { Avatar, Btn, Card, ConfirmDialog, Empty, Err, Field, Modal, PageHeader, PendingConfirm, errStyle, inputCls } from '@/components/ui';
import { FieldErrors, enquiryFormSchema, validateFields } from '@/lib/schemas';
import { ensureOptions } from '@/lib/options';
import { Student } from '@/lib/types';

const STAGE_COLORS: Record<EnquiryStage, string> = {
  New: '#7C9DFF',
  Tour: '#FACC15',
  Applied: '#FB923C',
  Enrolled: '#4ADE80',
};

const AVATARS: Array<[string, string]> = [['🦊', '#FFE4EC'], ['🐰', '#E4EBFF'], ['🐥', '#FFF4CC'], ['🦋', '#E9D5FF'], ['🦖', '#DFF7E5'], ['🌈', '#E0E9FF']];

export default function AdmissionsPage() {
  const { db, update, tenantSlug } = useDB();
  const { items, add, edit, move, remove } = useEnquiries(tenantSlug);
  const options = ensureOptions((db as { options?: unknown }).options);
  const SOURCES = options.sources;
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ childName: '', age: '3', parent: '', phone: '', source: SOURCES[0] ?? 'Walk-in', note: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const upd = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = () => {
    const { errors: errs, value } = validateFields(enquiryFormSchema, form);
    if (!value) {
      setErrors(errs);
      return;
    }
    if (editId) {
      edit(editId, { childName: value.childName, age: value.age, parent: value.parent, phone: value.phone, source: value.source, note: value.note });
      setShow(false);
      resetForm();
      return;
    }
    add({ childName: value.childName, age: value.age, parent: value.parent, phone: value.phone, source: value.source, note: value.note });
    setShow(false);
    setForm({ childName: '', age: '3', parent: '', phone: '', source: SOURCES[0] ?? 'Walk-in', note: '' });
    setErrors({});
  };

  const resetForm = () => {
    setForm({ childName: '', age: '3', parent: '', phone: '', source: SOURCES[0] ?? 'Walk-in', note: '' });
    setErrors({});
    setEditId(null);
  };

  const openEdit = (e: Enquiry) => {
    setForm({ childName: e.childName, age: String(e.age), parent: e.parent, phone: e.phone, source: e.source, note: e.note ?? '' });
    setErrors({});
    setEditId(e.id);
    setShow(true);
  };

  const admit = (e: Enquiry) => {
    const [emoji, color] = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - e.age);
    // Enquiries don't capture gender yet — preserve it when present, else default to 'Boy'.
    const gender = (e as unknown as { gender?: string }).gender || 'Boy';
    const st: Student = {
      id: uid('s'),
      name: e.childName,
      age: e.age,
      dob: dob.toISOString().slice(0, 10),
      gender,
      classId: db.classes[0]?.id ?? 'c1',
      parent: e.parent,
      phone: e.phone,
      emoji,
      color,
      status: 'active',
      joinedAt: todayISO(),
      notes: `Admitted via ${e.source} pipeline`,
    };
    update((p) => ({ ...p, students: [st, ...p.students] }));
    remove(e.id);
  };

  return (
    <div>
      <PageHeader
        title="Admissions 🎯"
        sub={`${items.length} enquiries in pipeline · drag-free stages, one-tap admit`}
        right={<Btn variant="dark" onClick={() => { resetForm(); setShow(true); }}><Plus size={16} /> New enquiry</Btn>}
      />

      {items.length === 0 && (
        <Card><Empty title="Pipeline is empty" sub="Add your first enquiry — walk-ins, referrals, Instagram leads, all at home here." action={<Btn variant="dark" onClick={() => { resetForm(); setShow(true); }}><Plus size={15} /> Add enquiry</Btn>} /></Card>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {STAGES.map((stage) => {
          const cards = items.filter((i) => i.stage === stage);
          return (
            <div key={stage} className="rounded-[24px] bg-black/[0.03] dark:bg-white/[0.04] p-3">
              <div className="flex items-center gap-2 px-2 pb-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_COLORS[stage] }} />
                <p className="text-[13px] font-black">{stage}</p>
                <span className="ml-auto rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5 text-[11px] font-black">{cards.length}</span>
              </div>
              <div className="space-y-2.5">
                <AnimatePresence>
                  {cards.map((e) => (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                    >
                      <Card className="p-4">
                        <div className="flex items-start gap-2.5">
                          <Avatar emoji="🧒" color="#FFF1E6" size={40} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-extrabold text-[14px]">{e.childName} · {e.age}y</p>
                            <p className="truncate text-[12px] font-bold text-[#8A84A0]">👪 {e.parent}</p>
                            <p className="flex items-center gap-1 text-[12px] font-bold text-[#8A84A0]"><Phone size={11} /> {e.phone}</p>
                          </div>
                          <button onClick={() => openEdit(e)} aria-label={`Edit enquiry for ${e.childName}`} title={`Edit ${e.childName}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#E4EBFF] text-[#1E1B2E] hover:bg-[#D3E0FF] cursor-pointer">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setConfirm({ title: `Delete ${e.childName}?`, message: `“${e.childName}” will be removed. This cannot be undone.`, confirmLabel: 'Delete', onConfirm: () => remove(e.id) })} aria-label={`Delete enquiry for ${e.childName}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#9A93B0] hover:bg-[#FFE9EF] hover:text-[#E11D48] cursor-pointer">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5 text-[10.5px] font-black">{e.source}</span>
                          {e.note && <span className="truncate text-[11px] font-semibold text-[#8A84A0]">“{e.note}”</span>}
                        </div>
                        <div className="mt-3 flex items-center gap-1.5">
                          <button onClick={() => move(e.id, -1)} disabled={stage === 'New'} aria-label="Move back a stage" className="grid h-8 w-8 place-items-center rounded-xl bg-black/5 dark:bg-white/10 cursor-pointer disabled:opacity-30"><ArrowLeft size={14} /></button>
                          <button onClick={() => move(e.id, 1)} disabled={stage === 'Enrolled'} aria-label="Move forward a stage" className="grid h-8 w-8 place-items-center rounded-xl bg-black/5 dark:bg-white/10 cursor-pointer disabled:opacity-30"><ArrowRight size={14} /></button>
                          {stage === 'Applied' && (
                            <button onClick={() => admit(e)} className="ml-auto flex items-center gap-1.5 rounded-xl bg-[#1E1B2E] px-3 py-2 text-[11.5px] font-black text-white cursor-pointer hover:bg-black">
                              <GraduationCap size={14} /> Admit
                            </button>
                          )}
                          {stage === 'Enrolled' && (
                            <span className="ml-auto rounded-xl bg-[#EAFBEF] px-3 py-2 text-[11.5px] font-black text-[#16A34A]">Done 🎉</span>
                          )}
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={show} onClose={() => { setShow(false); resetForm(); }} label={editId ? 'Edit enquiry' : 'New enquiry'}>
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between"><h3 className="text-[18px] font-black">{editId ? 'Edit enquiry ✏️' : 'New enquiry 📝'}</h3><button onClick={() => { setShow(false); resetForm(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Child name"><input data-autofocus className={inputCls} style={errStyle(errors.childName)} value={form.childName} onChange={(e) => upd('childName', e.target.value)} placeholder="e.g. Aarav Sharma" /><Err msg={errors.childName} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age"><input type="number" min={1} max={10} className={inputCls} style={errStyle(errors.age)} value={form.age} onChange={(e) => upd('age', e.target.value)} /><Err msg={errors.age} /></Field>
              <Field label="Source"><select className={inputCls} value={form.source} onChange={(e) => upd('source', e.target.value)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            </div>
            <Field label="Parent name"><input className={inputCls} style={errStyle(errors.parent)} value={form.parent} onChange={(e) => upd('parent', e.target.value)} placeholder="e.g. Rohit Sharma" /><Err msg={errors.parent} /></Field>
            <Field label="Phone"><input className={inputCls} style={errStyle(errors.phone)} value={form.phone} onChange={(e) => upd('phone', e.target.value)} placeholder="+91 …" /><Err msg={errors.phone} /></Field>
            <Field label="Note (optional)"><input className={inputCls} value={form.note} onChange={(e) => upd('note', e.target.value)} placeholder="Sibling of Diya, prefers morning batch…" /><Err msg={errors.note} /></Field>
            <Btn className="w-full" onClick={submit}>{editId ? 'Save changes ✓' : 'Add to pipeline ✨'}</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

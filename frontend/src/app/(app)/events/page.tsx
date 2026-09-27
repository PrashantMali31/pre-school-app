'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarArrowDown, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useDB, uid, todayISO } from '@/lib/store';
import { Btn, Card, ConfirmDialog, Empty, Err, Field, Modal, PageHeader, PendingConfirm, errStyle, inputCls } from '@/components/ui';
import { DateDay, DateMonth } from '@/components/ClientDate';
import { FieldErrors, eventFormSchema, validateFields } from '@/lib/schemas';
import { ensureOptions } from '@/lib/options';
import { downloadICS } from '@/lib/export';
import { SchoolEvent } from '@/lib/types';

export default function EventsPage() {
  const { db, update } = useDB();
  const options = ensureOptions((db as { options?: unknown }).options);
  const TYPES = options.eventTypes;
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', date: todayISO(), time: '10:00 AM', location: '', type: TYPES[0] ?? 'Celebration' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const upd = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const sorted = [...db.events].sort((a, b) => a.date.localeCompare(b.date));

  const resetForm = () => {
    setForm({ title: '', date: todayISO(), time: '10:00 AM', location: '', type: TYPES[0] ?? 'Celebration' });
    setErrors({});
    setEditId(null);
  };

  const openEdit = (e: SchoolEvent) => {
    setForm({ title: e.title, date: e.date, time: e.time, location: e.location === 'School campus' ? '' : e.location, type: e.type });
    setErrors({});
    setEditId(e.id);
    setShow(true);
  };

  const save = () => {
    const { errors: errs, value } = validateFields(eventFormSchema, form);
    if (!value) {
      setErrors(errs);
      return;
    }
    if (editId) {
      update((p) => ({
        ...p,
        events: p.events.map((x) => x.id === editId
          ? { ...x, title: value.title, date: value.date, time: value.time, location: value.location || 'School campus', type: value.type }
          : x),
      }));
      setShow(false);
      resetForm();
      return;
    }
    add();
  };

  const add = () => {
    const { errors: errs, value } = validateFields(eventFormSchema, form);
    if (!value) {
      setErrors(errs);
      return;
    }
    update((p) => ({ ...p, events: [...p.events, { id: uid('e'), title: value.title, date: value.date, time: value.time, location: value.location || 'School campus', type: value.type, description: '', color: '#7C9DFF' }] }));
    setShow(false);
    setForm({ title: '', date: todayISO(), time: '10:00 AM', location: '', type: TYPES[0] ?? 'Celebration' });
    setErrors({});
  };

  return (
    <div>
      <PageHeader title="Events 🎪" sub="Field trips, festivals, PTMs — never miss the fun" right={<><Btn variant="soft" onClick={() => downloadICS('school-events.ics', db.events)}><CalendarArrowDown size={16} /> Calendar (.ics)</Btn><Btn variant="dark" onClick={() => { resetForm(); setShow(true); }}><Plus size={16} /> Plan event</Btn></>} />
      {sorted.length === 0 && <Card><Empty title="No events yet" sub="Plan your first celebration, trip or meet — parents will love it." action={<Btn variant="dark" onClick={() => { resetForm(); setShow(true); }}><Plus size={15} /> Plan event</Btn>} /></Card>}
      <div className="relative ml-2 border-l-[3px] border-dashed border-[#E9DCCF] pl-6 space-y-4">
        {sorted.map((e, i) => (
          <motion.div key={e.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative">
            <span className="absolute -left-[34px] top-5 grid h-5 w-5 place-items-center rounded-full border-4 border-[#FFF9F1]" style={{ background: e.color }} />
            <Card className="card-hover p-5 flex flex-wrap gap-4 items-center">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-white font-black" style={{ background: e.color }}>
                <span className="text-center leading-none"><span className="block text-[22px]"><DateDay value={e.date} /></span><span className="block text-[10px] uppercase"><DateMonth value={e.date} /></span></span>
              </div>
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: e.color }}>{e.type} · {e.time}</p>
                <p className="text-[16px] font-black">{e.title}</p>
                <p className="text-[13px] font-semibold text-[#8A84A0] flex items-center gap-1"><MapPin size={13} /> {e.location} · {e.description}</p>
              </div>
              <button onClick={() => openEdit(e)} aria-label={`Edit ${e.title}`} title={`Edit ${e.title}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF]"><Pencil size={15} /></button>
              <button onClick={() => setConfirm({ title: `Delete ${e.title}?`, message: `“${e.title}” will be removed. This cannot be undone.`, confirmLabel: 'Delete', onConfirm: () => update((p) => ({ ...p, events: p.events.filter((x) => x.id !== e.id) })) })} aria-label={`Delete ${e.title}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFE9EF] text-[#E11D48] cursor-pointer"><Trash2 size={15} /></button>
            </Card>
          </motion.div>
        ))}
      </div>
      <Modal open={show} onClose={() => { setShow(false); resetForm(); }} label={editId ? 'Edit event' : 'Plan new event'}>
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex justify-between"><h3 className="font-black text-[18px]">{editId ? 'Edit event ✏️' : 'Plan new event 🎉'}</h3><button onClick={() => { setShow(false); resetForm(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Title"><input data-autofocus className={inputCls} style={errStyle(errors.title)} value={form.title} onChange={(e) => upd('title', e.target.value)} placeholder="e.g. Mango Day" /><Err msg={errors.title} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" className={inputCls} style={errStyle(errors.date)} value={form.date} onChange={(e) => upd('date', e.target.value)} /><Err msg={errors.date} /></Field>
              <Field label="Time"><input className={inputCls} style={errStyle(errors.time)} value={form.time} onChange={(e) => upd('time', e.target.value)} /><Err msg={errors.time} /></Field>
            </div>
            <Field label="Location"><input className={inputCls} style={errStyle(errors.location)} value={form.location} onChange={(e) => upd('location', e.target.value)} placeholder="Main Hall" /><Err msg={errors.location} /></Field>
            <Field label="Type"><select className={inputCls} value={form.type} onChange={(e) => upd('type', e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Btn className="w-full" onClick={save}>{editId ? 'Save changes ✓' : 'Save event'}</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

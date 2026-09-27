'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useDB, uid } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { Btn, Card, ConfirmDialog, Field, Modal, PageHeader, inputCls, type PendingConfirm } from '@/components/ui';
import { DEFAULT_OPTIONS, OPTION_KEYS, OPTION_META, ensureOptions, type OptionKey } from '@/lib/options';
import { formatTimeRange, parseTimeRange } from '@/lib/time-range';
import type { ClassRoom } from '@/lib/types';

const CLASS_COLORS = ['#FF8FB1', '#7C9DFF', '#4ADE80', '#FB923C', '#C084FC', '#2DD4BF', '#FACC15'];

function OptionListEditor({
  optionKey,
  values,
  onAdd,
  onRemove,
  onReset,
  disabled,
}: {
  optionKey: OptionKey;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  const meta = OPTION_META[optionKey];
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    if (v.length > 60) {
      setErr('Keep it under 60 characters');
      return;
    }
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setErr('Already exists');
      return;
    }
    if (values.length >= 40) {
      setErr('Max 40 options');
      return;
    }
    onAdd(v);
    setDraft('');
    setErr('');
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-black text-[15px]">
            {meta.icon} {meta.label}
          </h3>
          <p className="mt-0.5 text-[12px] font-semibold text-[#8A84A0]">{meta.hint}</p>
        </div>
        <button
          onClick={onReset}
          title={disabled ? 'Admin only' : `Reset ${meta.label} to defaults`}
          disabled={disabled}
          className="flex items-center gap-1 rounded-xl bg-[#F6F0E6] px-2.5 py-1.5 text-[11px] font-black text-[#6B6580] hover:bg-[#EFE3D0] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="group inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] dark:bg-white/10 py-1.5 pl-3 pr-1.5 text-[12px] font-bold"
          >
            {v}
            <button
              onClick={() => onRemove(v)}
              aria-label={`Remove ${v}`}
              disabled={disabled || values.length <= 1}
              title={disabled ? 'Admin only' : `Remove ${v}`}
              className="grid h-5 w-5 place-items-center rounded-full bg-black/5 hover:bg-[#FFE4E6] hover:text-[#E11D48] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          disabled={disabled}
          title={disabled ? 'Admin only' : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setErr('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={`Add ${meta.label.toLowerCase()}…`}
          maxLength={60}
          className={inputCls}
        />
        <Btn variant="dark" onClick={submit} disabled={disabled} title={disabled ? 'Admin only' : undefined} className="!px-4">
          <Plus size={15} /> Add
        </Btn>
      </div>
      {err && <p className="mt-1.5 text-[12px] font-bold text-[#E11D48]">{err}</p>}
    </Card>
  );
}

const EMPTY_CLASS = { name: '', ageGroup: '', capacity: '20', room: '', time: '', color: CLASS_COLORS[1] };

export default function OptionsPage() {
  const { db, update } = useDB();
  const { tenant } = useAuth();
  const isAdmin = tenant?.role === 'Admin';
  const options = ensureOptions((db as { options?: unknown }).options);
  const [msg, setMsg] = useState('');
  const [showClass, setShow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [classForm, setClassForm] = useState(EMPTY_CLASS);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [classErr, setClassErr] = useState('');
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };

  const setList = (key: OptionKey, list: string[]) => {
    update((p) => ({ ...p, options: { ...ensureOptions(p.options), [key]: list } }));
  };

  const openAddClass = () => {
    setEditingId(null);
    setClassForm(EMPTY_CLASS);
    setTimeStart('09:00');
    setTimeEnd('12:00');
    setClassErr('');
    setShow(true);
  };

  const openEditClass = (c: ClassRoom) => {
    setEditingId(c.id);
    setClassForm({
      name: c.name,
      ageGroup: c.ageGroup,
      capacity: String(c.capacity),
      room: c.room,
      time: c.time,
      color: c.color,
    });
    const parsed = parseTimeRange(c.time);
    setTimeStart(parsed?.start ?? '');
    setTimeEnd(parsed?.end ?? '');
    setClassErr('');
    setShow(true);
  };

  const saveClass = () => {
    if (!isAdmin) {
      setClassErr('Admin only');
      return;
    }
    const name = classForm.name.trim();
    const capacity = parseInt(classForm.capacity, 10);
    if (name.length < 2) {
      setClassErr('Class name needs at least 2 characters');
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 200) {
      setClassErr('Capacity must be 1–200');
      return;
    }
    if (db.classes.some((c) => c.id !== editingId && c.name.toLowerCase() === name.toLowerCase())) {
      setClassErr('A class with this name already exists');
      return;
    }
    let time: string;
    if (timeStart && timeEnd) {
      if (timeStart >= timeEnd) {
        setClassErr('End time must be after start time');
        return;
      }
      time = formatTimeRange(timeStart, timeEnd);
    } else if (timeStart || timeEnd) {
      setClassErr('Pick both start and end time');
      return;
    } else {
      // Unparseable legacy text stays untouched instead of being wiped to '—'.
      const prev = editingId ? db.classes.find((c) => c.id === editingId)?.time : undefined;
      time = prev && prev !== '—' ? prev : '—';
    }
    if (editingId) {
      update((p) => ({
        ...p,
        classes: p.classes.map((c) =>
          c.id === editingId
            ? { ...c, name, ageGroup: classForm.ageGroup.trim() || '—', capacity, room: classForm.room.trim() || '—', time, color: classForm.color }
            : c
        ),
      }));
      flash('Class updated ✓');
    } else {
      const c: ClassRoom = {
        id: uid('c'),
        name,
        ageGroup: classForm.ageGroup.trim() || '—',
        capacity,
        teacherId: '',
        color: classForm.color,
        room: classForm.room.trim() || '—',
        time,
      };
      update((p) => ({ ...p, classes: [...p.classes, c] }));
      flash('Class added ✓');
    }
    setShow(false);
  };

  const doDeleteClass = (id: string) => {
    update((p) => ({ ...p, classes: p.classes.filter((c) => c.id !== id) }));
    flash('Class deleted ✓');
  };

  const askDeleteClass = (c: ClassRoom) => {
    if (!isAdmin) {
      flash('Admin only — ask your school Admin to delete classes.');
      return;
    }
    const kids = db.students.filter((s) => s.classId === c.id).length;
    const staff = db.teachers.filter((t) => t.classId === c.id).length;
    if (kids > 0 || staff > 0) {
      flash(`Can't delete — ${kids} kid(s), ${staff} teacher(s) linked. Move them first.`);
      return;
    }
    setConfirm({
      title: `Delete ${c.name}?`,
      message: `Delete class "${c.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => doDeleteClass(c.id),
    });
  };

  const importClassNames = () => {
    const names = db.classes.map((c) => c.name);
    const merged = [...options.audiences];
    for (const n of names) {
      if (!merged.some((x) => x.toLowerCase() === n.toLowerCase())) merged.push(n);
    }
    setList('audiences', merged);
    flash('Class names added to audiences ✓');
  };

  const updClass = (k: keyof typeof classForm, v: string) => setClassForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <PageHeader
        title="Options & Masters 🛠️"
        sub="Per-school dropdowns + classrooms — changes apply instantly to every form"
        right={<Btn variant="dark" onClick={openAddClass} disabled={!isAdmin} title={isAdmin ? undefined : 'Admin only'}><Plus size={16} /> New class</Btn>}
      />

      {msg && <div className="mb-4 rounded-2xl bg-[#DFF7E5] px-4 py-3 text-sm font-bold text-[#15803D]">{msg}</div>}

      {/* Classrooms */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-black">🏫 Classrooms <span className="text-[#8A84A0] font-bold">· {db.classes.length}</span></h2>
        <p className="text-[12px] font-semibold text-[#8A84A0]">Used in Students, Teachers, filters & reports</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {db.classes.map((c, i) => {
          const kids = db.students.filter((s) => s.classId === c.id && s.status === 'active').length;
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white text-lg font-black" style={{ background: c.color }}>
                    {c.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black truncate">{c.name}</p>
                    <p className="text-[12px] font-bold text-[#8A84A0]">{c.ageGroup} · {kids}/{c.capacity} kids</p>
                    <p className="text-[12px] font-semibold text-[#8A84A0]">📍 {c.room} · 🕘 {c.time}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openEditClass(c)} disabled={!isAdmin} title={isAdmin ? `Edit ${c.name}` : 'Admin only'} aria-label={`Edit ${c.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F6F0E6] hover:bg-[#EFE3D0] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"><Pencil size={15} /></button>
                    <button onClick={() => askDeleteClass(c)} disabled={!isAdmin} title={isAdmin ? `Delete ${c.name}` : 'Admin only'} aria-label={`Delete ${c.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFE9EF] text-[#E11D48] hover:bg-[#FFD6E3] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 size={15} /></button>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
        {db.classes.length === 0 && (
          <Card className="p-6 text-center">
            <p className="font-black">No classrooms yet</p>
            <p className="text-[13px] font-semibold text-[#8A84A0] mt-1">Add your first batch to start admitting kids.</p>
            <Btn variant="dark" className="mt-3" onClick={openAddClass} disabled={!isAdmin} title={isAdmin ? undefined : 'Admin only'}><Plus size={15} /> Add class</Btn>
          </Card>
        )}
      </div>

      {/* Dropdown lists */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-black">📋 Dropdown options <span className="text-[#8A84A0] font-bold">· per school</span></h2>
        {/** quick helper for audiences */}
        <button onClick={importClassNames} disabled={!isAdmin} title={isAdmin ? 'Copy class names into audiences' : 'Admin only'} className="rounded-xl bg-[#E4EBFF] px-3 py-2 text-[12px] font-black text-[#1E1B2E] hover:bg-[#d4e0ff] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          + Import class names to audiences
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {OPTION_KEYS.map((key) => (
          <OptionListEditor
            key={key}
            optionKey={key}
            values={options[key]}
            disabled={!isAdmin}
            onAdd={(v) => {
              setList(key, [...options[key], v]);
              flash(`${OPTION_META[key].label} updated ✓`);
            }}
            onRemove={(v) => {
              if (options[key].length <= 1) {
                flash('Keep at least one option');
                return;
              }
              setConfirm({
                title: `Remove "${v}"?`,
                message: `Remove "${v}" from ${OPTION_META[key].label}? This cannot be undone.`,
                confirmLabel: 'Delete',
                onConfirm: () => {
                  setList(key, options[key].filter((x) => x !== v));
                },
              });
            }}
            onReset={() => {
              setList(key, [...DEFAULT_OPTIONS[key]]);
              flash(`${OPTION_META[key].label} reset ✓`);
            }}
          />
        ))}
      </div>

      <Modal open={showClass} onClose={() => setShow(false)} label={editingId ? 'Edit class' : 'New class'}>
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-[18px] font-black">{editingId ? 'Edit class ✏️' : 'New class 🏫'}</h3>
            <button onClick={() => setShow(false)} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button>
          </div>
          <div className="mt-4 space-y-3">
            <Field label="Class name"><input data-autofocus className={inputCls} value={classForm.name} onChange={(e) => updClass('name', e.target.value)} placeholder="e.g. Little Explorers" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age group"><input className={inputCls} value={classForm.ageGroup} onChange={(e) => updClass('ageGroup', e.target.value)} placeholder="e.g. 2.5 – 3.5 yrs" /></Field>
              <Field label="Capacity"><input type="number" min={1} max={200} className={inputCls} value={classForm.capacity} onChange={(e) => updClass('capacity', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Room"><input className={inputCls} value={classForm.room} onChange={(e) => updClass('room', e.target.value)} placeholder="e.g. Room B · Rainbow" /></Field>
              <Field label="Time range">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-9 shrink-0 text-[11px] font-bold text-[#8A84A0]">From</span>
                    <input type="time" aria-label="Start time" className={inputCls} value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-9 shrink-0 text-[11px] font-bold text-[#8A84A0]">To</span>
                    <input type="time" aria-label="End time" className={inputCls} value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
                  </div>
                </div>
                {timeStart && timeEnd && timeStart < timeEnd && (
                  <p className="mt-1.5 text-[12px] font-bold text-[#8A84A0]">🕘 {formatTimeRange(timeStart, timeEnd)}</p>
                )}
              </Field>
            </div>
            <Field label="Color">
              <div className="flex gap-2">
                {CLASS_COLORS.map((col) => (
                  <button
                    key={col}
                    onClick={() => updClass('color', col)}
                    aria-label={`Pick color ${col}`}
                    className={`h-9 w-9 rounded-xl cursor-pointer ${classForm.color === col ? 'ring-2 ring-offset-2 ring-[#1E1B2E]' : ''}`}
                    style={{ background: col }}
                  />
                ))}
              </div>
            </Field>
            {classErr && <p className="text-[13px] font-bold text-[#E11D48]">{classErr}</p>}
            <Btn className="w-full" onClick={saveClass}>{editingId ? 'Save changes' : 'Add class ✨'}</Btn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

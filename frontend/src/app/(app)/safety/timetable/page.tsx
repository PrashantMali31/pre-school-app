'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Btn, Card, ConfirmDialog, Field, PageHeader, inputCls, type PendingConfirm } from '@/components/ui';
import { WEEKDAYS, getTimetable, listClassesLite, putTimetable, type TimetableSlot } from '@/lib/safety';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

interface Draft { weekday: number; startTime: string; endTime: string; activity: string }

export default function TimetablePage() {
  const { activeSlug, tenant } = useAuth();
  const slug = activeSlug ?? '';
  const canWrite = tenant?.role === 'Admin' || tenant?.role === 'Teacher';
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [cid, setCid] = useState('');
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>({ weekday: 1, startTime: '09:00', endTime: '09:45', activity: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const loadClasses = useCallback(async () => {
    if (!slug) return;
    try {
      const c = await listClassesLite(slug);
      setClasses(c);
      if (!cid && c.length > 0) setCid(c[0].id);
    } catch (e) { setErr(errMsg(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const load = useCallback(async (id: string) => {
    if (!slug || !id) return;
    setErr(null);
    try { setSlots(await getTimetable(slug, id)); }
    catch (e) { setErr(errMsg(e)); }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on mount/slug change
    void loadClasses(); }, [loadClasses]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on selection change
    if (cid) void load(cid); }, [cid, load]);

  const saveAll = async (next: Draft[]) => {
    setBusy(true); setErr(null);
    try {
      const saved = await putTimetable(slug, cid, next.map((s) => ({ ...s, teacherId: null })));
      setSlots(saved);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const resetDraft = () => {
    setDraft({ weekday: 1, startTime: '09:00', endTime: '09:45', activity: '' });
    setEditingId(null);
  };

  const addSlot = () => {
    if (!draft.activity.trim()) { setErr('Activity is required.'); return; }
    if (draft.endTime <= draft.startTime) { setErr('End time must be after start time.'); return; }
    if (editingId) {
      // Replace-all API: drop the old row, append the edited one.
      const kept = slots.filter((s) => s.id !== editingId).map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, activity: s.activity }));
      void saveAll([...kept, draft]);
    } else {
      void saveAll([...slots.map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, activity: s.activity })), draft]);
    }
    resetDraft();
  };

  const startEdit = (slot: TimetableSlot) => {
    setDraft({ weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime, activity: slot.activity });
    setEditingId(slot.id);
    setErr(null);
  };

  const removeSlot = (id: string) => {
    if (id === editingId) resetDraft();
    const kept = slots.filter((s) => s.id !== id).map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, activity: s.activity }));
    void saveAll(kept);
  };

  const askRemoveSlot = (slot: TimetableSlot) => {
    setConfirm({
      title: `Remove "${slot.activity}"?`,
      message: `Remove "${slot.activity}" (${slot.startTime}–${slot.endTime} on ${WEEKDAYS[slot.weekday] ?? ''})? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => removeSlot(slot.id),
    });
  };

  const clearAll = () => { void saveAll([]); };

  const askClearAll = () => {
    setConfirm({
      title: 'Clear week?',
      message: `Clear all ${slots.length} slot(s) for this class? This cannot be undone.`,
      confirmLabel: 'Clear',
      onConfirm: () => clearAll(),
    });
  };

  if (!slug) return <PageHeader title="Timetable 🗓️" sub="Select a school first." />;

  return (
    <div>
      <PageHeader title="Timetable 🗓️" sub={canWrite ? 'Replace-all editing · validated HH:MM' : 'Read-only for parents'} />
      {err && <p className="mb-3 rounded-xl bg-[#FFE9EF] px-4 py-2 text-[13px] font-bold text-[#E11D48]">{err}</p>}
      <Card className="p-5">
        <Field label="Class">
          <select className={inputCls} value={cid} onChange={(e) => setCid(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </Card>

      <div className="mt-4 grid md:grid-cols-7 gap-2">
        {WEEKDAYS.map((d, i) => (
          <Card key={d} className="p-3">
            <p className="font-black text-[13px]">{d}</p>
            {slots.filter((s) => s.weekday === i).map((s) => (
              <div key={s.id} className="mt-1.5 rounded-lg bg-[#FFFEFB] border border-[#F5EEDF] p-1.5">
                <p className="text-[11px] font-black">{s.startTime}–{s.endTime}</p>
                <p className="text-[12px] font-semibold">{s.activity}</p>
                {canWrite && (
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => startEdit(s)} aria-label={`Edit ${s.activity}`} className="text-[11px] font-black text-[#1E1B2E] cursor-pointer hover:underline">Edit</button>
                    <button onClick={() => askRemoveSlot(s)} aria-label={`Remove ${s.activity}`} className="text-[11px] font-black text-[#E11D48] cursor-pointer hover:underline">Remove</button>
                  </div>
                )}
              </div>
            ))}
            {slots.filter((s) => s.weekday === i).length === 0 && <p className="mt-1 text-[11px] font-semibold text-[#B9B2C7]">—</p>}
          </Card>
        ))}
      </div>

      {canWrite && (
        <Card className="mt-4 p-5">
          <div className="flex items-center justify-between">
            <p className="font-black">{editingId ? 'Edit slot ✏️' : 'Add slot'}</p>
            {editingId && <Btn variant="soft" onClick={resetDraft}>Cancel</Btn>}
          </div>
          <div className="mt-2 grid sm:grid-cols-5 gap-2">
            <select className={inputCls} value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <input type="time" aria-label="Start time" className={inputCls} value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
            <input type="time" aria-label="End time" className={inputCls} value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
            <input className={inputCls} placeholder="Activity *" value={draft.activity} onChange={(e) => setDraft({ ...draft, activity: e.target.value })} />
            <Btn onClick={addSlot} disabled={busy || !cid}>{editingId ? 'Save ✓' : 'Add'}</Btn>
          </div>
          <div className="mt-2"><Btn variant="soft" onClick={askClearAll} disabled={busy || slots.length === 0}>Clear week</Btn></div>
        </Card>
      )}
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}

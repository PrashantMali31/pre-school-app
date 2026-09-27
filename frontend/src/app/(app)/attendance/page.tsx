'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDB, todayISO } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { Avatar, Btn, Card, Empty, PageHeader, Pager, Pill } from '@/components/ui';
import { DateLong } from '@/components/ClientDate';
import { attendanceDateSchema } from '@/lib/schemas';
import { AttendanceStatus } from '@/lib/types';

const OPTS: { v: AttendanceStatus; emoji: string; label: string; bg: string }[] = [
  { v: 'present', emoji: '✅', label: 'Present', bg: '#DFF7E5' },
  { v: 'late', emoji: '⏰', label: 'Late', bg: '#FFF4CC' },
  { v: 'half', emoji: '🌓', label: 'Half', bg: '#E4EBFF' },
  { v: 'absent', emoji: '❌', label: 'Absent', bg: '#FFE4E6' },
];

export default function AttendancePage() {
  const { db, update } = useDB();
  const { tenant } = useAuth();
  const isAdmin = tenant?.role === 'Admin';
  const [date, setDate] = useState(todayISO());
  const day = db.attendance.find((a) => a.date === date);
  const records: Record<string, AttendanceStatus> = useMemo(() => day?.records ?? {}, [day]);

  const setValidDate = (v: string) => {
    // Zod-guard: never let a malformed date reach the store lookups
    if (attendanceDateSchema.safeParse(v).success) setDate(v);
    else setDate(todayISO());
    setPage(1);
  };

  const shift = (dir: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + dir);
    setValidDate(d.toISOString().slice(0, 10));
  };

  const setStatus = (sid: string, st: AttendanceStatus) => {
    update((p) => {
      const ex = p.attendance.find((a) => a.date === date);
      if (ex) return { ...p, attendance: p.attendance.map((a) => a.date === date ? { ...a, records: { ...a.records, [sid]: st } } : a) };
      return { ...p, attendance: [...p.attendance, { date, records: { [sid]: st } }] };
    });
  };

  const markAll = (st: AttendanceStatus) => {
    const all: Record<string, AttendanceStatus> = {};
    db.students.filter((s) => s.status === 'active').forEach((s) => (all[s.id] = st));
    update((p) => {
      const ex = p.attendance.find((a) => a.date === date);
      if (ex) return { ...p, attendance: p.attendance.map((a) => a.date === date ? { ...a, records: all } : a) };
      return { ...p, attendance: [...p.attendance, { date, records: all }] };
    });
  };

  const stats = useMemo(() => {
    const vals = Object.values(records);
    return {
      present: vals.filter((v) => v === 'present').length,
      late: vals.filter((v) => v === 'late').length,
      absent: vals.filter((v) => v === 'absent').length,
      half: vals.filter((v) => v === 'half').length,
      pct: vals.length ? Math.round(((vals.filter((v) => v !== 'absent').length) / vals.length) * 100) : 0,
    };
  }, [records]);

  const active = db.students.filter((s) => s.status === 'active');
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  // Derived (no effect): reset to page 1 when the date filter changes (via setValidDate)
  // or data shrinks below the page start.
  const safePage = (page - 1) * PAGE_SIZE >= active.length ? 1 : page;
  const paged = active.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Attendance 📋" sub={`Mark daily presence · synced to your school backend`} right={
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white border border-[#F1E6D8] cursor-pointer"><ChevronLeft size={17} /></button>
          <input type="date" value={date} onChange={(e) => setValidDate(e.target.value)} className="rounded-2xl border border-[#F1E6D8] bg-white px-4 py-2.5 text-sm font-bold outline-none dark:[color-scheme:dark]" />
          <button onClick={() => shift(1)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white border border-[#F1E6D8] cursor-pointer"><ChevronRight size={17} /></button>
        </div>
      } />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[{ l: 'Present', v: stats.present, c: '#DFF7E5' }, { l: 'Late', v: stats.late, c: '#FFF4CC' }, { l: 'Half day', v: stats.half, c: '#E4EBFF' }, { l: 'Absent', v: stats.absent, c: '#FFE4E6' }, { l: 'Rate', v: `${stats.pct}%`, c: '#F3E8FF' }].map((s, i) => (
          <Card key={s.l} delay={i * 0.04} className="p-4 text-center" >
            <p className="inline-block rounded-full px-3 py-1 text-[18px] font-black" style={{ background: s.c }}>{s.v}</p>
            <p className="mt-1.5 text-[12px] font-black text-[#8A84A0] uppercase tracking-wide">{s.l}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="font-black">{active.length} kids · <DateLong value={date} /></p>
          <div className="flex gap-2">
            <Btn variant="soft" onClick={() => markAll('present')} disabled={!isAdmin} title={isAdmin ? undefined : 'Admin only'}><Check size={15} /> All present</Btn>
            <Btn variant="ghost" onClick={() => markAll('absent')} disabled={!isAdmin} title={isAdmin ? undefined : 'Admin only'}>All absent</Btn>
          </div>
        </div>
        {active.length === 0 && <Empty title="No students yet" sub="Admit your first kid and they'll appear here for daily attendance." action={<Link href="/students"><Btn variant="dark">Go to Students</Btn></Link>} />}
        <div className="space-y-2.5">
          {paged.map((s, i) => {
            const cur = records[s.id];
            return (
              <motion.div key={s.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 transition ${cur ? 'bg-white border-[#F1E6D8]' : 'bg-[#FFFEFB] border-dashed border-[#E5D9C5]'}`}>
                <Avatar emoji={s.emoji} color={s.color} />
                <div className="min-w-0 flex-1 basis-32"><p className="text-[14px] font-extrabold">{s.name}</p><p className="text-[12px] text-[#8A84A0] font-semibold">{db.classes.find((c) => c.id === s.classId)?.name}</p></div>
                <div className="flex gap-1.5">
                  {OPTS.map((o) => (
                    <button key={o.v} onClick={() => setStatus(s.id, o.v)} disabled={!isAdmin} title={isAdmin ? o.label : 'Admin only'} aria-label={`Mark ${s.name} ${o.label}`} aria-pressed={cur === o.v}
                      className={`grid h-10 w-10 place-items-center rounded-xl text-lg cursor-pointer transition disabled:cursor-not-allowed ${cur === o.v ? 'scale-110 shadow-md' : 'opacity-50 hover:opacity-100 grayscale hover:grayscale-0'}`}
                      style={cur === o.v ? { background: o.bg } : { background: '#F6F0E6' }}>{o.emoji}</button>
                  ))}
                </div>
                {cur && <Pill color="#EAFBEF" text="#16A34A">{cur}</Pill>}
              </motion.div>
            );
          })}
        </div>
        <Pager page={safePage} totalPages={totalPages} onPage={setPage} />
      </Card>
    </div>
  );
}

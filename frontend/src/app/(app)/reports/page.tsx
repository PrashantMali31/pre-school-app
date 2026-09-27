'use client';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, Phone } from 'lucide-react';
import { useDB } from '@/lib/store';
import { Avatar, Btn, Card, PageHeader, Pill } from '@/components/ui';
import { downloadCSV } from '@/lib/export';
import { weekdayShort } from '@/lib/format';

function Donut({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, b) => a + b.value, 0) || 1;
  const R = 54;
  const C = 2 * Math.PI * R;
  const offsets: number[] = parts.map((_, i) => parts.slice(0, i).reduce((a, b) => a + b.value, 0) / total);
  return (
    <div className="flex flex-col gap-5 min-[420px]:flex-row min-[420px]:items-center">
      <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" strokeWidth="18" className="stroke-black/5 dark:stroke-white/10" />
          {parts.map((p, i) => {
            const frac = p.value / total;
            const el = (
              <motion.circle
                key={p.label}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={p.color}
                strokeWidth="18"
                strokeLinecap="butt"
                strokeDasharray={`${frac * C} ${C}`}
                strokeDashoffset={-offsets[i] * C}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              />
            );
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[20px] font-black leading-none">₹{Math.round(total / 1000)}k</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#8A84A0]">billed</p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2 text-[13px] font-bold">
            <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
            <span className="text-[#5B5670]">{p.label}</span>
            <span className="ml-auto pl-4 font-black">₹{p.value.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { db } = useDB();

  const billed = db.invoices.reduce((a, b) => a + b.amount, 0);
  const collected = db.invoices.filter((i) => i.status === 'paid').reduce((a, b) => a + b.amount, 0);
  const due = billed - collected;
  const overdue = db.invoices.filter((i) => i.status === 'overdue');
  const collPct = billed ? Math.round((collected / billed) * 100) : 0;

  const byClass = db.classes.map((c) => {
    const kids = db.students.filter((s) => s.classId === c.id && s.status === 'active');
    return { ...c, kids: kids.length, pct: Math.round((kids.length / Math.max(1, c.capacity)) * 100) };
  });

  const attByStudent = db.students
    .filter((s) => s.status === 'active')
    .map((s) => {
      let present = 0;
      let total = 0;
      for (const day of db.attendance) {
        const v = day.records[s.id];
        if (!v) continue;
        total++;
        if (v === 'present' || v === 'late') present++;
      }
      return { s, pct: total ? Math.round((present / total) * 100) : null as number | null, total };
    })
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));

  const clsName = (id: string) => db.classes.find((c) => c.id === id)?.name ?? '—';

  const expStudents = () =>
    downloadCSV(
      'students.csv',
      ['Name', 'Age', 'Gender', 'Class', 'Parent', 'Phone', 'Status', 'Joined'],
      db.students.map((s) => [s.name, s.age, s.gender, clsName(s.classId), s.parent, s.phone, s.status, s.joinedAt])
    );

  const expFees = () =>
    downloadCSV(
      'fees.csv',
      ['Invoice', 'Student', 'Title', 'Amount', 'Issued', 'Due', 'Status'],
      db.invoices.map((i) => [
        i.id,
        db.students.find((s) => s.id === i.studentId)?.name ?? '—',
        i.title,
        i.amount,
        i.issuedAt,
        i.dueDate,
        i.status,
      ])
    );

  const expAttendance = () =>
    downloadCSV(
      'attendance.csv',
      ['Date', 'Day', 'Student', 'Status'],
      db.attendance.flatMap((a) =>
        Object.entries(a.records).map(([sid, st]) => [
          a.date,
          weekdayShort(a.date),
          db.students.find((s) => s.id === sid)?.name ?? sid,
          st,
        ])
      )
    );

  return (
    <div>
      <PageHeader
        title="Reports 📊"
        sub="Collections, enrollment & attendance health — exportable in one click"
        right={
          <div className="flex flex-wrap gap-2">
            <Btn variant="soft" onClick={expStudents}><FileSpreadsheet size={15} /> Students</Btn>
            <Btn variant="soft" onClick={expFees}><FileSpreadsheet size={15} /> Fees</Btn>
            <Btn variant="soft" onClick={expAttendance}><FileSpreadsheet size={15} /> Attendance</Btn>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {[
          ['Billed', `₹${billed.toLocaleString('en-IN')}`, '#E4EBFF', '🧾'],
          ['Collected', `₹${collected.toLocaleString('en-IN')}`, '#DFF7E5', '✅'],
          ['Outstanding', `₹${due.toLocaleString('en-IN')}`, '#FFF4CC', '⏳'],
          ['Overdue bills', overdue.length, '#FFE4E6', '🚨'],
        ].map(([l, v, c, e], i) => (
          <Card key={l as string} delay={i * 0.05} className="p-5">
            <p className="inline-block rounded-2xl px-3 py-2 text-[22px]" style={{ background: c as string }}>{e}</p>
            <p className="mt-3 text-[22px] font-black tracking-tight">{v}</p>
            <p className="text-[12px] font-black uppercase tracking-wider text-[#8A84A0]">{l}</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h3 className="font-black text-[16px]">Collection health</h3>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${collPct}%` }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 60, damping: 20 }}
              className="h-full rounded-full bg-gradient-to-r from-[#4ADE80] to-[#2DD4BF]"
            />
          </div>
          <p className="mt-2 text-[13px] font-bold text-[#8A84A0]">{collPct}% collected · {overdue.length} overdue need follow-up</p>
          <div className="mt-4">
            <Donut
              parts={[
                { label: 'Paid', value: collected, color: '#4ADE80' },
                { label: 'Pending', value: db.invoices.filter((i) => i.status === 'pending').reduce((a, b) => a + b.amount, 0), color: '#FACC15' },
                { label: 'Overdue', value: overdue.reduce((a, b) => a + b.amount, 0), color: '#FB7185' },
              ]}
            />
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-black text-[16px]">Enrollment by class</h3>
          <div className="mt-4 space-y-3.5">
            {byClass.map((c, i) => (
              <div key={c.id}>
                <div className="flex items-center justify-between text-[13px] font-extrabold">
                  <span>{c.name}</span>
                  <span className="text-[#8A84A0]">{c.kids}/{c.capacity} · {c.pct}%</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, c.pct)}%` }}
                    transition={{ delay: 0.2 + i * 0.08 }}
                    className="h-full rounded-full"
                    style={{ background: c.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Btn variant="soft" className="w-full mt-5" onClick={expStudents}><Download size={15} /> Download full roster (CSV)</Btn>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card className="p-6">
          <h3 className="font-black text-[16px]">Attendance watchlist 👀</h3>
          <p className="text-[12px] font-semibold text-[#8A84A0]">Lowest attendance first — check in with these families</p>
          <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
            {attByStudent.length === 0 && <p className="text-sm font-semibold text-[#8A84A0]">No attendance data yet.</p>}
            {attByStudent.map(({ s, pct, total }) => (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-[#F5EEDF] p-2.5">
                <Avatar emoji={s.emoji} color={s.color} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13.5px] font-extrabold">{s.name}</p>
                  <p className="text-[11.5px] font-bold text-[#8A84A0]">{total} days marked</p>
                </div>
                {pct === null ? (
                  <Pill color="#F1F1F4" text="#8A84A0">no data</Pill>
                ) : (
                  <Pill color={pct >= 85 ? '#EAFBEF' : pct >= 70 ? '#FFF4CC' : '#FFE4E6'} text={pct >= 85 ? '#16A34A' : pct >= 70 ? '#8A6D00' : '#E11D48'}>
                    {pct}%
                  </Pill>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-black text-[16px]">Overdue follow-ups 📞</h3>
          <p className="text-[12px] font-semibold text-[#8A84A0]">Call list, sorted by oldest due date</p>
          <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
            {overdue.length === 0 && <p className="text-sm font-semibold text-[#16A34A]">Nothing overdue. Beautiful. ✨</p>}
            {[...overdue].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((i) => {
              const s = db.students.find((x) => x.id === i.studentId);
              return (
                <div key={i.id} className="flex items-center gap-3 rounded-2xl bg-[#FFE4E6]/50 border border-[#FFD6DE] p-3 dark:bg-[#FB7185]/10 dark:border-[#FB7185]/20">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[13.5px] font-extrabold">{s?.name ?? '—'} · ₹{i.amount.toLocaleString('en-IN')}</p>
                    <p className="text-[11.5px] font-bold text-[#8A84A0]">due {i.dueDate} · {s?.parent} · {s?.phone}</p>
                  </div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#16A34A] dark:bg-white/10" title={s?.phone}>
                    <Phone size={15} />
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

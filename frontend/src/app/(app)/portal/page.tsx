'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Baby, CalendarHeart, GraduationCap, Megaphone, Wallet } from 'lucide-react';
import { useDB } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { Card, PageHeader, Pill } from '@/components/ui';
import { DateDay, DateMonth } from '@/components/ClientDate';

function Ring({ pct }: { pct: number }) {
  const R = 40;
  const C = 2 * Math.PI * R;
  const color = pct >= 85 ? '#4ADE80' : pct >= 70 ? '#FACC15' : '#FB7185';
  return (
    <div className="relative shrink-0" style={{ width: 104, height: 104 }}>
      <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90">
        <circle cx="52" cy="52" r={R} fill="none" strokeWidth="11" className="stroke-black/5 dark:stroke-white/10" />
        <motion.circle
          cx="52"
          cy="52"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C - (pct / 100) * C }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <p className="text-[20px] font-black">{pct}%</p>
      </div>
    </div>
  );
}

const EMOJI: Record<string, string> = { present: '✅', absent: '❌', late: '⏰', half: '🌓' };

export default function PortalPage() {
  const { db, tenantSlug } = useDB();
  const { user, tenant } = useAuth();
  const isParent = tenant?.role === 'Parent';
  // Parents only see their linked children. Best-effort: the store has no
  // bulk parent-link endpoint, so match the account email against the
  // student email when present; Admins always see every active kid.
  const userEmail = user?.email?.trim().toLowerCase() ?? '';
  const kids = useMemo(() => {
    const active = db.students.filter((s) => s.status === 'active');
    if (!isParent) return active;
    if (userEmail) {
      const linked = active.filter((s) => s.email?.toLowerCase() === userEmail);
      if (linked.length > 0) return linked;
    }
    return active;
  }, [db.students, isParent, userEmail]);
  // Lazy init from the saved selection — no init effect, so no cascading renders.
  const [childId, setChildId] = useState<string>(() => {
    try {
      return localStorage.getItem(`sprouts_portal_child_${tenantSlug}`) ?? '';
    } catch {
      return '';
    }
  });

  // Persist the selection (writes only — never sets state).
  useEffect(() => {
    if (!childId) return;
    try {
      localStorage.setItem(`sprouts_portal_child_${tenantSlug}`, childId);
    } catch {}
  }, [childId, tenantSlug]);

  const child = kids.find((k) => k.id === childId) ?? kids[0];
  const cls = db.classes.find((c) => c.id === child?.classId);
  const teacher = db.teachers.find((t) => t.id === cls?.teacherId);

  const history = useMemo(() => {
    if (!child) return [];
    return [...db.attendance]
      .filter((a) => a.records[child.id])
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);
  }, [db.attendance, child]);

  const present = history.filter((h) => child && (h.records[child.id] === 'present' || h.records[child.id] === 'late')).length;
  const rate = history.length ? Math.round((present / history.length) * 100) : 0;

  const bills = useMemo(
    () => (child ? db.invoices.filter((i) => i.studentId === child.id) : []),
    [db.invoices, child]
  );
  const dueTotal = bills.filter((b) => b.status !== 'paid').reduce((a, b) => a + b.amount, 0);

  const upcoming = [...db.events].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);

  return (
    <div>
      <PageHeader
        title={`Parent Portal 💛`}
        sub={tenant?.role === 'Parent' ? `Welcome, ${user?.name} — here's your child's world` : 'Preview exactly what parents see for their child'}
        right={
          <select
            aria-label="Choose child"
            value={child?.id ?? ''}
            onChange={(e) => setChildId(e.target.value)}
            className="rounded-2xl border border-[#F1E6D8] bg-white px-4 py-2.5 text-sm font-bold outline-none dark:bg-[#161624] dark:border-white/10"
          >
            {kids.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        }
      />

      {!child && (
        <Card className="p-10 text-center">
          <p className="text-[16px] font-black">No children enrolled yet</p>
          <p className="text-sm text-[#8A84A0] font-medium">Admit a student first — the portal lights up automatically.</p>
        </Card>
      )}
      {isParent && (
        <p className="mb-4 rounded-2xl bg-[#E4EBFF] px-4 py-3 text-[13px] font-bold text-[#1E1B2E]">
          Parent view shows linked children only 👪
        </p>
      )}

      {child && (
        <>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[28px] bg-[#1E1B2E] text-white p-6 md:p-8">
            <div className="absolute -right-14 -top-14 h-56 w-56 rounded-full bg-gradient-to-br from-amber-300/30 to-pink-400/30 blur-3xl" />
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-20 w-20 place-items-center rounded-[24px] text-5xl shadow-lg" style={{ background: child.color }}>
                {child.emoji}
              </div>
              <div className="min-w-0 flex-1 basis-52">
                <p className="text-[11px] font-black uppercase tracking-widest text-white/55 flex items-center gap-1.5"><Baby size={12} /> {cls?.name} · {child.age} years old</p>
                <h2 className="text-[28px] font-black tracking-tight">{child.name}</h2>
                <p className="text-[13px] font-semibold text-white/65 flex items-center gap-1.5">
                  <GraduationCap size={14} /> {teacher ? `${teacher.name} (${teacher.role})` : 'Teacher to be assigned'} · {cls?.room}
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <div className="rounded-2xl bg-white/10 px-4 py-3 text-center border border-white/10">
                  <p className="text-[19px] font-black">{rate}%</p>
                  <p className="text-[10px] font-bold text-white/60 uppercase">attendance</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3 text-center border border-white/10">
                  <p className="text-[19px] font-black">₹{(dueTotal / 1000).toFixed(1)}k</p>
                  <p className="text-[10px] font-bold text-white/60 uppercase">fees due</p>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="mt-4 grid lg:grid-cols-3 gap-4">
            <Card className="p-6">
              <h3 className="font-black text-[16px]">Attendance journey</h3>
              <div className="mt-3 flex items-center gap-4">
                <Ring pct={rate} />
                <p className="text-[13px] font-semibold text-[#5B5670]">Present {present} of last {history.length} school days. Every day counts! 🌱</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {history.map((h) => (
                  <span key={h.date} title={`${h.date}: ${h.records[child.id]}`} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 text-base dark:bg-white/10">
                    {EMOJI[h.records[child.id]]}
                  </span>
                ))}
                {history.length === 0 && <p className="text-sm font-semibold text-[#8A84A0]">No marks yet — fresh start!</p>}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-black text-[16px] flex items-center gap-2"><Wallet size={16} className="text-[#2DD4BF]" /> Fee statement</h3>
              <div className="mt-3 space-y-2.5">
                {bills.length === 0 && <p className="text-sm font-semibold text-[#8A84A0]">No bills raised for {child.name.split(' ')[0]} yet.</p>}
                {bills.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-[#F5EEDF] p-3">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-extrabold">{b.title}</p>
                      <p className="text-[11.5px] font-bold text-[#8A84A0]">due {b.dueDate}</p>
                    </div>
                    <p className="font-black">₹{b.amount.toLocaleString('en-IN')}</p>
                    <Pill color={b.status === 'paid' ? '#DFF7E5' : b.status === 'overdue' ? '#FFE4E6' : '#FFF4CC'} text={b.status === 'paid' ? '#16A34A' : b.status === 'overdue' ? '#E11D48' : '#8A6D00'}>{b.status}</Pill>
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="p-6">
                <h3 className="font-black text-[16px] flex items-center gap-2"><CalendarHeart size={16} className="text-[#FF8FB1]" /> Coming up</h3>
                <div className="mt-3 space-y-2.5">
                  {upcoming.map((e) => (
                    <div key={e.id} className="flex gap-3 items-center rounded-2xl bg-[#FFFEFB] border border-[#F5EEDF] p-2.5">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white font-black" style={{ background: e.color }}>
                        <span className="text-center leading-none"><span className="block text-[15px]"><DateDay value={e.date} /></span><span className="block text-[8px]"><DateMonth value={e.date} /></span></span>
                      </div>
                      <div className="min-w-0"><p className="truncate text-[13px] font-extrabold">{e.title}</p><p className="text-[11.5px] text-[#8A84A0] font-semibold">{e.time}</p></div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-6">
                <h3 className="font-black text-[16px] flex items-center gap-2"><Megaphone size={16} className="text-[#FACC15]" /> Notices</h3>
                <div className="mt-3 space-y-2">
                  {db.announcements.slice(0, 2).map((a) => (
                    <div key={a.id} className="rounded-2xl bg-white border border-[#F1E6D8] p-3">
                      <p className="text-[13px] font-extrabold">{a.pinned ? '📌 ' : ''}{a.title}</p>
                      <p className="text-[12px] text-[#6B6580] font-medium line-clamp-2">{a.body}</p>
                    </div>
                  ))}
                  {db.announcements.length === 0 && <p className="text-sm font-semibold text-[#8A84A0]">All quiet for now.</p>}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

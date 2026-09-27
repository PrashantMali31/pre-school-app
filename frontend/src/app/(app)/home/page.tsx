'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Baby, CalendarHeart, ClipboardCheck, Plus, Sparkles, Wallet } from 'lucide-react';
import { useDB, todayISO } from '@/lib/store';
import { Avatar, Btn, Card, Pill, Skeleton } from '@/components/ui';
import { DateDay, DateMonth, TodayLabel } from '@/components/ClientDate';
import { weekdayShort } from '@/lib/format';
import TrendChart from '@/components/TrendChart';

interface KPIProps { label: string; value: React.ReactNode; sub: string; emoji: string; bg: string; delay?: number }
function KPI({ label, value, sub, emoji, bg, delay }: KPIProps) {
  return (
    <Card delay={delay} className="card-hover p-5 relative overflow-hidden">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20" style={{ background: bg }} />
      <div className="flex items-start justify-between">
        <div className="grid h-12 w-12 place-items-center rounded-2xl text-2xl" style={{ background: bg }}>{emoji}</div>
        <span className="flex items-center gap-1 rounded-full bg-[#EAFBEF] px-2.5 py-1 text-[11px] font-black text-[#16A34A]"><ArrowUpRight size={12} />{sub}</span>
      </div>
      <p className="mt-4 text-[32px] font-black tracking-tight leading-none">{value}</p>
      <p className="mt-1 text-[13px] font-bold text-[#8A84A0]">{label}</p>
    </Card>
  );
}

export default function Home() {
  const { db, loading } = useDB();
  const today = todayISO();
  const todayAtt = db.attendance.find((a) => a.date === today);
  const presentCount = todayAtt ? Object.values(todayAtt.records).filter((v) => v === 'present' || v === 'late').length : 0;
  const activeKids = db.students.filter((s) => s.status === 'active').length;
  const feesDue = db.invoices.filter((i) => i.status !== 'paid').reduce((a, b) => a + b.amount, 0);
  const feesPaid = db.invoices.filter((i) => i.status === 'paid').reduce((a, b) => a + b.amount, 0);

  const trend = [...db.attendance].slice(-7).map((a) => {
    const vals = Object.values(a.records);
    const present = vals.filter((v) => v === 'present' || v === 'late').length;
    return {
      label: weekdayShort(a.date),
      value: vals.length ? Math.round((present / vals.length) * 100) : 0,
      sub: `${present}/${vals.length} present`,
    };
  });

  const upcoming = [...db.events].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const className = (id: string) => db.classes.find((c) => c.id === id)?.name ?? '—';

  return (
    <div>
      {/* hero */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[28px] bg-[#1E1B2E] text-white p-6 md:p-9">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-br from-pink-400/40 to-indigo-400/40 blur-3xl" />
        <div className="absolute right-3 bottom-0 text-[76px] leading-none opacity-50 select-none animate-floaty sm:right-6 sm:text-[110px] md:right-10 md:text-[160px] md:opacity-90">🌈</div>
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-[12px] font-bold text-white/85">
          <Sparkles size={13} /> Good morning, {db.profile.principal.split(' ')[0]} · <TodayLabel />
        </p>
        <h1 className="mt-4 max-w-xl text-[30px] md:text-[44px] font-black tracking-tight leading-[1.02]">
          {presentCount} little sprouts are in school today 🌱
        </h1>
        <p className="mt-2 max-w-md text-[14px] font-medium text-white/65">
          {db.profile.name} · {activeKids} active kids · {db.teachers.length} educators · everything saved in this browser instantly.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/attendance"><Btn variant="dark"><ClipboardCheck size={16} /> Take attendance</Btn></Link>
          <Link href="/students"><Btn variant="soft" className="!bg-white/10 !text-white !border-white/15 hover:!bg-white/20"><Plus size={16} /> Admit student</Btn></Link>
          <Link href="/fees"><Btn variant="soft" className="!bg-white/10 !text-white !border-white/15 hover:!bg-white/20"><Wallet size={16} /> Collect fees</Btn></Link>
        </div>
      </motion.div>

      {/* KPIs */}
      {loading ? (
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Loading statistics">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[24px] bg-white border border-[#F1E6D8] p-5 dark:bg-[#161624] dark:border-white/10">
              <Skeleton style={{ width: 48, height: 48, borderRadius: 16 }} />
              <Skeleton className="mt-4" style={{ height: 32, width: '60%' }} />
              <Skeleton className="mt-2" style={{ height: 14, width: '80%' }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI label="Active students" value={activeKids} sub="+12%" emoji="🧒" bg="#FFE4EC" delay={0.05} />
          <KPI label="Attendance today" value={`${todayAtt && activeKids ? Math.round((presentCount / Math.max(1, Object.keys(todayAtt.records).length)) * 100) : 0}%`} sub="+4%" emoji="✅" bg="#DFF7E5" delay={0.1} />
          <KPI label="Fees to collect" value={`₹${(feesDue / 1000).toFixed(1)}k`} sub="live" emoji="💰" bg="#FFF4CC" delay={0.15} />
          <KPI label="Collected" value={`₹${(feesPaid / 1000).toFixed(1)}k`} sub="+18%" emoji="🎉" bg="#E4EBFF" delay={0.2} />
        </div>
      )}

      <div className="mt-4 grid lg:grid-cols-3 gap-4">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div><h3 className="font-black text-[17px]">Attendance pulse</h3><p className="text-[12px] text-[#8A84A0] font-semibold">Rate trend · hover the dots for detail</p></div>
            <Link href="/attendance" className="text-[12px] font-black flex items-center gap-1 text-[#7C9DFF]">Open <ArrowRight size={13} /></Link>
          </div>
          {loading ? (
            <Skeleton className="mt-4" style={{ height: 250 }} />
          ) : trend.length > 1 ? (
            <TrendChart data={trend} />
          ) : (
            <p className="mt-6 text-center text-sm font-semibold text-[#8A84A0]">Take attendance for a few days to grow this chart 🌱</p>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-[17px]">Upcoming magic ✨</h3>
            <Link href="/events" className="text-[12px] font-black text-[#FF8FB1]">All</Link>
          </div>
          <div className="mt-4 space-y-3">
            {upcoming.map((e) => (
              <div key={e.id} className="flex gap-3 rounded-2xl bg-[#FFFEFB] border border-[#F5EEDF] p-3 card-hover">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white font-black" style={{ background: e.color }}>
                  <span className="text-center leading-none"><span className="block text-[16px]"><DateDay value={e.date} /></span><span className="block text-[9px]"><DateMonth value={e.date} /></span></span>
                </div>
                <div className="min-w-0"><p className="truncate text-[13.5px] font-extrabold">{e.title}</p><p className="text-[12px] text-[#8A84A0] font-semibold">{e.time} · {e.location}</p></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid lg:grid-cols-3 gap-4">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-[17px]">Newest sprouts</h3>
            <Link href="/students" className="text-[12px] font-black text-[#7C9DFF] flex items-center gap-1">View all <ArrowRight size={13} /></Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[...db.students].slice(-4).reverse().map((s) => (
              <motion.div key={s.id} whileHover={{ y: -2 }} className="flex items-center gap-3 rounded-2xl border border-[#F5EEDF] p-3">
                <Avatar emoji={s.emoji} color={s.color} />
                <div className="min-w-0"><p className="truncate text-[14px] font-extrabold">{s.name}</p><p className="text-[12px] text-[#8A84A0] font-semibold">{className(s.classId)} · {s.age}y</p></div>
                <Pill color="#EAFBEF" text="#16A34A"><Baby size={11} />{s.status}</Pill>
              </motion.div>
            ))}
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-b from-white to-[#FFF6EC]">
          <h3 className="font-black text-[17px] flex items-center gap-2"><CalendarHeart size={17} className="text-[#FF8FB1]" /> Notice board</h3>
          <div className="mt-3 space-y-2.5">
            {db.announcements.slice(0, 3).map((a) => (
              <div key={a.id} className="rounded-2xl bg-white border border-[#F1E6D8] p-3.5">
                <p className="text-[13px] font-extrabold flex items-center gap-2">{a.pinned ? '📌' : '📝'} {a.title}</p>
                <p className="mt-1 text-[12.5px] text-[#6B6580] font-medium line-clamp-2">{a.body}</p>
              </div>
            ))}
          </div>
          <Link href="/messages"><Btn className="w-full mt-4" variant="soft">Broadcast message</Btn></Link>
        </Card>
      </div>
    </div>
  );
}

'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bus,
  CalendarHeart,
  Check,
  ClipboardCheck,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Megaphone,
  ShieldCheck,
  Sprout,
  Star,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

/* ------------------------------------------------------------------ */
/* Little Sprouts · public landing page.                               */
/* Logged-in visitors bounce straight into the app (/home).            */
/* Artwork is pure inline SVG + framer-motion — zero image assets.     */
/* ------------------------------------------------------------------ */

const rise = {
  hidden: { opacity: 0, y: 28 },
  show: (d: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: d, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const floaty = (delay = 0, distance = 12) => ({
  animate: { y: [0, -distance, 0] },
  transition: { duration: 4.5, delay, repeat: Infinity, ease: 'easeInOut' as const },
});

/** Smiling sun with slowly spinning rays. */
function Sun({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      >
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 6;
          const x1 = 50 + Math.cos(a) * 30;
          const y1 = 50 + Math.sin(a) * 30;
          const x2 = 50 + Math.cos(a) * 40;
          const y2 = 50 + Math.sin(a) * 40;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFC46B" strokeWidth="5" strokeLinecap="round" />;
        })}
      </motion.svg>
      <div className="absolute inset-[22%] rounded-full bg-gradient-to-br from-[#FFE29A] to-[#FFB35C]">
        <div className="flex h-full items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1E1B2E]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#1E1B2E]" />
        </div>
        <div className="mx-auto -mt-[38%] h-[12%] w-[28%] rounded-b-full border-b-[3px] border-[#1E1B2E]" />
      </div>
    </div>
  );
}

/** Drifting puffy cloud. */
function Cloud({ className = '', delay = 0, wide = false }: { className?: string; delay?: number; wide?: boolean }) {
  return (
    <motion.div
      className={className}
      animate={{ x: [0, 26, 0] }}
      transition={{ duration: 9, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="0 0 120 60" className={`h-auto ${wide ? 'w-36' : 'w-24'} fill-white drop-shadow-lg dark:fill-white/15`}>
        <ellipse cx="38" cy="40" rx="26" ry="16" />
        <ellipse cx="66" cy="30" rx="24" ry="19" />
        <ellipse cx="90" cy="42" rx="20" ry="13" />
      </svg>
    </motion.div>
  );
}

/** Cute schoolhouse with a waving flag. */
function Schoolhouse({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 170" className={className}>
      {/* rainbow */}
      <g fill="none" strokeWidth="7" strokeLinecap="round" opacity="0.85">
        <path d="M14 78 A 52 52 0 0 1 118 78" stroke="#FF8FB1" />
        <path d="M24 78 A 42 42 0 0 1 108 78" stroke="#FFC46B" />
        <path d="M34 78 A 32 32 0 0 1 98 78" stroke="#4ADE80" />
        <path d="M44 78 A 22 22 0 0 1 88 78" stroke="#7C9DFF" />
      </g>
      {/* main block */}
      <rect x="70" y="80" width="100" height="70" rx="10" fill="#FFFDF8" stroke="#1E1B2E" strokeWidth="4" />
      {/* roof */}
      <path d="M58 86 L120 40 L182 86 Z" fill="#FF8FB1" stroke="#1E1B2E" strokeWidth="4" strokeLinejoin="round" />
      {/* flag */}
      <line x1="120" y1="40" x2="120" y2="22" stroke="#1E1B2E" strokeWidth="4" strokeLinecap="round" />
      <motion.g
        style={{ originX: '120px', originY: '26px' }}
        animate={{ scaleX: [1, 0.82, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path d="M120 20 h22 l-5 6 5 6 h-22 z" fill="#7C9DFF" />
      </motion.g>
      {/* door + windows */}
      <rect x="108" y="112" width="24" height="38" rx="6" fill="#7C9DFF" stroke="#1E1B2E" strokeWidth="4" />
      <rect x="80" y="98" width="18" height="18" rx="5" fill="#BFE3FF" stroke="#1E1B2E" strokeWidth="4" />
      <rect x="142" y="98" width="18" height="18" rx="5" fill="#BFE3FF" stroke="#1E1B2E" strokeWidth="4" />
      {/* sunflowers */}
      <g stroke="#16A34A" strokeWidth="4" strokeLinecap="round">
        <line x1="52" y1="150" x2="52" y2="128" />
        <line x1="188" y1="150" x2="188" y2="128" />
      </g>
      <circle cx="52" cy="122" r="9" fill="#FACC15" stroke="#1E1B2E" strokeWidth="3" />
      <circle cx="188" cy="122" r="9" fill="#FACC15" stroke="#1E1B2E" strokeWidth="3" />
      {/* ground */}
      <ellipse cx="120" cy="156" rx="104" ry="10" fill="#4ADE80" opacity="0.5" />
    </svg>
  );
}

/** Twinkling star dot. */
function Twinkle({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.span
      className={`absolute text-[#FFC46B] ${className}`}
      animate={{ opacity: [0.2, 1, 0.2], scale: [0.7, 1.15, 0.7], rotate: [0, 25, 0] }}
      transition={{ duration: 2.6, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      <Star size={18} fill="currentColor" />
    </motion.span>
  );
}

const FEATURES = [
  { icon: Users, color: '#7C9DFF', bg: '#E4EBFF', title: 'Students', text: 'Profiles, allergy notes & parent contacts — every kid one tap away.' },
  { icon: ClipboardCheck, color: '#16A34A', bg: '#DFF7E5', title: 'Attendance', text: 'Morning roll-call in seconds, with weekly trends per class.' },
  { icon: Wallet, color: '#0D9488', bg: '#CCFBF1', title: 'Fees & Billing', text: 'Invoices, receipts & reminders — no more register-book math.' },
  { icon: GraduationCap, color: '#9333EA', bg: '#F3E8FF', title: 'Teachers & Payroll', text: 'Staff records, leave requests and monthly payslips.' },
  { icon: ShieldCheck, color: '#059669', bg: '#D1FAE5', title: 'Safety First', text: 'Pickup PINs, incident logs & bus routes with stops.' },
  { icon: CalendarHeart, color: '#DB2777', bg: '#FCE7F3', title: 'Events & Timetable', text: 'Celebrations, field trips and class-wise weekly timetables.' },
  { icon: Megaphone, color: '#D97706', bg: '#FEF3C7', title: 'Announcements', text: 'Reach every parent instantly — pinned, targeted, tracked.' },
  { icon: HeartHandshake, color: '#0891B2', bg: '#E0F2FE', title: 'Parent Portal', text: 'Invite parents, link accounts — they see only their child.' },
];

const STEPS = [
  { emoji: '🏫', title: 'Open your school', text: 'Sign up in a minute — your school gets its own private workspace.' },
  { emoji: '✉️', title: 'Invite your people', text: 'Teachers join as Teachers, parents join as Parents. Roles keep everyone in their lane.' },
  { emoji: '🌈', title: 'Run happy days', text: 'Attendance, fees, events & safe pickups — the whole day, sorted.' },
];

function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[#1E1B2E]/5 bg-[#FFF9F1]/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0B13]/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#4ADE80] to-[#22C55E] text-white shadow-lg shadow-green-500/25">
            <Sprout size={20} />
          </span>
          <span className="text-[17px] font-black tracking-tight text-[#1E1B2E] dark:text-white">
            Little Sprouts
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-[13.5px] font-bold text-[#6B6580] md:flex dark:text-white/70">
          <a href="#features" className="transition hover:text-[#1E1B2E] dark:hover:text-white">Features</a>
          <a href="#how" className="transition hover:text-[#1E1B2E] dark:hover:text-white">How it works</a>
          <a href="#safety" className="transition hover:text-[#1E1B2E] dark:hover:text-white">Safety</a>
          <a href="#pricing" className="transition hover:text-[#1E1B2E] dark:hover:text-white">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full px-4 py-2.5 text-[13.5px] font-black text-[#1E1B2E] transition hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="group rounded-full bg-[#1E1B2E] px-5 py-2.5 text-[13.5px] font-black text-white shadow-xl transition hover:scale-[1.03] hover:bg-black dark:bg-white dark:text-[#1E1B2E]"
          >
            Start free
            <ArrowRight size={14} className="ml-1 inline transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function LandingPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace('/home');
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FFF9F1] dark:bg-[#0B0B13]">
        <motion.span
          className="grid h-16 w-16 place-items-center rounded-[22px] bg-gradient-to-br from-[#4ADE80] to-[#22C55E] text-white"
          animate={{ scale: [1, 1.12, 1], rotate: [0, 6, -6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sprout size={30} />
        </motion.span>
      </div>
    );
  }
  if (user) return null;

  return (
    <div className="min-h-screen overflow-x-clip bg-[#FFF9F1] text-[#1E1B2E] dark:bg-[#0B0B13] dark:text-white">
      <LandingNav />

      {/* ============================ HERO ============================ */}
      <section className="relative px-4 pt-28 md:px-6 md:pt-36">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-24 left-1/2 h-96 w-[52rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#FFE4EC] via-[#FFF4CC] to-[#E4EBFF] opacity-70 blur-3xl dark:opacity-20" />
          <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(#1E1B2E22_1.5px,transparent_1.5px)] [background-size:26px_26px] dark:opacity-20 dark:[background-image:radial-gradient(#ffffff22_1.5px,transparent_1.5px)]" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div>
            <motion.p
              variants={rise} initial="hidden" animate="show" custom={0}
              className="inline-flex items-center gap-2 rounded-full border border-[#1E1B2E]/10 bg-white px-4 py-2 text-[12px] font-black uppercase tracking-widest text-[#B45309] shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-[#FFC46B]"
            >
              <motion.span animate={{ rotate: [0, 14, -14, 0] }} transition={{ duration: 2, repeat: Infinity }}>👋</motion.span>
              Preschool management, minus the paperwork
            </motion.p>
            <motion.h1
              variants={rise} initial="hidden" animate="show" custom={0.08}
              className="mt-5 text-[42px] font-black leading-[1.02] tracking-tight md:text-[64px]"
            >
              Where little minds{' '}
              <span className="relative inline-block">
                <span className="relative z-10 bg-gradient-to-r from-[#FF8FB1] via-[#FB923C] to-[#7C9DFF] bg-clip-text text-transparent">
                  bloom
                </span>
                <svg viewBox="0 0 220 14" className="absolute -bottom-1 left-0 z-0 w-full" aria-hidden="true">
                  <motion.path
                    d="M4 10 Q 60 2 110 8 T 216 6"
                    fill="none" stroke="#4ADE80" strokeWidth="6" strokeLinecap="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.7 }}
                  />
                </svg>
              </span>{' '}
              🌱
            </motion.h1>
            <motion.p
              variants={rise} initial="hidden" animate="show" custom={0.16}
              className="mt-5 max-w-lg text-[16px] font-medium leading-relaxed text-[#6B6580] dark:text-white/70"
            >
              Attendance, fees, teachers, events, pickup safety & parent updates —
              everything your preschool needs, wrapped in one joyful app.
            </motion.p>
            <motion.div variants={rise} initial="hidden" animate="show" custom={0.24} className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="group rounded-full bg-[#1E1B2E] px-7 py-3.5 text-[15px] font-black text-white shadow-2xl transition hover:scale-[1.04] dark:bg-white dark:text-[#1E1B2E]"
              >
                Open your school — it&apos;s free
                <ArrowRight size={16} className="ml-2 inline transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/login"
                className="rounded-full border-2 border-[#1E1B2E]/10 bg-white px-7 py-3.5 text-[15px] font-black transition hover:border-[#1E1B2E]/25 dark:border-white/15 dark:bg-white/5"
              >
                Log in →
              </Link>
            </motion.div>
            <motion.div
              variants={rise} initial="hidden" animate="show" custom={0.32}
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] font-bold text-[#6B6580] dark:text-white/60"
            >
              {['No credit card', 'Your data stays yours', 'Parents love it'].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[#4ADE80]/20 text-[#16A34A]"><Check size={12} strokeWidth={3} /></span>
                  {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Animated school scene */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
            className="relative mx-auto w-full max-w-[520px]"
          >
            <div className="relative overflow-hidden rounded-[32px] border-4 border-white bg-gradient-to-b from-[#BFE3FF] via-[#DFF1FF] to-[#EAFBEF] shadow-2xl dark:border-white/10 dark:from-[#16233B] dark:via-[#131C30] dark:to-[#12241A]">
              <Sun className="absolute left-6 top-6 h-20 w-20" />
              <Cloud className="absolute right-10 top-8" delay={1} />
              <Cloud className="absolute left-24 top-20" delay={3} wide />
              <Twinkle className="left-1/3 top-10" />
              <Twinkle className="right-1/4 top-24" delay={1.2} />
              <motion.div {...floaty(0, 8)}>
                <Schoolhouse className="mx-auto mt-16 w-[78%]" />
              </motion.div>
              {/* floating app cards */}
              <motion.div
                {...floaty(0.6)}
                className="absolute left-3 top-[46%] rounded-2xl border border-[#1E1B2E]/5 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#1B1B2C]/95"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-[#8A84A0]">Today · Nursery</p>
                <div className="mt-1.5 flex gap-1">
                  {['#4ADE80', '#4ADE80', '#4ADE80', '#FACC15', '#E5E7EB'].map((c, i) => (
                    <motion.span
                      key={i}
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: c }}
                      animate={{ scale: [1, 1.25, 1] }}
                      transition={{ duration: 1.8, delay: i * 0.18, repeat: Infinity }}
                    />
                  ))}
                </div>
                <p className="mt-1 text-[11px] font-black">18/20 little sprouts in 🌈</p>
              </motion.div>
              <motion.div
                {...floaty(1.8)}
                className="absolute bottom-6 right-3 rounded-2xl bg-[#1E1B2E] px-3.5 py-2.5 text-white shadow-xl dark:bg-white dark:text-[#1E1B2E]"
              >
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Fees collected</p>
                <motion.p
                  className="text-[15px] font-black"
                  animate={{ opacity: [0.75, 1, 0.75] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                >
                  ₹42,500 ✓
                </motion.p>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* marquee */}
        <div className="relative mx-auto mt-14 max-w-6xl overflow-hidden rounded-full border border-[#1E1B2E]/8 bg-white/70 py-3 backdrop-blur dark:border-white/10 dark:bg-white/5">
          <motion.div
            className="flex w-max items-center gap-8 whitespace-nowrap pr-8 text-[13px] font-black text-[#6B6580] dark:text-white/60"
            animate={{ x: ['0%', '-50%'] }}
            transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
          >
            {[0, 1].map((half) => (
              <div key={half} className="flex items-center gap-8" aria-hidden={half === 1}>
                {['🎒 Admissions', '🕘 Attendance', '💰 Fees', '🚌 Bus routes', '🎉 Events', '📢 Announcements', '🛡️ Safe pickup', '💸 Payroll', '🗓️ Timetable', '👪 Parent portal'].map((t) => (
                  <span key={`${half}-${t}`}>{t}</span>
                ))}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============================ FEATURES ============================ */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24 md:px-6">
        <motion.div variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} className="text-center">
          <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#7C9DFF]">✨ Everything included</p>
          <h2 className="mx-auto mt-3 max-w-xl text-[32px] font-black tracking-tight md:text-[44px]">
            One app for the whole school day
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] font-medium text-[#6B6580] dark:text-white/65">
            From morning roll-call to evening pickup — teachers, parents and admins finally look at the same page.
          </p>
        </motion.div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              variants={rise} initial="hidden" whileInView="show" custom={(i % 4) * 0.08}
              viewport={{ once: true, margin: '-60px' }}
              whileHover={{ y: -6, rotate: i % 2 === 0 ? -0.6 : 0.6 }}
              className="group rounded-[26px] border border-[#1E1B2E]/8 bg-white p-5 shadow-sm transition-shadow hover:shadow-xl dark:border-white/10 dark:bg-[#161624]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl transition-transform group-hover:scale-110 group-hover:-rotate-6" style={{ background: f.bg, color: f.color }}>
                <f.icon size={22} />
              </span>
              <p className="mt-4 text-[16px] font-black">{f.title}</p>
              <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-[#6B6580] dark:text-white/60">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============================ HOW IT WORKS ============================ */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24 md:px-6">
        <motion.div variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} className="text-center">
          <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#FB923C]">🚀 Up & running today</p>
          <h2 className="mx-auto mt-3 max-w-xl text-[32px] font-black tracking-tight md:text-[44px]">
            Live before lunch break
          </h2>
        </motion.div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              variants={rise} initial="hidden" whileInView="show" custom={i * 0.1}
              viewport={{ once: true, margin: '-60px' }}
              className="relative overflow-hidden rounded-[26px] bg-[#1E1B2E] p-6 text-white dark:bg-[#161624] dark:border dark:border-white/10"
            >
              <span className="absolute -right-4 -top-7 select-none text-[110px] font-black text-white/5">{i + 1}</span>
              <motion.span
                className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-3xl"
                animate={{ rotate: [0, -8, 8, 0] }}
                transition={{ duration: 3, delay: i * 0.5, repeat: Infinity }}
              >
                {s.emoji}
              </motion.span>
              <p className="mt-4 text-[12px] font-black uppercase tracking-widest text-white/50">Step {i + 1}</p>
              <p className="mt-1 text-[18px] font-black">{s.title}</p>
              <p className="mt-2 text-[14px] font-medium leading-relaxed text-white/65">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============================ SAFETY ============================ */}
      <section id="safety" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24 md:px-6">
        <motion.div
          variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}
          className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#16A34A] via-[#0D9488] to-[#0369A1] p-8 text-white md:p-12"
        >
          <Cloud className="absolute -top-2 right-16 opacity-40" delay={2} />
          <div className="relative grid items-center gap-8 md:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-[12px] font-black uppercase tracking-widest">
                <ShieldCheck size={14} /> Safety first, always
              </p>
              <h2 className="mt-4 text-[30px] font-black leading-tight tracking-tight md:text-[40px]">
                Pickup time without the panic
              </h2>
              <p className="mt-3 max-w-md text-[15px] font-medium text-white/80">
                Only verified grown-ups take kids home. Every handover is PIN-checked and logged — visible to admins instantly.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  { icon: KeyRound, title: 'Pickup PINs', text: 'Contacts verify with a secret PIN at the gate.' },
                  { icon: Bus, title: 'Bus routes & stops', text: 'Routes, drivers and pickup times in one place.' },
                  { icon: ShieldCheck, title: 'Incident log', text: 'Bumps, allergies & health notes — recorded with care.' },
                ].map((row, i) => (
                  <motion.div
                    key={row.title}
                    variants={rise} initial="hidden" whileInView="show" custom={i * 0.08}
                    viewport={{ once: true }}
                    className="flex items-start gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15"><row.icon size={18} /></span>
                    <span>
                      <span className="block text-[15px] font-black">{row.title}</span>
                      <span className="block text-[13px] font-medium text-white/70">{row.text}</span>
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
            <motion.div {...floaty(0.8, 10)} className="mx-auto w-full max-w-sm rounded-[26px] bg-white p-5 text-[#1E1B2E] shadow-2xl">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#8A84A0]">🔑 Pickup verification</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#E4EBFF] text-2xl">🦋</span>
                <div>
                  <p className="text-[15px] font-black">Hrithika · Nursery</p>
                  <p className="text-[12px] font-bold text-[#8A84A0]">with Priya (aunt) · 12:04 PM</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {['1', '2', '3', '•'].map((d) => (
                  <span key={d} className="grid h-11 flex-1 place-items-center rounded-xl bg-[#F6F0E6] text-[16px] font-black">{d}</span>
                ))}
              </div>
              <motion.p
                className="mt-3 rounded-xl bg-[#DFF7E5] px-3 py-2.5 text-center text-[13px] font-black text-[#15803D]"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                ✓ Verified — have a lovely evening!
              </motion.p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ============================ ROLES ============================ */}
      <section id="roles" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24 md:px-6">
        <motion.div variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} className="text-center">
          <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#C084FC]">👪 Made for everyone</p>
          <h2 className="mx-auto mt-3 max-w-xl text-[32px] font-black tracking-tight md:text-[44px]">
            The right view for every grown-up
          </h2>
        </motion.div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { emoji: '👩‍💼', role: 'Admins', color: '#7C9DFF', bg: '#E4EBFF', points: ['Whole-school dashboard', 'Fees, payroll & reports', 'Invite & manage roles'] },
            { emoji: '👩‍🏫', role: 'Teachers', color: '#16A34A', bg: '#DFF7E5', points: ['My classes & timetable', 'One-tap attendance', 'Leave requests'] },
            { emoji: '👨‍👩‍👧', role: 'Parents', color: '#DB2777', bg: '#FCE7F3', points: ['Only my child’s updates', 'Pay fees & see events', 'Pickup & bus info'] },
          ].map((r, i) => (
            <motion.div
              key={r.role}
              variants={rise} initial="hidden" whileInView="show" custom={i * 0.1}
              viewport={{ once: true, margin: '-60px' }}
              whileHover={{ y: -6 }}
              className="rounded-[26px] border border-[#1E1B2E]/8 bg-white p-6 dark:border-white/10 dark:bg-[#161624]"
            >
              <motion.span
                className="grid h-14 w-14 place-items-center rounded-2xl text-3xl"
                style={{ background: r.bg }}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, delay: i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                {r.emoji}
              </motion.span>
              <p className="mt-4 text-[20px] font-black">{r.role}</p>
              <ul className="mt-3 space-y-2">
                {r.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[13.5px] font-bold text-[#6B6580] dark:text-white/65">
                    <Check size={15} strokeWidth={3} style={{ color: r.color }} className="mt-0.5 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============================ PRICING ============================ */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24 md:px-6">
        <motion.div variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} className="text-center">
          <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#0D9488]">💎 Simple pricing</p>
          <h2 className="mx-auto mt-3 max-w-xl text-[32px] font-black tracking-tight md:text-[44px]">
            Start free, grow when you do
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] font-medium text-[#6B6580] dark:text-white/65">
            Prices in INR. Change or cancel anytime — your data stays yours.
          </p>
        </motion.div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { name: 'Starter', price: 'Free', per: 'forever', tag: 'For getting started', color: '#4ADE80', bg: '#DFF7E5', points: ['Up to 50 students', 'Attendance & events', 'Parent portal'], cta: 'Start free' },
            { name: 'Pro', price: '₹999', per: '/month', tag: 'For growing schools', color: '#7C9DFF', bg: '#E4EBFF', points: ['Up to 500 students', 'Fees, safety suite & payroll', 'Reports & audit log'], cta: 'Go Pro', star: true },
            { name: 'Enterprise', price: 'Custom', per: 'quote', tag: 'For groups & chains', color: '#C084FC', bg: '#F3E8FF', points: ['Unlimited everything', 'Priority support', 'Onboarding help'], cta: 'Talk to us' },
          ].map((t, i) => (
            <motion.div
              key={t.name}
              variants={rise} initial="hidden" whileInView="show" custom={i * 0.1}
              viewport={{ once: true, margin: '-60px' }}
              whileHover={{ y: -6 }}
              className={`relative rounded-[26px] border bg-white p-6 dark:bg-[#161624] ${t.star ? 'border-2 !border-[#7C9DFF] shadow-xl' : 'border-[#1E1B2E]/8 dark:border-white/10'}`}
            >
              {t.star && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#7C9DFF] px-4 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                  Most loved
                </span>
              )}
              <span className="grid h-11 w-11 place-items-center rounded-2xl text-lg font-black text-white" style={{ background: t.color }}>
                {t.name.charAt(0)}
              </span>
              <p className="mt-3 text-[18px] font-black">{t.name}</p>
              <p className="text-[12px] font-bold text-[#8A84A0]">{t.tag}</p>
              <p className="mt-2 text-[34px] font-black tracking-tight">
                {t.price}
                <span className="text-[13px] font-bold text-[#8A84A0]"> {t.per}</span>
              </p>
              <ul className="mt-4 space-y-2">
                {t.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[13px] font-bold text-[#6B6580] dark:text-white/65">
                    <Check size={15} strokeWidth={3} style={{ color: t.color }} className="mt-0.5 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-6 block rounded-full py-3 text-center text-[14px] font-black transition hover:scale-[1.02] ${t.star ? 'bg-[#1E1B2E] text-white dark:bg-white dark:text-[#1E1B2E]' : 'bg-black/[0.05] dark:bg-white/10'}`}
              >
                {t.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============================ CTA ============================ */}
      <section className="mx-auto max-w-6xl px-4 pt-24 md:px-6">
        <motion.div
          variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}
          className="relative overflow-hidden rounded-[32px] bg-[#1E1B2E] px-6 py-14 text-center text-white md:py-20 dark:bg-[#161624] dark:border dark:border-white/10"
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[#FF8FB1]/30 blur-3xl" />
            <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-[#7C9DFF]/30 blur-3xl" />
            <div className="absolute left-1/4 top-8 text-2xl opacity-60">🎈</div>
            <div className="absolute bottom-10 right-1/4 text-2xl opacity-60">🧸</div>
          </div>
          <motion.div
            className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-gradient-to-br from-[#4ADE80] to-[#22C55E] text-white shadow-xl"
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <Sprout size={30} />
          </motion.div>
          <h2 className="mx-auto mt-6 max-w-xl text-[30px] font-black tracking-tight md:text-[44px]">
            Ready for happier school days?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] font-medium text-white/65">
            Join Little Sprouts today — set up your school in minutes, invite your people, and watch the magic happen. 🌱
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="group rounded-full bg-white px-8 py-4 text-[15px] font-black text-[#1E1B2E] shadow-2xl transition hover:scale-[1.04]"
            >
              Start free today
              <ArrowRight size={16} className="ml-2 inline transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/login"
              className="rounded-full border-2 border-white/20 px-8 py-4 text-[15px] font-black text-white transition hover:border-white/50 hover:bg-white/5"
            >
              Log in →
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ============================ FOOTER ============================ */}
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-14 md:px-6">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#1E1B2E]/8 pt-8 md:flex-row dark:border-white/10">
          <span className="flex items-center gap-2 text-[14px] font-black">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#4ADE80] to-[#22C55E] text-white">
              <Sprout size={16} />
            </span>
            Little Sprouts
          </span>
          <nav className="flex items-center gap-5 text-[13px] font-bold text-[#6B6580] dark:text-white/60">
            <a href="#features" className="transition hover:text-[#1E1B2E] dark:hover:text-white">Features</a>
            <a href="#safety" className="transition hover:text-[#1E1B2E] dark:hover:text-white">Safety</a>
            <Link href="/login" className="transition hover:text-[#1E1B2E] dark:hover:text-white">Log in</Link>
            <Link href="/signup" className="transition hover:text-[#1E1B2E] dark:hover:text-white">Sign up</Link>
          </nav>
          <p className="text-[12px] font-semibold text-[#9A93B0]">Made with 💛 for little learners</p>
        </div>
      </footer>
    </div>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Users, ClipboardCheck, Wallet, Menu, X,
  CalendarHeart, GraduationCap, Sprout, Megaphone, Building2, Settings, LogOut,
  BarChart3, UserPlus, HeartHandshake, SlidersHorizontal, ShieldCheck, Briefcase,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth';

const TABS = [
  { href: '/home', label: 'Home', icon: LayoutDashboard },
  { href: '/students', label: 'Kids', icon: Users },
  { href: '/attendance', label: 'Attend', icon: ClipboardCheck },
  { href: '/fees', label: 'Fees', icon: Wallet },
];

const MORE = [
  { href: '/events', label: 'Events', icon: CalendarHeart, color: '#F472B6' },
  { href: '/teachers', label: 'Teachers', icon: GraduationCap, color: '#C084FC' },
  { href: '/classes', label: 'Classes', icon: Sprout, color: '#FB923C' },
  { href: '/messages', label: 'Announcements', icon: Megaphone, color: '#FACC15' },
  { href: '/reports', label: 'Reports', icon: BarChart3, color: '#F59E0B' },
  { href: '/admissions', label: 'Admissions', icon: UserPlus, color: '#FB7185' },
  { href: '/portal', label: 'Parent Portal', icon: HeartHandshake, color: '#2DD4BF' },
  { href: '/safety', label: 'Safety', icon: ShieldCheck, color: '#34D399' },
  { href: '/staff', label: 'Staff', icon: Briefcase, color: '#FBBF24' },
  { href: '/tenants', label: 'Schools', icon: Building2, color: '#A78BFA', admin: true },
  { href: '/options', label: 'Options', icon: SlidersHorizontal, color: '#38BDF8', admin: true },
  { href: '/settings', label: 'Settings', icon: Settings, color: '#94A3B8', admin: true },
];

const PARENT_MORE = new Set(['/events', '/messages', '/portal']);

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, tenant } = useAuth();
  const [sheet, setSheet] = useState(false);
  const role = tenant?.role;
  const more = MORE.filter((m) => {
    if (role === 'Parent') return PARENT_MORE.has(m.href);
    if (role !== 'Admin' && (m as { admin?: boolean }).admin) return false;
    return true;
  });

  return (
    <>
      <nav
        aria-label="Primary"
        className="glass fixed bottom-0 left-0 right-0 z-40 border-t border-[#F1E6D8] px-2 pt-2 md:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-5 gap-1">
          {TABS.map((t) => {
            const active = pathname === t.href;
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center gap-1 rounded-2xl py-2"
              >
                {active && (
                  <motion.span
                    layoutId="mobile-tab"
                    className="absolute inset-0 rounded-2xl bg-[#1E1B2E]/6 dark:bg-white/10"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon size={20} className={clsx('relative', active ? 'text-[#1E1B2E] dark:text-white' : 'text-[#9A93B0]')} />
                <span className={clsx('relative text-[10px] font-black', active ? 'text-[#1E1B2E] dark:text-white' : 'text-[#9A93B0]')}>
                  {t.label}
                </span>
                {active && <span className="relative h-1 w-1 rounded-full bg-[#FF8FB1]" />}
              </Link>
            );
          })}
          <button
            onClick={() => setSheet(true)}
            aria-label="Open full menu"
            className="relative flex flex-col items-center gap-1 rounded-2xl py-2 cursor-pointer"
          >
            <Menu size={20} className="text-[#9A93B0]" />
            <span className="text-[10px] font-black text-[#9A93B0]">More</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {sheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheet(false)}
            className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm md:hidden"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Full menu"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 rounded-t-[28px] bg-white p-5 dark:bg-[#14141f]"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-black/10 dark:bg-white/15" />
              <div className="mb-3 flex items-center justify-between">
                <p className="font-black text-[15px]">Hello, {user?.name?.split(' ')[0] ?? 'there'} 👋</p>
                <button onClick={() => setSheet(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10 cursor-pointer">
                  <X size={17} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {more.map((m) => {
                  const Icon = m.icon;
                  const active = pathname === m.href;
                  return (
                    <Link
                      key={m.href}
                      href={m.href}
                      onClick={() => setSheet(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex flex-col items-center gap-2 rounded-2xl border p-4 ${active ? 'border-[#7C9DFF] bg-[#7C9DFF]/10' : 'border-[#F1E6D8] dark:border-white/10'}`}
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-2xl text-white" style={{ background: m.color }}>
                        <Icon size={19} />
                      </span>
                      <span className="text-[11px] font-black text-center leading-tight">{m.label}</span>
                    </Link>
                  );
                })}
              </div>
              <button
                onClick={() => { logout(); setSheet(false); router.push('/login'); }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FFE4E6] py-3 text-[13px] font-black text-[#B91C1C] cursor-pointer"
              >
                <LogOut size={15} /> Log out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

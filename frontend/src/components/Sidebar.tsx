'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, ClipboardCheck, Wallet, CalendarHeart,
  GraduationCap, Megaphone, Settings, Sprout, ChevronLeft, ChevronRight, ChevronDown, LogOut,
  Building2, Check, ChevronsUpDown, BarChart3, UserPlus, HeartHandshake, SlidersHorizontal,
  ShieldCheck, Briefcase, CreditCard,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { useDB } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/auth';

interface NavLink { href: string; label: string; icon: typeof LayoutDashboard; color: string; roles?: Role[] }

const PRIMARY: NavLink[] = [
  { href: '/home', label: 'Dashboard', icon: LayoutDashboard, color: '#FF8FB1' },
  { href: '/students', label: 'Students', icon: Users, color: '#7C9DFF' },
  { href: '/attendance', label: 'Attendance', icon: ClipboardCheck, color: '#4ADE80' },
  { href: '/fees', label: 'Fees & Billing', icon: Wallet, color: '#2DD4BF' },
  { href: '/events', label: 'Events', icon: CalendarHeart, color: '#F472B6' },
  { href: '/messages', label: 'Announcements', icon: Megaphone, color: '#FACC15' },
];

const GROUPS: { title: string; items: NavLink[] }[] = [
  {
    title: 'Manage',
    items: [
      { href: '/admissions', label: 'Admissions', icon: UserPlus, color: '#FB7185' },
      { href: '/teachers', label: 'Teachers', icon: GraduationCap, color: '#C084FC' },
      { href: '/classes', label: 'Classes', icon: Sprout, color: '#FB923C' },
      { href: '/reports', label: 'Reports', icon: BarChart3, color: '#F59E0B' },
      { href: '/safety', label: 'Safety & Transport', icon: ShieldCheck, color: '#34D399' },
      { href: '/staff', label: 'Staff & Payroll', icon: Briefcase, color: '#FBBF24' },
      { href: '/portal', label: 'Parent Portal', icon: HeartHandshake, color: '#2DD4BF' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/tenants', label: 'Schools', icon: Building2, color: '#A78BFA', roles: ['Admin'] },
      { href: '/billing', label: 'Billing', icon: CreditCard, color: '#EAB308', roles: ['Admin'] },
      { href: '/options', label: 'Options & Masters', icon: SlidersHorizontal, color: '#38BDF8', roles: ['Admin'] },
      { href: '/settings', label: 'Settings', icon: Settings, color: '#94A3B8', roles: ['Admin'] },
    ],
  },
];

const GROUPS_KEY = 'sprouts_nav_groups';

function visible<T extends { href: string; roles?: Role[] }>(items: T[], role: Role | undefined): T[] {
  if (!role) return items;
  if (role === 'Admin') return items;
  if (role === 'Parent') {
    // Parents get a trimmed daily-only nav; raw ops pages are hidden.
    const allowed = new Set(['/home', '/fees', '/events', '/messages', '/portal']);
    return items.filter((l) => allowed.has(l.href));
  }
  // Teacher: everything except Admin-only system pages.
  return items.filter((l) => !l.roles || l.roles.includes(role));
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const { db } = useDB();
  const { user, logout, tenant, tenants, switchTenant } = useAuth();
  const [switchOpen, setSwitchOpen] = useState(false);
  const role = tenant?.role;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Manage: true, System: false });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional group prefs hydration after mount
      if (raw) setOpenGroups((p) => ({ ...p, ...(JSON.parse(raw) as Record<string, boolean>) }));
    } catch {}
  }, []);

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const renderLink = (l: NavLink) => {
    const active = pathname === l.href;
    const Icon = l.icon;
    return (
      <Link key={l.href} href={l.href}>
        <motion.div
          whileTap={{ scale: 0.97 }}
          title={collapsed ? l.label : undefined}
          className={clsx(
            'relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] font-bold transition',
            collapsed && 'justify-center gap-0 px-0',
            active ? 'text-white' : 'text-white/55 hover:text-white hover:bg-white/5'
          )}
        >
          {active && (
            <motion.div
              layoutId="nav-pill"
              className="absolute inset-0 rounded-2xl bg-white/12 border border-white/10 shadow-inner"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <span
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: active ? l.color : 'rgba(255,255,255,0.07)' }}
          >
            <Icon size={17} strokeWidth={2.4} />
          </span>
          {!collapsed && <span className="relative">{l.label}</span>}
        </motion.div>
      </Link>
    );
  };

  const primary = visible(PRIMARY, role);

  return (
    <aside
      style={{ width: collapsed ? 88 : 264 }}
      className={clsx('sticky top-0 hidden h-screen shrink-0 flex-col md:flex', collapsed ? 'p-2' : 'p-4')}
    >
      <div className={clsx('flex h-full flex-col rounded-[28px] bg-[#1E1B2E] text-white overflow-hidden relative dark:bg-[#10101A] dark:border dark:border-white/10 dark:shadow-[0_0_50px_-12px_rgba(124,157,255,0.25)]', collapsed ? 'p-2' : 'p-4')}>
        <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-gradient-to-br from-pink-400/30 to-indigo-400/30 blur-2xl" />
        <div className="relative">
          <div className={clsx('flex items-center gap-3 px-1', collapsed && 'justify-center px-0')}>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#FF8FB1] to-[#FFC46B] text-2xl shadow-lg">
              🌱
            </div>
            {!collapsed && (
              <button onClick={() => setSwitchOpen((o) => !o)} className="min-w-0 flex-1 text-left cursor-pointer group rounded-xl">
                <p className="truncate text-[16px] font-black leading-tight">{tenant?.name ?? db.profile.name}</p>
                <p className="flex items-center gap-1 truncate text-[11px] font-bold text-white/60 group-hover:text-white/90">
                  {tenant?.plan ?? 'School'} plan · {tenants.length} schools <ChevronsUpDown size={11} />
                </p>
              </button>
            )}
          </div>

          <AnimatePresence>
            {switchOpen && !collapsed && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#26263a] shadow-2xl"
              >
                <p className="px-3.5 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-white/40">Switch school</p>
                <div className="max-h-56 overflow-y-auto p-1.5">
                  {tenants.map((t) => {
                    const active = t.id === tenant?.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          switchTenant(t.slug);
                          setSwitchOpen(false);
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left cursor-pointer transition ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#FF8FB1]/40 to-[#7C9DFF]/40 text-sm font-black">
                          {t.name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-extrabold">{t.name}</span>
                          <span className="block truncate text-[10.5px] font-bold text-white/50">{t.plan} · {t.demo ? 'demo' : 'yours'}</span>
                        </span>
                        {active && <Check size={15} className="shrink-0 text-[#4ADE80]" />}
                      </button>
                    );
                  })}
                </div>
                <Link href="/tenants" onClick={() => setSwitchOpen(false)} className="block border-t border-white/10 px-3.5 py-2.5 text-[12px] font-black text-white/70 hover:text-white hover:bg-white/5">
                  🏫 Manage schools →
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="mt-6 flex-1 space-y-1 overflow-y-auto no-scrollbar">
          {primary.map(renderLink)}
          {GROUPS.map((g) => {
            const items = visible(g.items, role);
            if (items.length === 0) return null;
            const open = collapsed ? false : (openGroups[g.title] ?? false);
            return (
              <div key={g.title} className="pt-2">
                {!collapsed && (
                  <button
                    onClick={() => toggleGroup(g.title)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 cursor-pointer"
                  >
                    <span>{g.title}</span>
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                )}
                {(collapsed || open) && <div className="space-y-1">{items.map(renderLink)}</div>}
              </div>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="relative rounded-2xl bg-gradient-to-br from-[#FF8FB1] to-[#7C9DFF] p-4 mt-3">
            <p className="text-[13px] font-black">✨ Admissions open!</p>
            <p className="text-[12px] text-white/85 font-medium mt-1">2026–27 batch · {db.students.filter(s=>s.status==='waitlist').length} on waitlist</p>
            <Link href="/students" className="mt-3 block rounded-xl bg-white/95 text-center text-[12px] font-black text-[#1E1B2E] py-2 hover:bg-white">
              Review applications
            </Link>
          </div>
        )}

        {!collapsed && user && (
          <div className="relative mt-3 flex items-center gap-2.5 rounded-2xl bg-white/6 border border-white/10 p-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-200 to-pink-300 text-[15px] font-black text-[#1E1B2E]">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[12.5px] font-black">{user.name}</p>
              <p className="truncate text-[10.5px] font-bold text-white/55">{tenant?.role ?? '—'}</p>
            </div>
            <button
              onClick={() => { logout(); router.push('/login'); }}
              title="Log out"
              aria-label="Log out"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10 text-white/70 hover:bg-[#FF5C8A] hover:text-white transition cursor-pointer"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="mx-auto mt-3 grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}

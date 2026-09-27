'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Command, Moon, Search, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDB, getInvoiceNumber } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/components/ThemeProvider';
import { buildNotices } from '@/lib/notifications';

export default function Topbar() {
  const { db } = useDB();
  const { user, tenant } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [bell, setBell] = useState(false);
  const router = useRouter();

  const qLower = q.trim().toLowerCase();
  const results = qLower
    ? db.students.filter((s) => s.name.toLowerCase().includes(qLower) || s.parent.toLowerCase().includes(qLower)).slice(0, 6)
    : [];
  // Invoice hits (title / id / server number) go to /fees; kid/parent hits go to /students.
  const invoiceResults = qLower
    ? db.invoices
        .filter(
          (i) =>
            i.title.toLowerCase().includes(qLower) ||
            i.id.toLowerCase().includes(qLower) ||
            (getInvoiceNumber(i.id)?.toLowerCase().includes(qLower) ?? false)
        )
        .slice(0, 4)
    : [];

  const goFirst = () => {
    setOpen(false);
    if (invoiceResults.length > 0 && results.length === 0) router.push('/fees');
    else router.push(results.length > 0 ? '/students' : '/fees');
  };

  const notices = buildNotices(db);

  // ⌘K / Ctrl+K actually opens search now
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="sticky top-3 z-30">
        <div className="glass flex items-center gap-3 rounded-[22px] border border-white/60 border-[#F1E6D8] px-4 py-3 shadow-[0_10px_40px_-15px_rgba(30,27,46,0.25)]">
          <Link href="/home" aria-label="Little Sprouts home" className="md:hidden grid h-10 w-10 place-items-center rounded-2xl bg-[#1E1B2E] text-xl">🌱</Link>
          <button
            onClick={() => setOpen(true)}
            aria-label="Search students and parents"
            className="flex flex-1 items-center gap-3 rounded-2xl bg-white border border-[#F1E6D8] px-4 py-2.5 text-left cursor-pointer hover:border-[#7C9DFF] transition"
          >
            <Search size={16} className="shrink-0 text-[#9A93B0]" />
            <span className="hidden truncate text-sm font-medium text-[#9A93B0] min-[420px]:block">Search kids, parents, invoices…</span>
            <kbd className="ml-auto hidden sm:flex items-center gap-1 rounded-lg bg-[#F6F0E6] px-2 py-1 text-[11px] font-bold text-[#8A84A0]">
              <Command size={12} />K
            </kbd>
          </button>
          <motion.button
            onClick={toggle}
            aria-label="Toggle light / dark mode"
            whileTap={{ scale: 0.88, rotate: -10 }}
            className="grid h-11 w-11 place-items-center rounded-2xl bg-white border border-[#F1E6D8] cursor-pointer hover:scale-105 transition overflow-hidden"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ y: 14, opacity: 0, rotate: -90 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: -14, opacity: 0, rotate: 90 }}
                transition={{ duration: 0.22 }}
                className="grid place-items-center"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <div className="relative">
            <button
              onClick={() => setBell((b) => !b)}
              aria-label={`Notifications${notices.length > 0 ? `, ${notices.length} new` : ', all clear'}`}
              aria-expanded={bell}
              className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white border border-[#F1E6D8] cursor-pointer hover:scale-105 transition"
            >
              <Bell size={18} />
              {notices.length > 0 && (
                <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#FF5C8A] px-1 text-[10px] font-black text-white">
                  {notices.length}
                </span>
              )}
            </button>
            <AnimatePresence>
              {bell && (
                <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setBell(false)} aria-hidden="true" />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    role="dialog"
                    aria-label="Notifications"
                    className="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-[22px] border border-[#F1E6D8] bg-white shadow-2xl dark:bg-[#161624] dark:border-white/10"
                  >
                    <p className="px-4 pt-4 pb-1 text-[12px] font-black uppercase tracking-widest text-[#8A84A0]">
                      🔔 {notices.length > 0 ? `${notices.length} things need you` : 'All clear'}
                    </p>
                    <div className="max-h-80 overflow-y-auto p-2">
                      {notices.length === 0 && (
                        <p className="px-3 py-6 text-center text-[13px] font-semibold text-[#8A84A0]">
                          Nothing needs attention. Sip that chai ☕
                        </p>
                      )}
                      {notices.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => { setBell(false); router.push(n.href); }}
                          className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition"
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg" style={{ background: n.tone }}>
                            {n.emoji}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-extrabold">{n.title}</span>
                            <span className="block truncate text-[11.5px] font-semibold text-[#8A84A0]">{n.sub}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-2xl bg-[#1E1B2E] text-white pl-1.5 pr-4 py-1.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-200 to-pink-300 text-[14px] font-black text-[#1E1B2E]">
              {(user?.name ?? 'G').charAt(0).toUpperCase()}
            </div>
            <div className="leading-tight">
              <p className="max-w-[120px] truncate text-[12px] font-black">{user?.name ?? 'Guest'}</p>
              <p className="text-[10px] text-white/60 font-bold">{tenant?.role ?? '—'}</p>
            </div>
          </div>
        </div>

      </header>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm p-4 grid place-items-start justify-items-center pt-[12vh]" onClick={() => setOpen(false)}>
            <motion.div
              initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-[24px] bg-white shadow-2xl border border-[#F1E6D8]"
            >
              <div className="flex items-center gap-3 border-b border-[#F5EEDF] p-4">
                <Search size={18} className="text-[#9A93B0]" />
                <input autoFocus aria-label="Search students, parents and invoices" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') goFirst(); }} placeholder="Type a name or invoice…" className="flex-1 outline-none text-[15px] font-semibold" />
                <button onClick={() => setOpen(false)} aria-label="Close search" className="cursor-pointer"><X size={18} /></button>
              </div>
              <div className="max-h-80 overflow-auto p-2">
                {results.map((s) => (
                  <button key={s.id} onClick={() => { setOpen(false); router.push('/students'); }} className="flex w-full items-center gap-3 rounded-2xl p-3 hover:bg-[#FFF6EC] text-left cursor-pointer">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl text-xl" style={{ background: s.color }}>{s.emoji}</span>
                    <span><span className="block text-sm font-extrabold">{s.name}</span><span className="block text-xs text-[#8A84A0]">{s.parent}</span></span>
                  </button>
                ))}
                {invoiceResults.map((i) => (
                  <button key={i.id} onClick={() => { setOpen(false); router.push('/fees'); }} className="flex w-full items-center gap-3 rounded-2xl p-3 hover:bg-[#FFF6EC] text-left cursor-pointer">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl text-xl bg-[#FFF4CC]">🧾</span>
                    <span><span className="block text-sm font-extrabold">{i.title}</span><span className="block text-xs text-[#8A84A0]">{i.id} · ₹{i.amount.toLocaleString('en-IN')} · {i.status}</span></span>
                  </button>
                ))}
                {!q && <p className="p-6 text-center text-sm text-[#9A93B0]">Try “Aarav”, “Diya”, “Myra”… everything is stored locally ⚡</p>}
                {q && results.length === 0 && invoiceResults.length === 0 && <p className="p-6 text-center text-sm">No match found.</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

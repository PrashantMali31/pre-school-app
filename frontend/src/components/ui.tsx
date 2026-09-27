'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';
import React, { useEffect, useRef } from 'react';

export const spring = { type: 'spring' as const, stiffness: 260, damping: 26 };

export function Card({ className, children, delay = 0 }: { className?: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay }}
      className={clsx('rounded-[24px] bg-white border border-[#F1E6D8] shadow-[0_8px_30px_-12px_rgba(30,27,46,0.15)] dark:bg-[#161624] dark:border-white/10 dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.7)]', className)}
    >
      {children}
    </motion.div>
  );
}

export function Pill({ children, color = '#FFF0F5', text = '#1E1B2E' }: { children: React.ReactNode; color?: string; text?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold"
      style={{ background: color, color: text }}
    >
      {children}
    </span>
  );
}

export function Btn({
  children, onClick, variant = 'primary', className, type = 'button', disabled, title,
}: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'soft' | 'ghost' | 'dark'; className?: string; type?: 'button' | 'submit'; disabled?: boolean; title?: string }) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { y: -1 }}
      transition={spring}
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        variant === 'primary' && 'bg-[#1E1B2E] text-white shadow-lg shadow-black/15 hover:bg-black',
        variant === 'soft' && 'bg-[#FFF1E6] text-[#1E1B2E] hover:bg-[#FFE4CC] border border-[#F1E6D8] dark:bg-white/8 dark:text-white dark:border-white/10 dark:hover:bg-white/15',
        variant === 'ghost' && 'text-[#6B6580] hover:bg-black/5',
        variant === 'dark' && 'bg-gradient-to-br from-[#FF8FB1] to-[#7C9DFF] text-white shadow-lg shadow-pink-200',
        className
      )}
    >
      {children}
    </motion.button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-bold uppercase tracking-wider text-[#9A93B0]">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputCls =
  'w-full rounded-2xl border border-[#EDE2D3] bg-[#FFFEFB] px-4 py-2.8 py-2.5 text-sm font-medium outline-none focus:border-[#7C9DFF] focus:ring-4 focus:ring-[#7C9DFF]/15 transition placeholder:text-[#B9B2C7] dark:bg-[#1B1B2C] dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:[color-scheme:dark]';

/** Inline style to flag an invalid field (beats the base border color). */
export const errStyle = (msg?: string) => (msg ? { borderColor: '#E11D48' } : undefined);

export function Err({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-1.5 text-[12px] font-bold text-[#E11D48] dark:text-[#FDA4AF]"
    >
      {msg}
    </motion.p>
  );
}

export function Avatar({ emoji, color, size = 44, name }: { emoji: string; color: string; size?: number; name?: string }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold"
      style={{ width: size, height: size, background: color, fontSize: size * 0.5 }}
      title={name}
    >
      {emoji}
    </div>
  );
}

/** Playful illustrated empty state (pure SVG, dark-aware). */
export function EmptyArt({ className = 'w-44' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden="true">
      <circle cx="162" cy="28" r="17" className="fill-[#FFC46B]" />
      <circle cx="162" cy="28" r="24" className="fill-[#FFC46B] opacity-25" />
      <ellipse cx="52" cy="30" rx="20" ry="9" className="fill-white dark:fill-white/15" />
      <ellipse cx="70" cy="25" rx="14" ry="8" className="fill-white dark:fill-white/15" />
      <path d="M0 108 Q50 78 100 102 T200 96 V140 H0 Z" className="fill-[#DFF7E5] dark:fill-white/8" />
      <path d="M0 122 Q60 100 120 118 T200 114 V140 H0 Z" className="fill-[#4ADE80] opacity-30" />
      <rect x="96" y="52" width="8" height="46" rx="4" className="fill-[#16A34A]" />
      <path d="M100 70 Q76 66 68 46 Q92 48 100 70 Z" className="fill-[#4ADE80]" />
      <path d="M100 82 Q124 78 132 58 Q108 60 100 82 Z" className="fill-[#22C55E]" />
      <path d="M84 108 h32 l-5 22 h-22 Z" className="fill-[#FF8FB1]" />
      <circle cx="36" cy="66" r="3" className="fill-[#7C9DFF] opacity-60" />
      <circle cx="176" cy="72" r="4" className="fill-[#FF8FB1] opacity-60" />
      <circle cx="140" cy="52" r="2.5" className="fill-[#7C9DFF] opacity-50" />
    </svg>
  );
}

export function Empty({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <EmptyArt />
      </motion.div>
      <p className="mt-4 text-[16px] font-black">{title}</p>
      <p className="mt-1 max-w-xs text-sm font-medium text-[#8A84A0]">{sub}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Shimmer skeleton block (dark-aware). */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" style={style} className={clsx('skeleton rounded-2xl', className)} />;
}

/**
 * Accessible modal: Esc closes, focus is trapped + restored,
 * background scroll locks, overlay click closes.
 */
export function Modal({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const els = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const vis = Array.from(els).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (vis.length === 0) return;
      const first = vis[0];
      const last = vis[vis.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
        panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button');
      target?.focus();
    }, 80);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
      prev?.focus?.();
    };
  }, [open ]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onCloseRef.current()}
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/35 backdrop-blur-sm p-4"
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: 26, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 14, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-[28px] md:text-[34px] font-black tracking-tight leading-none">{title}</h1>
        <p className="mt-2 text-[14px] font-medium text-[#8A84A0]">{sub}</p>
      </motion.div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

/**
 * Shared pager: Prev/Next + compact page numbers (1 … current-1 current current+1 … total).
 * `page` is 1-based. Renders nothing when there is a single page. Wraps on small screens.
 */
export function Pager({ page, totalPages, onPage, small }: { page: number; totalPages: number; onPage: (p: number) => void; small?: boolean }) {
  if (totalPages <= 1) return null;
  const current = Math.min(Math.max(1, page), totalPages);
  const go = (p: number) => {
    if (p < 1 || p > totalPages || p === current) return;
    onPage(p);
  };
  const nums = new Set<number>([1, totalPages, current - 1, current, current + 1]);
  const sorted = [...nums].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const items: (number | 'gap-start' | 'gap-end')[] = [];
  if (totalPages <= 7) {
    for (let n = 1; n <= totalPages; n++) items.push(n);
  } else {
    let prev = 0;
    for (const n of sorted) {
      if (prev && n - prev > 1) items.push(prev === 1 ? 'gap-start' : 'gap-end');
      items.push(n);
      prev = n;
    }
  }
  const pad = small ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-[12px]';
  const base = `rounded-xl font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${pad}`;
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => go(current - 1)}
        disabled={current <= 1}
        aria-label="Go to previous page"
        className={`${base} bg-white border border-[#F1E6D8] dark:bg-white/8 dark:border-white/10 dark:text-white`}
      >
        ← Prev
      </button>
      {items.map((it) =>
        typeof it === 'number' ? (
          <button
            key={it}
            type="button"
            onClick={() => go(it)}
            disabled={it === current}
            aria-label={`Go to page ${it}`}
            aria-current={it === current ? 'page' : undefined}
            className={
              it === current
                ? `${base} bg-[#1E1B2E] text-white`
                : `${base} bg-white border border-[#F1E6D8] dark:bg-white/8 dark:border-white/10 dark:text-white`
            }
          >
            {it}
          </button>
        ) : (
          <span key={it} aria-hidden="true" className="px-1 text-[12px] font-black text-[#9A93B0]">
            …
          </span>
        )
      )}
      <button
        type="button"
        onClick={() => go(current + 1)}
        disabled={current >= totalPages}
        aria-label="Go to next page"
        className={`${base} bg-white border border-[#F1E6D8] dark:bg-white/8 dark:border-white/10 dark:text-white`}
      >
        Next →
      </button>
    </nav>
  );
}

/**
 * Shared delete/destructive confirmation.
 * Usage per page: `const [confirm, setConfirm] = useState<PendingConfirm | null>(null)`,
 * replace `onClick={() => doDelete(x)}` with
 * `onClick={() => setConfirm({ title, message, onConfirm: () => doDelete(x) })}`,
 * and render `<ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />`.
 * Nothing is deleted until the user presses the confirm button; Esc/overlay/Cancel aborts.
 */
export interface PendingConfirm {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({ pending, onCancel }: { pending: PendingConfirm | null; onCancel: () => void }) {
  return (
    <Modal open={!!pending} onClose={onCancel} label={pending?.title ?? 'Confirm'}>
      {pending && (
        <div className="rounded-[24px] bg-white border border-[#F1E6D8] shadow-2xl p-6 dark:bg-[#161624] dark:border-white/10">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#FFE9EF] text-[#E11D48] text-xl" aria-hidden="true">
            ⚠️
          </div>
          <p className="mt-4 text-[18px] font-black tracking-tight">{pending.title}</p>
          <p className="mt-1.5 text-sm font-medium text-[#8A84A0]">{pending.message}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Btn variant="soft" onClick={onCancel}>
              Cancel
            </Btn>
            <button
              data-autofocus
              onClick={() => {
                const c = pending;
                onCancel();
                void c.onConfirm();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold bg-[#E11D48] text-white shadow-lg shadow-red-200 hover:bg-[#BE123C] transition cursor-pointer"
            >
              {pending.confirmLabel ?? 'Delete'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

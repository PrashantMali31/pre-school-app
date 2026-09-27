import { DB } from './types';

/* Derived, always-live notifications. No backend, no read-state —
   computed straight from the tenant DB on every render. */

export interface Notice {
  id: string;
  emoji: string;
  title: string;
  sub: string;
  href: string;
  tone: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildNotices(db: DB): Notice[] {
  const out: Notice[] = [];
  const today = todayISO();

  const overdue = db.invoices.filter((i) => i.status === 'overdue');
  if (overdue.length > 0) {
    const total = overdue.reduce((a, b) => a + b.amount, 0);
    out.push({
      id: 'overdue',
      emoji: '🚨',
      title: `${overdue.length} overdue bill${overdue.length > 1 ? 's' : ''} · ₹${total.toLocaleString('en-IN')}`,
      sub: 'Send reminders before the weekend',
      href: '/fees',
      tone: '#FFE4E6',
    });
  }

  const pending = db.invoices.filter((i) => i.status === 'pending');
  if (pending.length > 0) {
    out.push({
      id: 'pending',
      emoji: '💰',
      title: `${pending.length} bill${pending.length > 1 ? 's' : ''} awaiting payment`,
      sub: `₹${pending.reduce((a, b) => a + b.amount, 0).toLocaleString('en-IN')} to collect`,
      href: '/fees',
      tone: '#FFF4CC',
    });
  }

  const waitlist = db.students.filter((s) => s.status === 'waitlist');
  if (waitlist.length > 0) {
    out.push({
      id: 'waitlist',
      emoji: '📝',
      title: `${waitlist.length} application${waitlist.length > 1 ? 's' : ''} on waitlist`,
      sub: 'Review admissions pipeline',
      href: '/admissions',
      tone: '#E4EBFF',
    });
  }

  const hasToday = db.attendance.some((a) => a.date === today);
  const activeKids = db.students.filter((s) => s.status === 'active').length;
  if (!hasToday && activeKids > 0) {
    out.push({
      id: 'attendance',
      emoji: '📋',
      title: "Today's attendance not taken yet",
      sub: `${activeKids} kids waiting to be marked`,
      href: '/attendance',
      tone: '#DFF7E5',
    });
  }

  const soon = db.events
    .filter((e) => e.date >= today && e.date <= plusDays(today, 7))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2);
  for (const e of soon) {
    out.push({
      id: `event-${e.id}`,
      emoji: '🎪',
      title: e.title,
      sub: `${e.date} · ${e.time} · ${e.location}`,
      href: '/events',
      tone: '#F3E8FF',
    });
  }

  const pinned = db.announcements.filter((a) => a.pinned).slice(0, 1);
  for (const a of pinned) {
    out.push({
      id: `note-${a.id}`,
      emoji: '📌',
      title: a.title,
      sub: a.audience,
      href: '/messages',
      tone: '#FFF1E6',
    });
  }

  return out.slice(0, 8);
}

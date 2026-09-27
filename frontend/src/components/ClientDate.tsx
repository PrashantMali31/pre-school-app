'use client';
import { useEffect, useState } from 'react';
import { dayNum, formatLong, monthShort, weekdayShort } from '@/lib/format';

/** Client-only today label — renders placeholder on server so hydration always matches. */
export function TodayLabel() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional client-only hydration after mount
    setLabel(formatLong(new Date()));
  }, []);
  return <span suppressHydrationWarning>{label ?? '…'}</span>;
}

export function DateDay({ value }: { value: string }) {
  return <span suppressHydrationWarning>{dayNum(value)}</span>;
}

export function DateMonth({ value }: { value: string }) {
  return <span suppressHydrationWarning>{monthShort(value)}</span>;
}

export function DateWeekday({ value }: { value: string }) {
  return <span suppressHydrationWarning>{weekdayShort(value)}</span>;
}

export function DateLong({ value }: { value: string }) {
  return <span suppressHydrationWarning>{formatLong(value)}</span>;
}

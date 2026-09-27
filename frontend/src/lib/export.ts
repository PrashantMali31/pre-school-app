/* Frontend-only export utilities: CSV + ICS downloads. No backend needed. */

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function esc(v: string | number | undefined | null): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  downloadFile(filename, `﻿${toCSV(headers, rows)}`, 'text/csv;charset=utf-8;');
}

function parseTime(time: string): string {
  // "10:00 AM" / "4:00 PM" / "8:30" -> "100000" / "160000" / "083000"
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(time.trim());
  if (!m) return '090000';
  let h = Number(m[1]);
  const min = m[2];
  const ap = (m[3] ?? '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}${min}00`;
}

export interface ICSEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string;
  location: string;
  description: string;
}

export function toICS(events: ICSEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Little Sprouts//Preschool OS//EN'];
  for (const e of events) {
    const dt = e.date.replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@littlesprouts.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dt}T${parseTime(e.time)}`,
      `SUMMARY:${e.title.replace(/,/g, '\\,')}`,
      `LOCATION:${(e.location || '').replace(/,/g, '\\,')}`,
      `DESCRIPTION:${(e.description || '').replace(/,/g, '\\,')}`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(filename: string, events: ICSEvent[]) {
  downloadFile(filename, toICS(events), 'text/calendar;charset=utf-8;');
}

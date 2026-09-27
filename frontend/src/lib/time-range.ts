/** Time-range helpers for class timings.
 *
 *  Storage/display format stays a human string (e.g. "9:00 – 11:30 AM",
 *  "9:00 AM – 12:00 PM") so it matches the backend TEXT column, seeds and
 *  existing cards — while the form collects structured start/end via native
 *  `<input type="time">` (24h "HH:MM").
 */

/** Convert 24h "HH:MM" to "h:MM AM/PM". Assumes valid zero-padded input. */
export function format12h(hhmm: string): string {
  const [hStr, mm] = hhmm.split(':');
  const h = Number(hStr);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${suffix}`;
}

/** Combine two 24h "HH:MM" values into a display range.
 *  Shared suffix is collapsed seed-style: ("09:00","11:30") -> "9:00 – 11:30 AM",
 *  ("09:00","12:00") -> "9:00 AM – 12:00 PM". */
export function formatTimeRange(start: string, end: string): string {
  const s = format12h(start);
  const e = format12h(end);
  if (s.slice(-2) === e.slice(-2)) return `${s.slice(0, -3)} – ${e}`;
  return `${s} – ${e}`;
}

const PART_RE = /(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?/;
const HM_RE = /^(\d{1,2})(?::(\d{2}))?$/;

function to24h(h12: number, mm: string, suffix: 'AM' | 'PM'): string | null {
  if (h12 < 1 || h12 > 12 || Number(mm) > 59) return null;
  let h = h12 % 12;
  if (suffix === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${mm}`;
}

/** Parse a legacy display range back into 24h "HH:MM" for the time inputs.
 *  Handles "9:00 – 11:30 AM", "8:30 – 1:00 PM", "9:00 AM – 12:00 PM",
 *  "09:00-12:00". Returns null when the text isn't a recognizable range
 *  (e.g. "—" or free text) so callers can leave the pickers empty. */
export function parseTimeRange(raw: string): { start: string; end: string } | null {
  const sides = raw.replace(/[—–]/g, '-').split(/\s*(?:-|to)\s*/i);
  if (sides.length !== 2) return null;
  const [sTrim, eTrim] = [sides[0].trim(), sides[1].trim()];
  const sm = sTrim.match(PART_RE);
  const em = eTrim.match(PART_RE);

  // Neither side has AM/PM — treat as 24h; roll a backwards end into PM.
  if (!sm && !em) {
    const hm = sides.map((s) => s.trim().match(/^(\d{1,2}):(\d{2})$/));
    if (!hm[0] || !hm[1]) return null;
    const [sh, sMin] = [Number(hm[0][1]), hm[0][2]];
    const eMin = hm[1][2];
    let eh = Number(hm[1][1]);
    if (sh > 23 || eh > 23 || Number(sMin) > 59 || Number(eMin) > 59) return null;
    if (eh * 60 + Number(eMin) <= sh * 60 + Number(sMin) && eh + 12 <= 23) eh += 12;
    return {
      start: `${String(sh).padStart(2, '0')}:${sMin}`,
      end: `${String(eh).padStart(2, '0')}:${eMin}`,
    };
  }

  const endSuffix = em?.[3]
    ? (`${em[3].toUpperCase()}M` as 'AM' | 'PM')
    : sm?.[3]
      ? (`${sm[3].toUpperCase()}M` as 'AM' | 'PM')
      : null;
  if (!endSuffix) return null;

  // Bare "9:00" has no AM/PM for PART_RE — fall back to a plain hour[:min] match.
  const numParts = (m: RegExpMatchArray | null, t: string): [number, string] | null => {
    if (m) return [Number(m[1]), m[2] ?? '00'];
    const hm = t.match(HM_RE);
    return hm ? [Number(hm[1]), hm[2] ?? '00'] : null;
  };
  const sN = numParts(sm, sTrim);
  const eN = numParts(em, eTrim);
  if (!sN || !eN) return null;

  // "8:30 – 1:00 PM" means 8:30 AM: a suffix-less start past the end hour
  // (comparing 12h clock) belongs to the other half of the day.
  let startSuffix: 'AM' | 'PM' = endSuffix;
  if (!sm?.[3] && em?.[3]) {
    if (sN[0] % 12 > eN[0] % 12) startSuffix = endSuffix === 'PM' ? 'AM' : 'PM';
  }

  const start = to24h(sN[0], sN[1], sm?.[3] ? (`${sm[3].toUpperCase()}M` as 'AM' | 'PM') : startSuffix);
  const end = to24h(eN[0], eN[1], endSuffix);
  if (!start || !end) return null;
  return { start, end };
}

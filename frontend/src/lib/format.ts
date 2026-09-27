// Deterministic date helpers — no Intl, no timezone shifts.
// Parses YYYY-MM-DD manually so server + client always agree.

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseYMD(value: string | Date): { y: number; m: number; d: number } {
  if (value instanceof Date) {
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const dt = new Date(value);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

function weekdayOf(y: number, m: number, d: number): number {
  // Zeller-free: use UTC noon to avoid TZ shift, deterministic across runtimes
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** "15" */
export function dayNum(value: string | Date): string {
  return String(parseYMD(value).d);
}

/** "Sep" */
export function monthShort(value: string | Date): string {
  return MONTHS_SHORT[parseYMD(value).m - 1] ?? '';
}

/** "Tue" */
export function weekdayShort(value: string | Date): string {
  const { y, m, d } = parseYMD(value);
  return WEEKDAYS_SHORT[weekdayOf(y, m, d)];
}

/** "Tuesday, 15 September" — fixed comma format everywhere */
export function formatLong(value: string | Date): string {
  const { y, m, d } = parseYMD(value);
  const wd = WEEKDAYS_LONG[weekdayOf(y, m, d)];
  return `${wd}, ${d} ${MONTHS_LONG[m - 1]}`;
}

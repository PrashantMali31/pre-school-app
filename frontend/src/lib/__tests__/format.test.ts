import { describe, expect, it } from 'vitest';
import { dayNum, formatLong, monthShort, weekdayShort } from '../format';

describe('deterministic date helpers', () => {
  it('parses YYYY-MM-DD without timezone shift', () => {
    expect(dayNum('2026-09-15')).toBe('15');
    expect(monthShort('2026-09-15')).toBe('Sep');
  });

  it('computes the correct weekday', () => {
    // 15 Sep 2026 is a Tuesday (matches the production bug report)
    expect(weekdayShort('2026-09-15')).toBe('Tue');
    expect(formatLong('2026-09-15')).toBe('Tuesday, 15 September');
  });

  it('handles leap days and year boundaries', () => {
    expect(formatLong('2024-02-29')).toBe('Thursday, 29 February');
    expect(weekdayShort('2026-01-01')).toBe('Thu');
  });

  it('accepts Date objects too', () => {
    expect(dayNum(new Date(2026, 8, 15))).toBe('15');
  });
});

import { describe, expect, it } from 'vitest';
import { format12h, formatTimeRange, parseTimeRange } from '../time-range';

describe('format12h', () => {
  it('converts 24h to 12h display', () => {
    expect(format12h('09:00')).toBe('9:00 AM');
    expect(format12h('12:00')).toBe('12:00 PM');
    expect(format12h('13:00')).toBe('1:00 PM');
    expect(format12h('00:30')).toBe('12:30 AM');
  });
});

describe('formatTimeRange', () => {
  it('collapses a shared suffix seed-style', () => {
    expect(formatTimeRange('09:00', '11:30')).toBe('9:00 – 11:30 AM');
    expect(formatTimeRange('13:00', '15:30')).toBe('1:00 – 3:30 PM');
  });
  it('keeps both suffixes across AM/PM', () => {
    expect(formatTimeRange('09:00', '12:00')).toBe('9:00 AM – 12:00 PM');
    expect(formatTimeRange('08:30', '13:00')).toBe('8:30 AM – 1:00 PM');
  });
});

describe('parseTimeRange', () => {
  it('parses seed-style ranges', () => {
    expect(parseTimeRange('9:00 – 11:30 AM')).toEqual({ start: '09:00', end: '11:30' });
    expect(parseTimeRange('9:00 – 12:00 PM')).toEqual({ start: '09:00', end: '12:00' });
    expect(parseTimeRange('8:30 – 1:00 PM')).toEqual({ start: '08:30', end: '13:00' });
  });
  it('parses explicit and 24h ranges', () => {
    expect(parseTimeRange('9:00 AM – 12:00 PM')).toEqual({ start: '09:00', end: '12:00' });
    expect(parseTimeRange('09:00-12:00')).toEqual({ start: '09:00', end: '12:00' });
  });
  it('returns null for placeholders and free text', () => {
    expect(parseTimeRange('—')).toBeNull();
    expect(parseTimeRange('morning')).toBeNull();
    expect(parseTimeRange('')).toBeNull();
  });
  it('round-trips formatted ranges', () => {
    for (const [s, e] of [['09:00', '11:30'], ['09:00', '12:00'], ['08:30', '13:00'], ['13:00', '15:30']] as const) {
      expect(parseTimeRange(formatTimeRange(s, e))).toEqual({ start: s, end: e });
    }
  });
});

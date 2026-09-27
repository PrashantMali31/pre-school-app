import { describe, expect, it } from 'vitest';
import { downloadCSV, toCSV, toICS } from '../export';

describe('CSV builder', () => {
  it('escapes commas, quotes and newlines', () => {
    const csv = toCSV(['Name', 'Note'], [['Diya, Jr.', 'says "hi"\nbye']]);
    expect(csv).toBe('Name,Note\n"Diya, Jr.","says ""hi""\nbye"');
  });
  it('downloadCSV is exported for pages', () => {
    expect(typeof downloadCSV).toBe('function');
  });
});

describe('ICS builder', () => {
  const ics = toICS([
    { id: 'e1', title: 'Mango Day', date: '2026-09-18', time: '10:00 AM', location: 'Main Hall', description: 'Fun' },
    { id: 'e2', title: 'PTM', date: '2026-09-20', time: '4:30 PM', location: '', description: '' },
  ]);
  it('wraps events in a valid calendar', () => {
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('SUMMARY:Mango Day');
  });
  it('converts 12h times to 24h stamps', () => {
    expect(ics).toContain('DTSTART:20260918T100000');
    expect(ics).toContain('DTSTART:20260920T163000');
  });
});

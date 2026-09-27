import type { SchoolOptions } from './types';

export const OPTION_KEYS = [
  'staffRoles',
  'genders',
  'eventTypes',
  'sources',
  'audiences',
  'feeTitles',
] as const;

export type OptionKey = (typeof OPTION_KEYS)[number];

export const OPTION_META: Record<OptionKey, { label: string; hint: string; icon: string }> = {
  staffRoles: { label: 'Staff roles', hint: 'Used in Teachers → Add educator', icon: '🍎' },
  genders: { label: 'Genders', hint: 'Used in Students → Admit kid', icon: '👧🧒' },
  eventTypes: { label: 'Event types', hint: 'Used in Events → Plan event', icon: '🎪' },
  sources: { label: 'Enquiry sources', hint: 'Used in Admissions → New enquiry', icon: '🎯' },
  audiences: { label: 'Announcement audiences', hint: 'Used in Announcements → New broadcast', icon: '📣' },
  feeTitles: { label: 'Fee titles', hint: 'Quick-pick titles when raising a bill', icon: '💰' },
};

export const DEFAULT_OPTIONS: SchoolOptions = {
  staffRoles: ['Lead Educator', 'Assistant Teacher', 'Montessori Guide', 'Music & Movement', 'UKG Coordinator', 'Art & Craft'],
  genders: ['Boy', 'Girl'],
  eventTypes: ['Celebration', 'Field Trip', 'Meeting', 'Festival', 'Holiday', 'Workshop'],
  sources: ['Walk-in', 'Referral', 'Instagram', 'Google', 'Flyer', 'Other'],
  audiences: ['All Parents', 'Staff only', 'Tiny Tots', 'Little Explorers', 'Curious Cubs', 'Flying Foxes (UKG)'],
  feeTitles: ['Monthly Tuition', 'Term Tuition', 'Admission + Kit', 'Transport', 'Meals', 'Activity Fee'],
};

export function ensureOptions(input: unknown): SchoolOptions {
  const o = (input ?? {}) as Partial<Record<OptionKey, unknown>>;
  const pick = (key: OptionKey): string[] => {
    const v = o[key];
    if (Array.isArray(v)) {
      const cleaned = v.map((x) => String(x).trim()).filter(Boolean);
      // de-dupe case-insensitively, keep first casing
      const seen = new Set<string>();
      const out: string[] = [];
      for (const item of cleaned) {
        const k = item.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push(item);
        }
      }
      if (out.length > 0) return out;
    }
    return [...DEFAULT_OPTIONS[key]];
  };
  return {
    staffRoles: pick('staffRoles'),
    genders: pick('genders'),
    eventTypes: pick('eventTypes'),
    sources: pick('sources'),
    audiences: pick('audiences'),
    feeTitles: pick('feeTitles'),
  };
}

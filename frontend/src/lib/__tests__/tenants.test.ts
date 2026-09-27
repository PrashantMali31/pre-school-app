import { describe, expect, it } from 'vitest';
import { slugify } from '../tenants';

describe('tenant slugify', () => {
  it('creates URL-safe slugs', () => {
    expect(slugify('Sunshine Kids')).toBe('sunshine-kids');
    expect(slugify('  Rainbow & Stars!! Preschool  ')).toBe('rainbow-stars-preschool');
  });
  it('falls back for empty input', () => {
    expect(slugify('!!!')).toBe('school');
    expect(slugify('')).toBe('school');
  });
  it('caps length', () => {
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(32);
  });
});

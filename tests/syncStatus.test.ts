import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { ageText, isStale } from '../lib/syncStatus';

const now = new Date('2026-11-05T12:00:00Z');
describe('Letzter Abgleich', () => {
  it('Hinweis erst ab 12 Stunden oder ohne Abgleich', () => {
    expect(isStale(new Date('2026-11-05T05:00:00Z'), now)).toBe(false);
    expect(isStale(new Date('2026-11-04T23:59:00Z'), now)).toBe(true);
    expect(isStale(undefined, now)).toBe(true);
  });
  it('Text', () => {
    expect(ageText(undefined, now)).toBe('noch nie');
    expect(ageText(new Date('2026-11-05T11:30:00Z'), now)).toBe('vor weniger als 1 Stunde');
    expect(ageText(new Date('2026-11-05T11:00:00Z'), now)).toBe('vor 1 Stunde');
    expect(ageText(new Date('2026-11-05T02:00:00Z'), now)).toBe('vor 10 Stunden');
    expect(ageText(new Date('2026-11-02T12:00:00Z'), now)).toBe('vor 3 Tagen');
  });
});

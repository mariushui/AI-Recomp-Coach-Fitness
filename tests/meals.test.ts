import { describe, it, expect } from 'vitest';
import { mealBreakdown, slotOf, slotSeries } from '../lib/meals';
import type { Entry } from '../supabase/functions/_shared/domain';

const m = (at: string, data: any): Entry => ({ id: at + JSON.stringify(data), user_id: 'u', kind: 'meal', occurred_at: at, source: 'text', data }) as Entry;

describe('slotOf', () => {
  it('meal_type hat Vorrang, Shake und Ergänzung zählen als Snack', () => {
    expect(slotOf(m('2026-11-04T20:00:00+01:00', { description: 'x', meal_type: 'fruehstueck' }))).toBe('fruehstueck');
    expect(slotOf(m('2026-11-04T08:00:00+01:00', { description: 'x', meal_type: 'shake' }))).toBe('snack');
    expect(slotOf(m('2026-11-04T08:00:00+01:00', { description: 'x', meal_type: 'ergaenzung' }))).toBe('snack');
  });
  it('ohne meal_type entscheidet die Uhrzeit', () => {
    expect(slotOf(m('2026-11-04T07:30:00+01:00', { description: 'x' }))).toBe('fruehstueck');
    expect(slotOf(m('2026-11-04T12:30:00+01:00', { description: 'x' }))).toBe('mittag');
    expect(slotOf(m('2026-11-04T16:30:00+01:00', { description: 'x' }))).toBe('snack');
    expect(slotOf(m('2026-11-04T19:00:00+01:00', { description: 'x' }))).toBe('abend');
    expect(slotOf(m('2026-11-04T23:00:00+01:00', { description: 'x' }))).toBe('snack');
  });
});

describe('mealBreakdown', () => {
  const entries = [
    m('2026-11-03T08:00:00+01:00', { description: 'Hafer', meal_type: 'fruehstueck', protein_g: 30, carbs_g: 70, fat_g: 10, kcal: 500 }),
    m('2026-11-03T13:00:00+01:00', { description: 'Wraps', meal_type: 'mittag', protein_g: 40, carbs_g: 60, fat_g: 20, kcal: 600 }),
    m('2026-11-03T16:00:00+01:00', { description: 'Mango', meal_type: 'snack', protein_g: 1, carbs_g: 25, fat_g: 0, kcal: 100 }),
    m('2026-11-04T08:00:00+01:00', { description: 'Hafer', meal_type: 'fruehstueck', protein_g: 20, carbs_g: 70, fat_g: 10, kcal: 500 }),
  ];
  const r = mealBreakdown(entries);
  it('mittelt pro Tag mit Essen', () => {
    expect(r.days).toBe(2);
    expect(r.rows.find((x) => x.slot === 'fruehstueck')!.avg).toEqual({ protein: 25, carbs: 70, fat: 10, kcal: 500 });
    expect(r.rows.find((x) => x.slot === 'mittag')!.avg.kcal).toBe(300);
  });
  it('Anteil an den kcal und proteinreiche Mahlzeiten (ab 30 g)', () => {
    expect(r.rows.find((x) => x.slot === 'fruehstueck')!.share).toBeCloseTo(1000 / 1700);
    expect(r.rows.find((x) => x.slot === 'fruehstueck')!.proteinHits).toBe(1);
    expect(r.proteinMealsPerDay).toBe(1);
  });
  it('Zeitreihe je Zeitfenster', () => {
    const s = slotSeries(entries, 'protein', (iso) => iso.slice(0, 10));
    expect(s.get('2026-11-03')).toEqual({ fruehstueck: 30, mittag: 40, abend: 0, snack: 1 });
    expect(s.get('2026-11-04')!.fruehstueck).toBe(20);
  });
});

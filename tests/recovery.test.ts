import { describe, it, expect } from 'vitest';
import { dailyRecovery, dailyStrain, recoveryAt, recoveryLabel, strainFromLoad, strainLabel } from '../lib/recovery';
import type { DayStats } from '../lib/stats';
import type { Entry } from '../supabase/functions/_shared/domain';

const day = (i: number, extra: Partial<DayStats> = {}): DayStats => ({
  day: `2026-10-${String(i + 1).padStart(2, '0')}`,
  entries: 1,
  ...extra,
});

describe('recoveryAt', () => {
  it('liefert 50 bei Werten wie im eigenen Schnitt', () => {
    const days = Array.from({ length: 15 }, (_, i) => day(i, { hrv: 55, restingHr: 52, sleepH: 7.5 }));
    expect(recoveryAt(days, 14)).toBe(50);
  });

  it('steigt bei höherer HRV, niedrigerem Ruhepuls und mehr Schlaf', () => {
    const base = Array.from({ length: 14 }, (_, i) => day(i, { hrv: 55 + (i % 2), restingHr: 52, sleepH: 7 }));
    const good = [...base, day(14, { hrv: 75, restingHr: 46, sleepH: 8.5 })];
    const bad = [...base, day(14, { hrv: 35, restingHr: 60, sleepH: 5 })];
    expect(recoveryAt(good, 14)).toBe(100);
    expect(recoveryAt(bad, 14)).toBe(0);
  });

  it('ignoriert Kennzahlen ohne genug Vergleichswerte', () => {
    const days = [...Array.from({ length: 5 }, (_, i) => day(i, { hrv: 55 })), day(5, { hrv: 80 })];
    expect(recoveryAt(days, 5)).toBeUndefined();
    const enough = [...Array.from({ length: 8 }, (_, i) => day(i, { hrv: 55 })), day(8, { hrv: 80 })];
    expect(recoveryAt(enough, 8)).toBe(100); // nur HRV, kleine Streuung wird auf 5 ms begrenzt
    expect(dailyRecovery(enough).filter((x) => x !== undefined)).toHaveLength(2); // Tag 8 und 9
  });
});

describe('dailyStrain', () => {
  const e = (at: string, data: any): Entry => ({ id: at, user_id: 'u', kind: 'workout', occurred_at: at, source: 'manual', data }) as Entry;
  it('Skala 0 bis 10: Mitteldistanz-Triathlon 9,3, Tennistag 6,5 bis 7,5, lockerer Lauf um 3,5', () => {
    const days = [day(0), day(1, { exerciseMin: 190 }), day(2)];
    const strain = dailyStrain(
      [
        e('2026-10-01T08:00:00+02:00', { sport: 'sonstiges', sport_label: 'Triathlon', duration_min: 330, rpe: 7.5 }),
        e('2026-10-02T10:00:00+02:00', { sport: 'tennis', duration_min: 120 }),
        e('2026-10-02T09:00:00+02:00', { sport: 'rad', duration_min: 40, rpe: 4 }),
        e('2026-10-03T08:00:00+02:00', { sport: 'laufen', duration_min: 60, rpe: 5 }),
      ],
      days,
    );
    expect(strain.get('2026-10-01')).toBe(9.3);
    const tennisDay = strain.get('2026-10-02')!; // Tennis 120x6 + Rad 40x4 + 30 min Alltag x4 = 1000
    expect(tennisDay).toBeGreaterThanOrEqual(6.5);
    expect(tennisDay).toBeLessThanOrEqual(7.5);
    expect(strain.get('2026-10-03')).toBe(2.8);
    expect(strainFromLoad(42.195 * 6 * 7.5)).toBeGreaterThan(8.5); // Marathon mit RPE 7,5 bei 6 min/km
  });

  it('ohne RPE gilt ein Standard je Sportart, Deckel bleibt unter 10', () => {
    const strain = dailyStrain([e('2026-10-01T18:00:00+02:00', { sport: 'laufen', duration_min: 60 })], [day(0)]);
    expect(strain.get('2026-10-01')).toBe(3.6);
    expect(strainFromLoad(100000)).toBe(10);
  });

  it('nimmt Apple-Trainingsminuten, die kein Training abdeckt, mit RPE 4 dazu', () => {
    expect(dailyStrain([], [day(0, { exerciseMin: 48 })]).get('2026-10-01')).toBe(1.9);
    const strain = dailyStrain([e('2026-10-01T18:00:00+02:00', { sport: 'tennis', duration_min: 60, rpe: 6 })], [day(0, { exerciseMin: 60 })]);
    expect(strain.get('2026-10-01')).toBe(3.2); // nur das Training zählt, die Minuten sind abgedeckt
  });
});

describe('Labels', () => {
  it('ordnet Werte ein', () => {
    expect(recoveryLabel(80).text).toBe('gut erholt');
    expect(recoveryLabel(50).text).toBe('mittel');
    expect(recoveryLabel(10).text).toBe('wenig erholt');
    expect(recoveryLabel(undefined).text).toContain('Vergleichswerte');
    expect(strainLabel(2)).toBe('leicht');
    expect(strainLabel(5)).toBe('moderat');
    expect(strainLabel(7)).toBe('hoch');
    expect(strainLabel(9.3)).toBe('sehr hoch');
  });
});

import { describe, it, expect } from 'vitest';
import { dailyRecovery, dailyStrain, recoveryAt, recoveryLabel, strainLabel } from '../lib/recovery';
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
  it('rechnet Minuten x RPE / 60, ohne RPE gilt 5, Deckel 21', () => {
    const days = [day(0), day(1), day(2)];
    const strain = dailyStrain(
      [
        e('2026-10-01T18:00:00+02:00', { sport: 'tennis', duration_min: 90, rpe: 7 }),
        e('2026-10-02T08:00:00+02:00', { sport: 'laufen', duration_min: 60 }),
        e('2026-10-02T18:00:00+02:00', { sport: 'kraft', duration_min: 120, rpe: 9 }),
      ],
      days,
    );
    expect(strain.get('2026-10-01')).toBe(10.5);
    expect(strain.get('2026-10-02')).toBe(21);
    expect(strain.has('2026-10-03')).toBe(false);
  });

  it('nimmt Apple-Health-Trainingsminuten, wenn kein eigenes Training da ist', () => {
    const strain = dailyStrain([], [day(0, { exerciseMin: 48 })]);
    expect(strain.get('2026-10-01')).toBe(4);
  });
});

describe('Labels', () => {
  it('ordnet Werte ein', () => {
    expect(recoveryLabel(80).text).toBe('gut erholt');
    expect(recoveryLabel(50).text).toBe('mittel');
    expect(recoveryLabel(10).text).toBe('wenig erholt');
    expect(recoveryLabel(undefined).text).toContain('Vergleichswerte');
    expect(strainLabel(3)).toBe('leicht');
    expect(strainLabel(10)).toBe('moderat');
    expect(strainLabel(18)).toBe('hoch');
  });
});

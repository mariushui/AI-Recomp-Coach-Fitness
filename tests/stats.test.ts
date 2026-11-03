import { describe, it, expect } from 'vitest';
import { dailyStats, movingAverage, weeklySportMinutes } from '../lib/stats';
import type { Entry } from '../supabase/functions/_shared/domain';

const e = (kind: Entry['kind'], at: string, data: any): Entry => ({ id: at + kind, user_id: 'u', kind, occurred_at: at, source: 'manual', data });

describe('dailyStats', () => {
  const entries = [
    e('health', '2026-11-02T07:00:00+01:00', { metric: 'weight', value: 83, unit: 'kg' }),
    e('body', '2026-11-02T07:30:00+01:00', { weight_kg: 82.5 }),
    e('health', '2026-11-03T07:00:00+01:00', { metric: 'weight', value: 82.2, unit: 'kg' }),
    e('meal', '2026-11-02T08:00:00+01:00', { description: 'a', protein_g: 30, kcal: 500 }),
    e('meal', '2026-11-02T13:00:00+01:00', { description: 'b', protein_g: 45 }),
    e('workout', '2026-11-02T18:00:00+01:00', { sport: 'tennis', duration_min: 90 }),
    e('health', '2026-11-03T06:30:00+01:00', { metric: 'sleep', value: 435, unit: 'min' }),
  ];
  const s = dailyStats(entries, new Date(2026, 10, 2), new Date(2026, 10, 4));

  it('legt jeden Tag an', () => expect(s.map((x) => x.day)).toEqual(['2026-11-02', '2026-11-03']));
  it('bevorzugt manuelles Gewicht', () => expect(s[0].weight).toBe(82.5));
  it('nutzt Health-Gewicht als Ersatz', () => expect(s[1].weight).toBe(82.2));
  it('summiert Protein und kcal', () => {
    expect(s[0].protein).toBe(75);
    expect(s[0].kcal).toBe(500);
  });
  it('rechnet Schlaf in Stunden', () => expect(s[1].sleepH).toBe(7.3));
  it('summiert Training', () => expect(s[0].trainingMin).toBe(90));
});

describe('movingAverage', () => {
  it('ignoriert Lücken', () => {
    expect(movingAverage([80, undefined, 82], 7)).toEqual([80, 80, 81]);
  });
});

describe('weeklySportMinutes', () => {
  it('gruppiert nach Montag der Woche', () => {
    const w = weeklySportMinutes([
      e('workout', '2026-11-02T18:00:00+01:00', { sport: 'tennis', duration_min: 90 }),
      e('workout', '2026-11-08T10:00:00+01:00', { sport: 'tennis', duration_min: 60 }),
      e('workout', '2026-11-04T07:00:00+01:00', { sport: 'laufen', duration_min: 40 }),
      e('workout', '2026-11-09T07:00:00+01:00', { sport: 'capoeira', duration_min: 75 }),
    ]);
    expect(w).toEqual([
      { week: '2026-11-02', tennis: 150, laufen: 40 },
      { week: '2026-11-09', capoeira: 75 },
    ]);
  });
});

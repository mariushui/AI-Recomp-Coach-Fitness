import { describe, it, expect } from 'vitest';
import { estimateActiveToday, kcalPerMinute } from '../lib/energy';

const w = (at: string, sport: string, min: number, kcal?: number) => ({ id: at, user_id: 'u', kind: 'workout', occurred_at: at, source: 'health', data: { sport, duration_min: min, ...(kcal ? { kcal } : {}) } }) as any;
const p = (at: string, sport: string, min: number) => ({ id: 'p' + at, user_id: 'u', kind: 'plan', occurred_at: at, source: 'manual', data: { sport, duration_min: min } }) as any;
const day = (d: string, activeKcal?: number) => ({ day: d, activeKcal }) as any;

describe('Verbrauch schätzen', () => {
  it('lernt kcal je Minute aus eigenen Trainings (Median)', () => {
    const r = kcalPerMinute([w('2026-11-01T18:00:00+01:00', 'tennis', 100, 700), w('2026-11-02T18:00:00+01:00', 'tennis', 60, 600), w('2026-11-03T18:00:00+01:00', 'tennis', 60, 480)]);
    expect(r.tennis).toBe(8);
    expect(r.laufen).toBe(11);
  });
  it('morgens: Alltag ohne Training plus geplantes Tennis', () => {
    const entries = [w('2026-11-02T18:00:00+01:00', 'tennis', 120, 960), p('2026-11-05T18:00:00+01:00', 'tennis', 90)];
    const days = [day('2026-11-02', 1460), day('2026-11-03', 500), day('2026-11-04', 600), day('2026-11-05', 40)];
    const r = estimateActiveToday(days, entries, new Date('2026-11-05T07:00:00+01:00'));
    // Alltag: (1460 - 960 + 500 + 600) / 3 = 533, Tennis 90 min x 8 = 720
    expect(r.base).toBe(533);
    expect(r.training).toBe(720);
    expect(r.value).toBe(1253);
    expect(r.estimated).toBe(true);
  });
  it('abends gilt der echte Wert, wenn er höher ist', () => {
    const days = [day('2026-11-03', 500), day('2026-11-04', 600), day('2026-11-05', 1400)];
    const r = estimateActiveToday(days, [], new Date('2026-11-05T21:00:00+01:00'));
    expect(r).toMatchObject({ value: 1400, estimated: false });
  });
  it('ohne Vergleichstage bleibt es beim echten Wert', () => {
    expect(estimateActiveToday([day('2026-11-05', 40)], [], new Date('2026-11-05T07:00:00+01:00'))).toMatchObject({ value: 40, estimated: false });
  });
});

describe('Alltag nach Wochentag', () => {
  it('nimmt den Schnitt derselben Wochentage der letzten 3 Wochen', () => {
    // 22 Tage, letzter = heute (Do). Donnerstage davor: 900, 1000, 1100. Sonst 400.
    const days = Array.from({ length: 22 }, (_, i) => {
      const k = 21 - i;
      const v = k === 0 ? 30 : k === 7 ? 900 : k === 14 ? 1000 : k === 21 ? 1100 : 400;
      return { day: `d${i}`, activeKcal: v } as any;
    });
    const r = estimateActiveToday(days, [], new Date('2026-11-05T07:00:00+01:00'));
    expect(r.baseFrom).toBe('wochentag');
    expect(r.base).toBe(1000);
  });
});

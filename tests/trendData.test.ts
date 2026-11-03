import { describe, it, expect } from 'vitest';
import { aggregate, buckets, granularityFor, trainingRows } from '../components/trendData';
import { matchPlans } from '../lib/plans';
import type { Entry } from '../supabase/functions/_shared/domain';

const e = (id: string, kind: Entry['kind'], at: string, data: any): Entry => ({ id, user_id: 'u', kind, occurred_at: at, source: 'manual', data });
const FROM = new Date(2026, 10, 2); // Mo 2.11.
const TO = new Date(2026, 10, 9);

describe('Zeitachse', () => {
  it('Woche und 30 Tage täglich, sonst wöchentlich', () => {
    expect([7, 30, 90, 365].map(granularityFor)).toEqual(['day', 'day', 'week', 'week']);
  });
  it('Woche hat 7 Tage mit Wochentag', () => {
    const b = buckets(FROM, TO, 'day', 7);
    expect(b.map((x) => x.label)).toEqual(['Mo 2.', 'Di 3.', 'Mi 4.', 'Do 5.', 'Fr 6.', 'Sa 7.', 'So 8.']);
  });
  it('Wochen-Buckets fassen Tage zusammen und mitteln', () => {
    const b = buckets(new Date(2026, 10, 2), new Date(2026, 10, 16), 'week', 90);
    expect(b.map((x) => [x.key, x.days.length])).toEqual([['2026-11-02', 7], ['2026-11-09', 7]]);
    const rows = aggregate([{ day: '2026-11-02', weight: 82, entries: 1 }, { day: '2026-11-04', weight: 81, entries: 1 }] as any, b, ['weight']);
    expect(rows[0].weight).toBe(81.5);
    expect(rows[1].weight).toBeUndefined();
  });
});

describe('Training mit Plan-Schatten', () => {
  const entries = [
    e('p1', 'plan', '2026-11-02T17:00:00+01:00', { sport: 'tennis', duration_min: 120 }),
    e('w1', 'workout', '2026-11-02T17:00:00+01:00', { sport: 'tennis', duration_min: 90 }),
    e('p2', 'plan', '2026-11-03T19:30:00+01:00', { sport: 'capoeira', duration_min: 120 }),
    e('p3', 'plan', '2026-11-06T08:30:00+01:00', { sport: 'schwimmen', duration_min: 60, status: 'ausgefallen' }),
  ];
  const rows = trainingRows(entries, matchPlans(entries, new Date(2026, 10, 8)), buckets(FROM, TO, 'day', 7), 'day');
  it('jeder Tag vorhanden, auch ohne Training', () => expect(rows).toHaveLength(7));
  it('Schatten = geplant minus trainiert', () => {
    expect(rows[0]).toMatchObject({ tennis: 90, tennis_plan: 30 });
    expect(rows[1]).toMatchObject({ capoeira: 0, capoeira_plan: 120 });
  });
  it('ausgefallene Pläne werfen keinen Schatten', () => expect(rows[4].schwimmen_plan).toBeUndefined());
});

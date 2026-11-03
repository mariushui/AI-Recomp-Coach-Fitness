import { describe, it, expect } from 'vitest';
import { expandSlots, slotsFromDrafts, activeSlots, visiblePlans, slotExternalId } from '../lib/planTemplate';
import { matchPlans } from '../lib/plans';
import type { Entry, PlanSlot } from '../supabase/functions/_shared/domain';

const slot = (id: string, weekday: number, time: string, data: any, valid_from = '2026-10-01', valid_to: string | null = null): PlanSlot => ({ id, weekday, time, data, valid_from, valid_to });
const MON = new Date(2026, 10, 2); // Montag 2.11.2026
const NEXT_MON = new Date(2026, 10, 9);

describe('expandSlots', () => {
  const slots = [
    slot('a', 2, '18:00', { sport: 'tennis', duration_min: 90 }),
    slot('b', 4, '07:15', { sport: 'laufen', duration_min: 45 }),
    slot('c', 6, '10:00', { sport: 'capoeira' }, '2026-11-05'), // erst ab Donnerstag gültig
    slot('d', 7, '10:00', { sport: 'rad' }, '2026-10-01', '2026-11-01'), // beendet
  ];

  it('erzeugt eine Einheit pro passendem Wochentag', () => {
    const r = expandSlots(slots, [], MON, NEXT_MON);
    expect(r.map((e) => e.id)).toEqual(['slot:a:2026-11-03', 'slot:b:2026-11-05', 'slot:c:2026-11-07']);
    expect(r[0].occurred_at.startsWith('2026-11-03T18:00:00')).toBe(true);
    expect(r[1].data).toEqual({ sport: 'laufen', duration_min: 45 });
  });

  it('respektiert gültig ab und gültig bis', () => {
    const r = expandSlots(slots, [], new Date(2026, 9, 26), MON);
    expect(r.map((e) => e.id)).toEqual(['slot:a:2026-10-27', 'slot:b:2026-10-29', 'slot:d:2026-11-01']);
  });

  it('Änderung für eine Woche ersetzt die Vorlage', () => {
    const override: Entry = { id: 'x', user_id: 'u', kind: 'plan', occurred_at: '2026-11-03T19:30:00+01:00', source: 'manual', data: { sport: 'tennis', duration_min: 60 }, external_id: slotExternalId('a', '2026-11-03') };
    const r = expandSlots(slots, [override], MON, NEXT_MON);
    expect(r.map((e) => e.id)).not.toContain('slot:a:2026-11-03');
  });

  it('gestrichene Einheiten verschwinden aus Anzeige und Quote', () => {
    const removed: Entry = { id: 'y', user_id: 'u', kind: 'plan', occurred_at: '2026-11-03T18:00:00+01:00', source: 'manual', data: { sport: 'tennis', status: 'entfernt' }, external_id: slotExternalId('a', '2026-11-03') };
    const all = [removed, ...expandSlots(slots, [removed], MON, NEXT_MON)];
    const vis = visiblePlans(all);
    expect(vis.find((e) => e.id === 'y')).toBeUndefined();
    expect(matchPlans(vis, new Date(2026, 10, 8, 12)).map((s) => s.plan.id)).toEqual(['slot:b:2026-11-05', 'slot:c:2026-11-07']);
  });
});

describe('slotsFromDrafts', () => {
  it('macht aus erkannten Plänen Wochentag und Uhrzeit', () => {
    const r = slotsFromDrafts(
      [
        { occurred_at: '2026-11-05T18:30:00+01:00', data: { sport: 'tennis', focus: 'Rückhand', status: 'ausgefallen' } },
        { occurred_at: '2026-11-08T10:00:00+01:00', data: { sport: 'schwimmen' } },
      ],
      '2026-11-03',
    );
    expect(r).toEqual([
      { weekday: 4, time: '18:30', data: { sport: 'tennis', focus: 'Rückhand' }, valid_from: '2026-11-03', valid_to: null },
      { weekday: 7, time: '10:00', data: { sport: 'schwimmen' }, valid_from: '2026-11-03', valid_to: null },
    ]);
  });
});

describe('activeSlots', () => {
  it('filtert beendete und sortiert', () => {
    const r = activeSlots(
      [slot('x', 5, '18:00', {}), slot('y', 2, '19:00', {}), slot('z', 2, '07:00', {}), slot('old', 1, '07:00', {}, '2026-01-01', '2026-10-01')],
      '2026-11-03',
    );
    expect(r.map((s) => s.id)).toEqual(['z', 'y', 'x']);
  });
});

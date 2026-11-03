import { describe, it, expect } from 'vitest';
import { matchPlans, weeklyPlanStats, workoutFromPlan } from '../lib/plans';
import { normalizeParseResult } from '../supabase/functions/_shared/parse';
import { normalizeData } from '../supabase/functions/_shared/domain';
import type { Entry } from '../supabase/functions/_shared/domain';

const e = (id: string, kind: Entry['kind'], at: string, data: any): Entry => ({ id, user_id: 'u', kind, occurred_at: at, source: 'manual', data });
const NOW = new Date('2026-11-05T12:00:00+01:00'); // Donnerstag

describe('matchPlans', () => {
  const entries = [
    e('p1', 'plan', '2026-11-03T18:00:00+01:00', { sport: 'tennis', duration_min: 90, focus: 'Rückhand' }),
    e('w1', 'workout', '2026-11-03T18:30:00+01:00', { sport: 'tennis', duration_min: 80 }),
    e('p2', 'plan', '2026-11-04T07:00:00+01:00', { sport: 'laufen', duration_min: 45 }),
    e('p3', 'plan', '2026-11-04T19:00:00+01:00', { sport: 'capoeira', duration_min: 75, status: 'ausgefallen' }),
    e('p4', 'plan', '2026-11-05T18:00:00+01:00', { sport: 'kraft', duration_min: 60 }),
    e('p5', 'plan', '2026-11-07T10:00:00+01:00', { sport: 'tennis', duration_min: 120 }),
    e('p6', 'plan', '2026-11-03T20:00:00+01:00', { sport: 'tennis', duration_min: 30 }),
  ];
  const s = Object.fromEntries(matchPlans(entries, NOW).map((x) => [x.plan.id, x]));

  it('erkennt erledigt über Sportart und Tag', () => {
    expect(s.p1.status).toBe('erledigt');
    expect(s.p1.workout?.id).toBe('w1');
  });
  it('ein Training erfüllt nur einen Plan', () => expect(s.p6.status).toBe('offen'));
  it('vergangen ohne Training = offen', () => expect(s.p2.status).toBe('offen'));
  it('ausgefallen bleibt ausgefallen', () => expect(s.p3.status).toBe('ausgefallen'));
  it('heute und Zukunft = geplant', () => {
    expect(s.p4.status).toBe('geplant');
    expect(s.p5.status).toBe('geplant');
  });

  it('Wochenquote zählt nur bis heute', () => {
    expect(weeklyPlanStats(matchPlans(entries, NOW), NOW)).toEqual([
      { week: '2026-11-02', planned: 5, done: 1, plannedMin: 300, doneMin: 80 },
    ]);
  });
});

describe('Plan-Daten', () => {
  it('übernimmt Plan als Training mit Ziel in den Notizen', () => {
    expect(workoutFromPlan({ sport: 'laufen', duration_min: 45, goal: '8 km unter 5:45', status: 'ausgefallen' })).toEqual({
      sport: 'laufen',
      duration_min: 45,
      notes: 'Ziel: 8 km unter 5:45',
    });
  });
  it('normalizeData behält Planfelder und verwirft Trainingsfelder', () => {
    expect(normalizeData('plan', { sport: 'rad', duration_min: '90', goal: 'locker', high: 'x', status: 'quatsch' })).toEqual({
      sport: 'rad',
      duration_min: 90,
      goal: 'locker',
    });
  });
  it('KI-Antwort mit plan wird übernommen', () => {
    const r = normalizeParseResult({ entries: [{ kind: 'plan', occurred_at: '2026-11-06T18:00:00+01:00', plan: { sport: 'schwimmen', duration_min: 45 } }] }, '2026-11-05T12:00:00+01:00');
    expect(r.entries[0]).toEqual({ kind: 'plan', occurred_at: '2026-11-06T18:00:00+01:00', data: { sport: 'schwimmen', duration_min: 45 } });
  });
});

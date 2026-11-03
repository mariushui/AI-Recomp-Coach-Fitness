import { describe, it, expect } from 'vitest';
import { goalColor, goalRatio, todaySummary } from '../lib/today';
import type { Entry } from '../supabase/functions/_shared/domain';

const NOW = new Date('2026-11-03T15:00:00+01:00');
const e = (kind: Entry['kind'], at: string, data: any, id = Math.random().toString(36).slice(2)): Entry =>
  ({ id, user_id: 'u', kind, occurred_at: at, source: 'manual', data }) as Entry;

describe('todaySummary', () => {
  it('summiert Protein und kcal von heute, nimmt Schlaf der letzten Nacht', () => {
    const s = todaySummary(
      [
        e('meal', '2026-11-03T08:00:00+01:00', { description: 'a', protein_g: 38, kcal: 520 }),
        e('meal', '2026-11-03T13:00:00+01:00', { description: 'b', protein_g: 41, kcal: 640 }),
        e('meal', '2026-11-02T20:00:00+01:00', { description: 'gestern', protein_g: 45, kcal: 700 }),
        e('health', '2026-11-03T06:30:00+01:00', { metric: 'sleep', value: 452, unit: 'min' }),
        e('health', '2026-11-02T06:30:00+01:00', { metric: 'sleep', value: 400, unit: 'min' }),
      ],
      { protein: 165, kcal: null },
      NOW,
    );
    expect(s.protein).toBe(79);
    expect(s.kcal).toBe(1160);
    expect(s.sleepH).toBe(7.5);
    expect(s.proteinGoal).toBe(165);
    expect(s.kcalGoal).toBeUndefined();
  });

  it('zeigt die nächste offene Einheit und erledigte Pläne', () => {
    const s = todaySummary(
      [
        e('plan', '2026-11-03T07:00:00+01:00', { sport: 'laufen' }),
        e('workout', '2026-11-03T07:10:00+01:00', { sport: 'laufen', duration_min: 45 }),
        e('plan', '2026-11-03T18:00:00+01:00', { sport: 'tennis' }),
        e('plan', '2026-11-04T18:00:00+01:00', { sport: 'capoeira' }),
      ],
      {},
      NOW,
    );
    expect(s.donePlan).toBe('Laufen');
    expect(s.nextPlan).toMatch(/^Tennis \d\d:\d\d$/); // Uhrzeit in lokaler Zeit der Testumgebung
    expect(s.trainingMin).toBe(45);
  });

  it('bleibt leer ohne Einträge', () => {
    const s = todaySummary([], {}, NOW);
    expect(s.protein).toBeUndefined();
    expect(s.nextPlan).toBeUndefined();
  });
});

describe('goalRatio', () => {
  it('deckelt bei 1 und ist null ohne Ziel', () => {
    expect(goalRatio(80, 160)).toBe(0.5);
    expect(goalRatio(200, 160)).toBe(1);
    expect(goalRatio(undefined, 160)).toBe(0);
    expect(goalRatio(80, undefined)).toBeNull();
  });

  it('färbt gleitend: Protein Richtung Grün, Kalorien Richtung Orange und Rot', () => {
    expect(goalColor(50, 160, 'more')).toBe('#8B5CF6');
    expect(goalColor(160, 160, 'more')).toBe('rgb(173,255,47)');
    expect(goalColor(1000, 2500, 'less')).toBe('#8B5CF6');
    expect(goalColor(2500, 2500, 'less')).toBe('rgb(255,107,0)');
    expect(goalColor(3000, 2500, 'less')).toBe('rgb(255,55,95)');
    expect(goalColor(100, undefined, 'less')).toBe('#8B5CF6');
  });
});

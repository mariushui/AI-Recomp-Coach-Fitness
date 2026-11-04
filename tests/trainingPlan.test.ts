import { describe, it, expect } from 'vitest';
import { focusHistory, matchTemplate, planKey, preselectFocus, upcomingSessions } from '../lib/trainingPlan';
import { DEFAULT_TEMPLATES } from '../lib/strengthTemplates';

const plan = (id: string, at: string, data: any, external_id?: string) => ({ id, user_id: 'u', kind: 'plan', occurred_at: at, source: 'manual', data, external_id }) as any;
const workout = (at: string, data: any) => ({ id: 'w' + at, user_id: 'u', kind: 'workout', occurred_at: at, source: 'manual', data }) as any;

describe('Nächste Einheiten', () => {
  const now = new Date('2026-11-05T07:00:00+01:00');
  const entries = [
    plan('a', '2026-11-08T10:00:00+01:00', { sport: 'kraft', focus: 'Push, Trizeps, Squat' }),
    plan('b', '2026-11-05T08:30:00+01:00', { sport: 'kraft', focus: 'Pull, Bizeps, Hinge' }),
    plan('c', '2026-11-05T18:00:00+01:00', { sport: 'tennis' }),
    plan('d', '2026-11-04T18:00:00+01:00', { sport: 'tennis' }),
    plan('e', '2026-11-06T18:00:00+01:00', { sport: 'laufen' }),
    workout('2026-11-06T17:00:00+01:00', { sport: 'laufen' }),
  ];
  it('ab heute, die nächste zuerst, ohne erledigte und vergangene', () => {
    expect(upcomingSessions(entries, now).map((s) => s.plan.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('Vorlage zum Plan', () => {
  it('Name der Vorlage, dann Stichworte, dann gemerkte Wahl', () => {
    expect(matchTemplate(plan('x', '2026-11-05T08:30:00+01:00', { sport: 'kraft', focus: 'Pull, Bizeps, Hinge' }), DEFAULT_TEMPLATES)?.id).toBe('pull');
    expect(matchTemplate(plan('x', '2026-11-05T08:30:00+01:00', { sport: 'kraft', notes: 'Legday' }), DEFAULT_TEMPLATES)?.id).toBe('beine');
    expect(matchTemplate(plan('x', '2026-11-05T08:30:00+01:00', { sport: 'kraft', focus: 'Brust und Trizeps' }), DEFAULT_TEMPLATES)?.id).toBe('push');
    expect(matchTemplate(plan('x', '2026-11-05T08:30:00+01:00', { sport: 'kraft' }), DEFAULT_TEMPLATES)).toBeUndefined();
    const p = plan('slot:42:2026-11-05', '2026-11-05T08:30:00+01:00', { sport: 'kraft' }, 'slot:42:2026-11-05');
    expect(planKey(p)).toBe('slot:42');
    expect(matchTemplate(p, DEFAULT_TEMPLATES, { 'slot:42': 'beine' })?.id).toBe('beine');
  });
});

describe('Fokus', () => {
  const list = ['Topspin Vorhand', 'Topspin Rückhand', 'Kick-Aufschlag', 'Volley'];
  it('Vorauswahl aus Plan, sonst letzte Einheit, sonst die ersten 3', () => {
    expect(preselectFocus(list, { sport: 'tennis', focus: 'Kick-Aufschlag und Volley' }, undefined)).toEqual(['Kick-Aufschlag', 'Volley']);
    expect(preselectFocus(list, undefined, { sport: 'tennis', focus_notes: [{ focus: 'Volley' }] })).toEqual(['Volley']);
    expect(preselectFocus(list, undefined, undefined)).toEqual(list.slice(0, 3));
  });
  it('Verlauf der Notizen je Fokus, neueste zuerst', () => {
    const ws = [
      workout('2026-11-01T18:00:00+01:00', { sport: 'tennis', focus_notes: [{ focus: 'Kick-Aufschlag', note: 'Wurf zu weit vorn' }] }),
      workout('2026-11-03T18:00:00+01:00', { sport: 'tennis', focus_notes: [{ focus: 'Kick-Aufschlag', note: 'Wurf besser' }, { focus: 'Volley' }] }),
    ];
    expect(focusHistory(ws, 'Kick-Aufschlag').map((x) => x.note)).toEqual(['Wurf besser', 'Wurf zu weit vorn']);
    expect(focusHistory(ws, 'Volley')).toEqual([]);
  });
});

describe('Fokus aus Stichwort', () => {
  it('„Rückhand“ im Plan wählt „Topspin Rückhand“', () => {
    expect(preselectFocus(['Topspin Vorhand', 'Topspin Rückhand', 'Kick-Aufschlag'], { sport: 'tennis', focus: 'Rückhand' }, undefined)).toEqual(['Topspin Rückhand']);
  });
});

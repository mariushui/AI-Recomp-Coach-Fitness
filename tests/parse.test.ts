import { describe, it, expect } from 'vitest';
import { normalizeParseResult, RESPONSE_SCHEMA } from '../supabase/functions/_shared/parse';

const NOW = '2026-11-03T10:00:00+01:00';

describe('normalizeParseResult', () => {
  it('übernimmt gültige Einträge und säubert Werte', () => {
    const r = normalizeParseResult(
      {
        entries: [
          { kind: 'meal', occurred_at: '2026-11-03T08:00:00+01:00', meal: { description: '3 Eier, Haferflocken', protein_g: '32', kcal: 610 } },
          { kind: 'workout', occurred_at: 'heute', workout: { sport: 'tennis', duration_min: 90, high: 'Kick-Aufschlag stabil', low: 'Slice', rpe: 7 } },
          { kind: 'wellbeing', occurred_at: NOW, wellbeing: { energy: 7, mood: 0 } },
          { kind: 'health', occurred_at: NOW },
          { kind: 'body', occurred_at: NOW, body: {} },
          { kind: 'quatsch' },
        ],
        questions: ['Wie lange?', 'Wie viel Whey?', 'Dritte Frage'],
      },
      NOW,
    );
    expect(r.entries.map((e) => e.kind)).toEqual(['meal', 'workout', 'wellbeing']);
    expect((r.entries[0].data as any).protein_g).toBe(32);
    expect(r.entries[1].occurred_at).toBe(NOW); // ungültige Zeit → jetzt
    expect((r.entries[2].data as any).energy).toBe(5); // auf 1-5 begrenzt
    expect((r.entries[2].data as any).mood).toBe(1);
    expect(r.questions).toHaveLength(2);
  });

  it('setzt unbekannte Sportart auf sonstiges', () => {
    const r = normalizeParseResult({ entries: [{ kind: 'workout', occurred_at: NOW, workout: { sport: 'padel', sport_label: 'Padel' } }] }, NOW);
    expect((r.entries[0].data as any).sport).toBe('sonstiges');
  });

  it('hat für jede Art außer health ein Unterobjekt im Schema', () => {
    const props = (RESPONSE_SCHEMA.properties.entries.items as any).properties;
    for (const k of ['meal', 'workout', 'body', 'wellbeing', 'lab', 'note']) expect(props[k]).toBeDefined();
  });
});

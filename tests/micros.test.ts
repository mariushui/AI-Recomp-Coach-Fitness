import { describe, it, expect } from 'vitest';
import { normalizeData } from '../supabase/functions/_shared/domain';
import { averageMicros, microZone, microsByDay, sumMicros } from '../lib/micros';
import { RESPONSE_SCHEMA, buildFormatHint } from '../supabase/functions/_shared/parse';

const meal = (at: string, micros?: any) => ({ kind: 'meal', occurred_at: at, data: { description: 'x', ...(micros ? { micros } : {}) } }) as any;

describe('Mikronährstoffe', () => {
  it('normalizeData nimmt nur bekannte Schlüssel in plausiblen Grenzen', () => {
    const d: any = normalizeData('meal', { description: 'Lachs', micros: { omega3_g: '2,1', vitamin_d_ug: 12, sodium_mg: -5, iron_mg: 500, foo: 3 } });
    expect(d.micros).toEqual({ omega3_g: 2.1, vitamin_d_ug: 12 });
    const e: any = normalizeData('meal', { description: 'Apfel', micros: { foo: 1 } });
    expect(e.micros).toBeUndefined();
  });
  it('Summe über Mahlzeiten', () => {
    expect(sumMicros([{ fiber_g: 5, iron_mg: 2 }, undefined, { fiber_g: 7.5 }])).toEqual({ fiber_g: 12.5, iron_mg: 2 });
    expect(sumMicros([undefined])).toBeUndefined();
  });
  it('Tage und Schnitt zählen nur Tage mit Schätzung', () => {
    const days = microsByDay([
      meal('2026-11-03T08:00:00+01:00', { fiber_g: 10 }),
      meal('2026-11-03T13:00:00+01:00', { fiber_g: 12 }),
      meal('2026-11-04T08:00:00+01:00'),
      meal('2026-11-05T08:00:00+01:00', { fiber_g: 30 }),
    ]);
    expect(days.get('2026-11-03')).toMatchObject({ meals: 2, withMicros: 2, micros: { fiber_g: 22 } });
    expect(days.get('2026-11-04')).toMatchObject({ meals: 1, withMicros: 0 });
    expect(averageMicros([...days.values()])).toEqual({ micros: { fiber_g: 26 }, days: 2 });
  });
  it('Ampel: Mindestwerte und Höchstwerte', () => {
    expect(microZone('fiber_g', 30)?.zone).toBe('gut');
    expect(microZone('fiber_g', 21)?.zone).toBe('knapp');
    expect(microZone('fiber_g', 10)?.zone).toBe('wenig');
    expect(microZone('sodium_mg', 2000)?.zone).toBe('gut');
    expect(microZone('sodium_mg', 3000)?.zone).toBe('zu viel');
  });
  it('KI-Format kennt alle Schlüssel', () => {
    const props = (RESPONSE_SCHEMA as any).properties.entries.items.properties.meal.properties.micros.properties;
    expect(Object.keys(props)).toContain('magnesium_mg');
    expect(buildFormatHint()).toContain('vitamin_d_ug');
  });
});

describe('Kurzer Prompt für die Neuberechnung', () => {
  it('nennt alle Mikro-Schlüssel und ist deutlich kürzer als der volle Prompt', async () => {
    const { buildNutritionPrompt, buildSystemPrompt, buildFormatHint } = await import('../supabase/functions/_shared/parse');
    const p = buildNutritionPrompt();
    expect(p).toContain('omega3_g');
    expect(p).toContain('Ergänzungsmittel');
    expect(p.length).toBeLessThan((buildSystemPrompt() + buildFormatHint()).length / 2);
  });
});

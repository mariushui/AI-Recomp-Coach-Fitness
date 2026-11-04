import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyRecalc, recalcText } from '../lib/nutritionRecalc';

describe('Nährwerte neu berechnen', () => {
  it('Text aus Beschreibung und Zutaten', () => {
    expect(recalcText({ description: 'Bowl', items: [{ name: 'Reis', amount: '150 g' }, { name: 'Tofu' }] })).toBe('Nur Nährwerte schätzen, eine Mahlzeit: Bowl. Zutaten: 150 g Reis, Tofu');
    expect(recalcText({ description: ' ' })).toBe('');
  });
  it('übernimmt Summen und Mikros, behält Text und Typ', () => {
    const out = applyRecalc({ description: 'Bowl', meal_type: 'mittag', protein_g: 10 }, [
      { protein_g: 30.4, kcal: 500, micros: { fiber_g: 6 }, confidence: 'medium', items: [{ name: 'Reis' }] },
      { protein_g: 5, kcal: 100, micros: { fiber_g: 2, iron_mg: 1 } },
    ]);
    expect(out).toEqual({ description: 'Bowl', meal_type: 'mittag', protein_g: 35, kcal: 600, confidence: 'medium', items: [{ name: 'Reis' }], micros: { fiber_g: 8, iron_mg: 1 } });
  });
});

// Warteschlange: Supabase und KI werden ersetzt
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] };
const updates: any[] = [];
let failTimes = 0;
const inserted: any[] = [];
vi.mock('../lib/entries', () => ({
  insertEntries: vi.fn(async (rows: any[]) => void inserted.push(...rows)),
  parseText: vi.fn(async (text: string) => {
    if (text === 'Wetter schön') return { entries: [], questions: [] };
    if (text.startsWith('Frühstück')) return { entries: [{ kind: 'meal', occurred_at: '2026-11-04T08:00:00+01:00', data: { description: 'Haferflocken mit Beeren', protein_g: 20 } }], questions: ['Wie viel Milch?'] };
    if (failTimes > 0) {
      failTimes--;
      throw new Error('KI-Dienst antwortet mit Status 500');
    }
    return { entries: [{ kind: 'meal', data: { protein_g: 40, kcal: 700 } }], questions: [] };
  }),
  updateEntry: vi.fn(async (id: string, patch: any) => void updates.push({ id, patch })),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: { description: 'Neu bearbeitet', protein_g: 1 } }, error: null }) }) }) }) },
}));

describe('Hintergrund-Aufgaben', () => {
  beforeEach(() => {
    updates.length = 0;
    for (const k of Object.keys(store)) delete store[k];
  });
  it('rechnet, trägt in den aktuellen Stand ein und meldet fertig', async () => {
    const { addRecalcJob, runJobs, pendingJobs, subscribeJobs } = await import('../lib/backgroundJobs');
    const events: string[] = [];
    subscribeJobs((e) => events.push(e.type));
    addRecalcJob('m1', 'Nur Nährwerte schätzen, eine Mahlzeit: Lachs', 'Lachs');
    await runJobs();
    await new Promise((r) => setTimeout(r, 10));
    expect(updates).toEqual([{ id: 'm1', patch: { data: { description: 'Neu bearbeitet', protein_g: 40, kcal: 700 } } }]);
    expect(pendingJobs()).toHaveLength(0);
    expect(events).toContain('done');
  });
  it('neue Aufgabe für dieselbe Mahlzeit ersetzt die alte', async () => {
    const { addRecalcJob, pendingJobs } = await import('../lib/backgroundJobs');
    vi.stubGlobal('navigator', { onLine: false }); // nicht sofort abarbeiten
    addRecalcJob('m2', 'a', 'A');
    addRecalcJob('m2', 'b', 'B');
    expect(pendingJobs().map((j) => j.text)).toEqual(['b']);
    vi.unstubAllGlobals();
  });
  it('versucht es bei Fehlern bis zu 3 Mal', async () => {
    vi.useFakeTimers();
    const { addRecalcJob, runJobs, pendingJobs } = await import('../lib/backgroundJobs');
    failTimes = 2;
    addRecalcJob('m3', 'x', 'X');
    const p = runJobs();
    await vi.runAllTimersAsync();
    await p;
    vi.useRealTimers();
    expect(pendingJobs()).toHaveLength(0);
    expect(updates.map((u) => u.id)).toContain('m3');
  });
});

describe('Erkennen im Hintergrund', () => {
  beforeEach(() => {
    inserted.length = 0;
  });
  it('speichert die erkannten Einträge mit Herkunft und Originaltext, gibt Rückfragen weiter', async () => {
    const { addParseJob, runJobs, subscribeJobs } = await import('../lib/backgroundJobs');
    const done: any[] = [];
    const off = subscribeJobs((e) => e.type === 'done' && done.push(e));
    addParseJob('Frühstück Haferflocken', 'voice');
    await runJobs();
    await new Promise((r) => setTimeout(r, 10));
    off();
    expect(inserted).toEqual([{ kind: 'meal', occurred_at: '2026-11-04T08:00:00+01:00', data: { description: 'Haferflocken mit Beeren', protein_g: 20 }, source: 'voice', raw_text: 'Frühstück Haferflocken' }]);
    expect(done[0].summary).toBe('Gespeichert: Haferflocken mit Beeren');
    expect(done[0].questions).toEqual(['Wie viel Milch?']);
  });
  it('nichts erkannt: Text wird Notiz', async () => {
    const { addParseJob, runJobs } = await import('../lib/backgroundJobs');
    addParseJob('Wetter schön', 'text');
    await runJobs();
    await new Promise((r) => setTimeout(r, 10));
    expect(inserted[0]).toMatchObject({ kind: 'note', data: { text: 'Wetter schön' } });
  });
});

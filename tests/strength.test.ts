import { describe, it, expect } from 'vitest';
import type { Entry } from '../supabase/functions/_shared/domain';
import { normalizeData } from '../supabase/functions/_shared/domain';
import { bestE1rm, bodyweightAt, e1rm, exerciseHistory, exerciseVolume, lastSets, resolveSet, sessionKindOf, setsZone, summarizeSets, weeklyStrength } from '../lib/strength';
import { CATALOG, guessSessionKind, matchExercise } from '../lib/exercises';
import { DEFAULT_TEMPLATES } from '../lib/strengthTemplates';

const w = (at: string, data: any): Entry => ({ id: at, user_id: 'u', kind: 'workout', occurred_at: at, source: 'manual', data: { sport: 'kraft', ...data } }) as Entry;
const body = (at: string, kg: number): Entry => ({ id: 'b' + at, user_id: 'u', kind: 'body', occurred_at: at, source: 'manual', data: { weight_kg: kg } }) as Entry;

describe('Volumen', () => {
  it('Bankdrücken 68 x 3, 58 x 8, 58 x 6, 58 x 6 = 1.364 kg', () => {
    expect(exerciseVolume({ exercise: 'Bankdrücken', exercise_id: 'bankdruecken', set_list: [{ reps: 3, weight_kg: 68 }, { reps: 8, weight_kg: 58 }, { reps: 6, weight_kg: 58 }, { reps: 6, weight_kg: 58 }] }, undefined, CATALOG)).toBe(1364);
  });
  it('Aufwärmsätze zählen nicht', () => {
    expect(exerciseVolume({ exercise: 'Kreuzheben', exercise_id: 'kreuzheben', set_list: [{ reps: 15, weight_kg: 48, warmup: true }, { reps: 10, weight_kg: 78 }] }, undefined, CATALOG)).toBe(780);
  });
  it('Kurzhanteln je Hand: Rudern 2 x 16 kg, 3 x 15 = 1.440 kg', () => {
    expect(exerciseVolume({ exercise: 'Kurzhantelrudern', exercise_id: 'rudern_kh', sets: 3, reps: 15, weight_kg: 16 }, undefined, CATALOG)).toBe(1440);
  });
  it('Klimmzüge mit Band: 86 kg minus 32 kg Hilfe = 54 kg, 12 + 10 + 8 = 1.620 kg', () => {
    expect(exerciseVolume({ exercise: 'Klimmzüge', exercise_id: 'klimmzug', set_list: [{ reps: 12, weight_kg: -32 }, { reps: 10, weight_kg: -32 }, { reps: 8, weight_kg: -32 }] }, 86, CATALOG)).toBe(1620);
  });
  it('Startvorlagen ergeben die Werte aus den Ausgangswerten', () => {
    const vol = (id: string, bw?: number) =>
      DEFAULT_TEMPLATES.find((t) => t.id === id)!.exercises.reduce((a, x) => a + exerciseVolume({ exercise: x.name, exercise_id: x.exercise_id, set_list: x.sets }, bw, CATALOG), 0);
    expect(vol('pull', 86)).toBe(4932);
    // 1.364 + 2.106 (Kreuzheben 78 x 27) + 840 + 30 (1 kg je Bein, 2 x 1 x 45 gerechnet als Paar) + 378 + 840
    expect(vol('push')).toBe(1364 + 2106 + 840 + 90 + 378 + 840);
  });
});

describe('e1RM nach Epley', () => {
  it('100 kg x 10 = 133,3 kg', () => expect(e1rm(100, 10)).toBe(133.3));
  it('über 12 Wdh. keine Schätzung', () => expect(e1rm(100, 15)).toBeUndefined());
  it('bester Satz zählt', () => {
    expect(bestE1rm({ exercise: 'Bankdrücken', exercise_id: 'bankdruecken', set_list: [{ reps: 3, weight_kg: 68 }, { reps: 8, weight_kg: 58 }] }, undefined, CATALOG)).toBe(74.8); // 68 x (1 + 3/30) schlägt 58 x (1 + 8/30) = 73,5
  });
});

describe('Schattenwerte', () => {
  const entries = [
    w('2026-10-26T10:00:00+01:00', { exercises: [{ exercise: 'Bankdrücken', exercise_id: 'bankdruecken', set_list: [{ reps: 8, weight_kg: 55 }] }] }),
    w('2026-11-02T10:00:00+01:00', { exercises: [{ exercise: 'Bankdrücken', exercise_id: 'bankdruecken', set_list: [{ reps: 8, weight_kg: 58 }, { reps: 6, weight_kg: 58 }] }] }),
  ];
  it('nimmt die letzte Einheit vor dem Zeitpunkt', () => {
    expect(lastSets(entries, 'bankdruecken', '2026-11-09T10:00:00+01:00', CATALOG)).toEqual([{ reps: 8, weight_kg: 58 }, { reps: 6, weight_kg: 58 }]);
    expect(lastSets(entries, 'bankdruecken', '2026-11-01T10:00:00+01:00', CATALOG)).toEqual([{ reps: 8, weight_kg: 55 }]);
  });
  it('leeres Feld übernimmt den Schatten, getipptes Feld gewinnt', () => {
    expect(resolveSet({ reps: '', weight: '' }, { reps: 8, weight_kg: 58 })).toEqual({ reps: 8, weight_kg: 58 });
    expect(resolveSet({ reps: '9', weight: '' }, { reps: 8, weight_kg: 58 })).toEqual({ reps: 9, weight_kg: 58 });
    expect(resolveSet({ reps: '', weight: '60,5' }, { reps: 8, weight_kg: 58 })).toEqual({ reps: 8, weight_kg: 60.5 });
    expect(resolveSet({ reps: '', weight: '' })).toBeUndefined();
  });
  it('Aufwärmen bleibt erhalten', () => {
    expect(resolveSet({}, { reps: 15, weight_kg: 48, warmup: true })).toEqual({ reps: 15, weight_kg: 48, warmup: true });
  });
});

describe('Wochenwerte', () => {
  const entries = [
    body('2026-11-01T07:00:00+01:00', 86),
    w('2026-11-02T10:00:00+01:00', { session_kind: 'push', exercises: [{ exercise: 'Bankdrücken', exercise_id: 'bankdruecken', set_list: [{ reps: 10, weight_kg: 60 }, { reps: 10, weight_kg: 60 }] }] }),
    w('2026-11-05T08:30:00+01:00', { session_kind: 'pull', exercises: [{ exercise: 'Klimmzüge', exercise_id: 'klimmzug', set_list: [{ reps: 10, weight_kg: -32 }] }] }),
    w('2026-11-10T10:00:00+01:00', { exercises: [{ exercise: 'Kniebeuge', exercise_id: 'kniebeuge', set_list: [{ reps: 5, weight_kg: 70 }] }, { exercise: 'Wadenpresse', exercise_id: 'wadenpresse', set_list: [{ reps: 12, weight_kg: 58 }] }] }),
  ];
  const rows = weeklyStrength(entries, CATALOG);
  it('Volumen je Einheitstyp und Woche', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0].week).toBe('2026-11-02');
    expect(rows[0].volume.push).toBe(1200);
    expect(rows[0].volume.pull).toBe(540);
    expect(rows[0].sessions).toBe(2);
    expect(rows[1].volume.beine).toBe(350 + 696);
  });
  it('harte Sätze: Hauptmuskel 1, Mitspieler 0,5', () => {
    expect(rows[0].muscleSets.brust).toBe(2);
    expect(rows[0].muscleSets.trizeps).toBe(1);
    expect(rows[0].muscleSets.ruecken).toBe(1);
    expect(rows[0].muscleSets.bizeps).toBe(0.5);
  });
  it('Ampel 10 bis 20', () => {
    expect(setsZone(6).label).toBe('unter 10');
    expect(setsZone(12).label).toBe('10 bis 20');
    expect(setsZone(22).label).toBe('über 20');
  });
  it('Verlauf einer Übung', () => {
    const h = exerciseHistory(entries, 'bankdruecken', CATALOG);
    expect(h).toHaveLength(1);
    expect(h[0].volume).toBe(1200);
    expect(h[0].e1rm).toBe(80);
  });
  it('Körpergewicht vor dem Training', () => {
    expect(bodyweightAt(entries, '2026-11-05T08:30:00+01:00')).toBe(86);
    expect(bodyweightAt(entries, '2026-10-30T08:30:00+01:00')).toBeUndefined();
  });
});

describe('Zuordnung', () => {
  it('Freitext findet die Katalogübung', () => {
    expect(matchExercise('bankdrücken', CATALOG)?.id).toBe('bankdruecken');
    expect(matchExercise('Wadenpresse', CATALOG)?.id).toBe('wadenpresse');
  });
  it('Art der Einheit aus den Muskeln', () => {
    expect(guessSessionKind(['quadrizeps', 'waden', 'rumpf'])).toBe('beine');
    expect(guessSessionKind(['brust', 'trizeps', 'schultern'])).toBe('push');
    expect(guessSessionKind(['ruecken', 'bizeps'])).toBe('pull');
    expect(guessSessionKind(['bizeps'])).toBe('einzel');
    expect(sessionKindOf({ sport: 'kraft', session_kind: 'ganzkoerper' })).toBe('ganzkoerper');
  });
  it('Kurztext fürs Kalenderfeld', () => {
    expect(summarizeSets([{ reps: 10, weight_kg: 58 }, { reps: 10, weight_kg: 58 }])).toBe('2 x 10 @ 58 kg');
    expect(summarizeSets([{ reps: 15, weight_kg: 48, warmup: true }, { reps: 10, weight_kg: 78 }, { reps: 8, weight_kg: 78 }])).toBe('10, 8 @ 78 kg');
    expect(summarizeSets([{ reps: 3, weight_kg: 68 }, { reps: 8, weight_kg: 58 }])).toBe('68 x 3, 58 x 8');
  });
  it('normalizeData behält Sätze, Art und Vorlage', () => {
    const d: any = normalizeData('workout', { sport: 'kraft', session_kind: 'push', template: 'Push', exercises: [{ exercise: 'Bankdrücken', exercise_id: 'bankdruecken', set_list: [{ reps: '8', weight_kg: 58, warmup: true }, { foo: 1 }] }] });
    expect(d.session_kind).toBe('push');
    expect(d.template).toBe('Push');
    expect(d.exercises[0].set_list).toEqual([{ reps: 8, weight_kg: 58, warmup: true }]);
  });
});

describe('Warteschlange ohne Netz', () => {
  it('sendet einmal, auch bei zwei gleichzeitigen Aufrufen, und leert danach', async () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => (store[k] = v),
      removeItem: (k: string) => delete store[k],
    };
    const { enqueue, flush, queuedCount } = await import('../lib/offlineQueue');
    enqueue([{ kind: 'workout', occurred_at: '2026-11-04T18:00:00+01:00', source: 'manual', data: { sport: 'kraft' } } as any]);
    expect(queuedCount()).toBe(1);
    let calls = 0;
    const send = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
    };
    const [a, b] = await Promise.all([flush(send), flush(send)]);
    expect(calls).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(queuedCount()).toBe(0);
  });
  it('bleibt bei Fehler in der Schlange', async () => {
    const { enqueue, flush, queuedCount } = await import('../lib/offlineQueue');
    enqueue([{ kind: 'note', occurred_at: '2026-11-04T18:00:00+01:00', source: 'manual', data: { text: 'x' } } as any]);
    expect(await flush(async () => Promise.reject(new Error('Failed to fetch')))).toBe(0);
    expect(queuedCount()).toBe(1);
  });
});

describe('Reihenfolge der Diagramme', () => {
  it('unbekannte fallen weg, neue kommen ans Ende, verschieben', async () => {
    const { normalizeOrder, moveItem, CHARTS } = await import('../lib/chartPrefs');
    const o = normalizeOrder(['sleep', 'gibtsnicht', 'body', 'sleep', 'balance']);
    expect(o.slice(0, 2)).toEqual(['sleep', 'body']); // entfernte Karten wie balance fallen weg
    expect(o).toHaveLength(CHARTS.length);
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });
});

// Kraftentwicklung: Volumen, geschätztes 1RM, harte Sätze pro Muskelgruppe, letzte Leistung als Schattenwert.
// Reine Funktionen, getestet in tests/strength.test.ts.
//
// Kennzahlen (Quellen in docs/literatur/studien.md):
// - Volumen-Last = Last x Wdh. über alle Arbeitssätze. Aufwärmsätze zählen nicht.
// - Harte Sätze pro Muskelgruppe und Woche: Hauptmuskel 1, Mitspieler 0,5 (Nr. 13). Galpin: 10 bis 20 pro Woche.
// - e1RM nach Epley: Last x (1 + Wdh./30), nur bei 1 bis 12 Wdh. aussagekräftig.

import { SESSION_KINDS, type Entry, type SessionKind, type SetEntry, type StrengthSet, type WorkoutData } from '../supabase/functions/_shared/domain';
import { MUSCLES, allExercises, exerciseById, guessSessionKind, matchExercise, type Exercise, type Muscle } from './exercises';
import { dayKey, weekKey } from './time';

export const isStrength = (e: Pick<Entry, 'kind' | 'data'>) => e.kind === 'workout' && (e.data as WorkoutData).sport === 'kraft' && !!(e.data as WorkoutData).exercises?.length;

/** Stabile ID einer Übung: Katalog-ID, sonst Zuordnung über den Namen, sonst der Name selbst. */
export function exerciseKey(ex: Pick<StrengthSet, 'exercise' | 'exercise_id'>, list: Exercise[] = allExercises()): string {
  if (ex.exercise_id) return ex.exercise_id;
  return matchExercise(ex.exercise, list)?.id ?? 'frei_' + ex.exercise.toLowerCase().trim();
}

/** Alle Sätze, auch aus alten Einträgen mit nur Satzzahl, Wdh. und Gewicht. */
export function setsOf(ex: StrengthSet): SetEntry[] {
  if (ex.set_list?.length) return ex.set_list;
  const n = ex.sets ?? (ex.reps !== undefined || ex.weight_kg !== undefined ? 1 : 0);
  return Array.from({ length: n }, () => ({ reps: ex.reps, weight_kg: ex.weight_kg }));
}

export const workSets = (ex: StrengthSet): SetEntry[] => setsOf(ex).filter((s) => !s.warmup);

/** Tatsächliche Last eines Satzes in kg. */
export function loadKg(exercise: Exercise | undefined, weight: number | undefined, bodyweight?: number): number {
  const w = weight ?? 0;
  switch (exercise?.load) {
    case 'paar':
      return w * 2;
    case 'koerper':
      return bodyweight ? Math.max(0, bodyweight + w) : Math.max(0, w);
    case 'ohne':
      return 0;
    default:
      return w;
  }
}

export function exerciseVolume(ex: StrengthSet, bodyweight?: number, list: Exercise[] = allExercises()): number {
  const def = exerciseById(exerciseKey(ex, list), list);
  return Math.round(workSets(ex).reduce((a, s) => a + loadKg(def, s.weight_kg, bodyweight) * (s.reps ?? 0), 0));
}

/** Epley-Schätzung, nur für 1 bis 12 Wdh. */
export function e1rm(load: number, reps: number | undefined): number | undefined {
  if (!(load > 0) || !reps || reps < 1 || reps > 12) return undefined;
  return Math.round(load * (1 + reps / 30) * 10) / 10;
}

export function bestE1rm(ex: StrengthSet, bodyweight?: number, list: Exercise[] = allExercises()): number | undefined {
  const def = exerciseById(exerciseKey(ex, list), list);
  let best: number | undefined;
  for (const s of workSets(ex)) {
    const v = e1rm(loadKg(def, s.weight_kg, bodyweight), s.reps);
    if (v !== undefined && (best === undefined || v > best)) best = v;
  }
  return best;
}

export function sessionVolume(w: WorkoutData, bodyweight?: number, list: Exercise[] = allExercises()): number {
  return (w.exercises ?? []).reduce((a, ex) => a + exerciseVolume(ex, bodyweight, list), 0);
}

export const sessionSets = (w: WorkoutData) => (w.exercises ?? []).reduce((a, ex) => a + workSets(ex).length, 0);

export function sessionKindOf(w: WorkoutData, list: Exercise[] = allExercises()): SessionKind {
  if (w.session_kind) return w.session_kind;
  const muscles = (w.exercises ?? []).map((ex) => exerciseById(exerciseKey(ex, list), list)?.muscle).filter(Boolean) as Muscle[];
  return guessSessionKind(muscles);
}

/** Letztes bekanntes Körpergewicht vor oder an einem Zeitpunkt (Waage, Apple Health). */
export function bodyweightAt(entries: Entry[], at: string): number | undefined {
  let best: { t: number; v: number } | undefined;
  const limit = new Date(at).getTime();
  for (const e of entries) {
    const v = e.kind === 'body' ? (e.data as any).weight_kg : e.kind === 'health' && (e.data as any).metric === 'weight' ? (e.data as any).value : undefined;
    if (typeof v !== 'number') continue;
    const t = new Date(e.occurred_at).getTime();
    if (t <= limit && (!best || t > best.t)) best = { t, v };
  }
  return best?.v;
}

export interface WeekRow {
  week: string; // Montag, YYYY-MM-DD
  volume: Record<SessionKind, number>;
  sessions: number;
  sets: number;
  muscleSets: Record<Muscle, number>;
}

const zeroKinds = () => Object.fromEntries(SESSION_KINDS.map((k) => [k, 0])) as Record<SessionKind, number>;
const zeroMuscles = () => Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;

/** Wochenwerte: Volumen je Einheitstyp, Anzahl Einheiten und harte Sätze je Muskelgruppe. */
export function weeklyStrength(entries: Entry[], list: Exercise[] = allExercises()): WeekRow[] {
  const map = new Map<string, WeekRow>();
  for (const e of entries) {
    if (!isStrength(e)) continue;
    const w = e.data as WorkoutData;
    const wk = weekKey(e.occurred_at);
    const row = map.get(wk) ?? { week: wk, volume: zeroKinds(), sessions: 0, sets: 0, muscleSets: zeroMuscles() };
    const bw = bodyweightAt(entries, e.occurred_at);
    row.volume[sessionKindOf(w, list)] += sessionVolume(w, bw, list);
    row.sessions++;
    for (const ex of w.exercises ?? []) {
      const n = workSets(ex).length;
      row.sets += n;
      const def = exerciseById(exerciseKey(ex, list), list);
      if (!def) continue;
      row.muscleSets[def.muscle] += n;
      for (const m of def.also ?? []) row.muscleSets[m] += n * 0.5;
    }
    map.set(wk, row);
  }
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/** Ampel für harte Sätze pro Muskelgruppe und Woche (Galpin: 10 bis 20). */
export function setsZone(n: number): { label: string; color: string } {
  if (n < 10) return { label: 'unter 10', color: '#FBBF24' };
  if (n <= 20) return { label: '10 bis 20', color: '#ADFF2F' };
  return { label: 'über 20', color: '#FF375F' };
}

export interface ExercisePoint {
  day: string;
  at: string;
  volume: number;
  e1rm?: number;
  top?: SetEntry; // schwerster Arbeitssatz
  sets: SetEntry[];
}

/** Verlauf einer Übung über alle Einheiten. */
export function exerciseHistory(entries: Entry[], key: string, list: Exercise[] = allExercises()): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const e of entries) {
    if (!isStrength(e)) continue;
    const bw = bodyweightAt(entries, e.occurred_at);
    for (const ex of (e.data as WorkoutData).exercises ?? []) {
      if (exerciseKey(ex, list) !== key) continue;
      const ws = workSets(ex);
      const top = ws.reduce<SetEntry | undefined>((a, s) => (!a || (s.weight_kg ?? 0) > (a.weight_kg ?? 0) ? s : a), undefined);
      out.push({ day: dayKey(e.occurred_at), at: e.occurred_at, volume: exerciseVolume(ex, bw, list), e1rm: bestE1rm(ex, bw, list), top, sets: setsOf(ex) });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Übungen, die überhaupt vorkommen, mit Anzahl Einheiten, häufigste zuerst. */
export function usedExercises(entries: Entry[], list: Exercise[] = allExercises()): { key: string; name: string; count: number }[] {
  const map = new Map<string, { key: string; name: string; count: number }>();
  for (const e of entries) {
    if (!isStrength(e)) continue;
    for (const ex of (e.data as WorkoutData).exercises ?? []) {
      const key = exerciseKey(ex, list);
      const cur = map.get(key) ?? { key, name: exerciseById(key, list)?.name ?? ex.exercise, count: 0 };
      cur.count++;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Sätze der letzten Einheit mit dieser Übung, vor einem Zeitpunkt. Grundlage für die Schattenwerte. */
export function lastSets(entries: Entry[], key: string, before: string = new Date().toISOString(), list: Exercise[] = allExercises()): SetEntry[] | undefined {
  const limit = new Date(before).getTime();
  let best: { t: number; sets: SetEntry[] } | undefined;
  for (const e of entries) {
    if (!isStrength(e)) continue;
    const t = new Date(e.occurred_at).getTime();
    if (t >= limit || (best && t <= best.t)) continue;
    const ex = (e.data as WorkoutData).exercises!.find((x) => exerciseKey(x, list) === key);
    if (ex) best = { t, sets: setsOf(ex) };
  }
  return best?.sets;
}

/** Eingabe plus Schatten: leere Felder übernehmen den Schattenwert. */
export function resolveSet(input: { reps?: string; weight?: string; warmup?: boolean }, shadow?: SetEntry): SetEntry | undefined {
  const parse = (v: string | undefined) => {
    if (v === undefined || v.trim() === '') return undefined;
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  const reps = parse(input.reps) ?? shadow?.reps;
  const weight = parse(input.weight) ?? shadow?.weight_kg;
  if (reps === undefined && weight === undefined) return undefined;
  const out: SetEntry = {};
  if (reps !== undefined) out.reps = reps;
  if (weight !== undefined) out.weight_kg = weight;
  if (input.warmup ?? shadow?.warmup) out.warmup = true;
  return out;
}

/** Zusammenfassung für die Kalenderzeile, z. B. "3 x 10 @ 58 kg". */
export function summarizeSets(sets: SetEntry[]): string {
  const ws = sets.filter((s) => !s.warmup);
  if (!ws.length) return '';
  const fmt = (n?: number) => (n === undefined ? '' : n.toLocaleString('de-DE'));
  const sameW = ws.every((s) => s.weight_kg === ws[0].weight_kg);
  const sameR = ws.every((s) => s.reps === ws[0].reps);
  const w = ws[0].weight_kg !== undefined ? ` @ ${fmt(ws[0].weight_kg)} kg` : '';
  if (sameW && sameR) return `${ws.length} x ${fmt(ws[0].reps)}${w}`;
  if (sameW) return `${ws.map((s) => fmt(s.reps)).join(', ')}${w}`;
  return ws.map((s) => `${fmt(s.weight_kg)} x ${fmt(s.reps)}`).join(', ');
}

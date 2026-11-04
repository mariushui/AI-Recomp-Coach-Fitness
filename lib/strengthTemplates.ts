// Vorlagen für Krafteinheiten und lokaler Zwischenspeicher für die Eingabe im Keller (ohne Netz).
// Startwerte aus docs/kraft/ausgangswerte.md. Gewicht bei Kurzhanteln je Hand, bei Klimmzügen die Bandhilfe als minus.

import type { Entry, SessionKind, SetEntry } from '../supabase/functions/_shared/domain';
import { isStrength } from './strength';

export interface TemplateExercise {
  exercise_id: string;
  name: string;
  sets: SetEntry[]; // Startwerte, solange es noch keine Einheit mit der Übung gibt
}

export interface StrengthTemplate {
  id: string;
  name: string;
  kind: SessionKind;
  exercises: TemplateExercise[];
}

const s = (reps?: number, weight_kg?: number, warmup?: boolean): SetEntry => ({ ...(reps !== undefined ? { reps } : {}), ...(weight_kg !== undefined ? { weight_kg } : {}), ...(warmup ? { warmup } : {}) });
const n = (count: number, reps?: number, weight?: number) => Array.from({ length: count }, () => s(reps, weight));

export const DEFAULT_TEMPLATES: StrengthTemplate[] = [
  {
    id: 'pull',
    name: 'Pull, Bizeps, Hinge',
    kind: 'pull',
    exercises: [
      { exercise_id: 'klimmzug', name: 'Klimmzüge', sets: [s(12, -32), s(10, -32), s(8, -32)] },
      { exercise_id: 'good_morning', name: 'Good Mornings', sets: n(3, 15, 16) },
      { exercise_id: 'rudern_kh', name: 'Kurzhantelrudern', sets: n(3, 15, 16) },
      { exercise_id: 'beinbeuger', name: 'Beinbeuger', sets: n(3, 20, 0) },
      { exercise_id: 'pallof_press', name: 'Pallof Press', sets: n(3) },
      { exercise_id: 'face_pull', name: 'Face Pull', sets: n(3) },
      { exercise_id: 'bauch', name: 'Bauch', sets: n(3) },
      { exercise_id: 'curls_kh', name: 'Curls KH', sets: n(3, 6, 12) },
      { exercise_id: 'unterer_ruecken', name: 'Unterer Rücken', sets: n(3) },
    ],
  },
  {
    id: 'push',
    name: 'Push, Trizeps, Squat',
    kind: 'push',
    exercises: [
      { exercise_id: 'bankdruecken', name: 'Bankdrücken', sets: [s(3, 68), s(8, 58), s(6, 58), s(6, 58)] },
      { exercise_id: 'kreuzheben', name: 'Kreuzheben', sets: [s(15, 48, true), s(10, 78), s(9, 78), s(8, 78)] },
      { exercise_id: 'military_press_kh', name: 'Military Press KH', sets: n(3, 10, 14) },
      { exercise_id: 'glutes_beinheben', name: 'Glutes Beinheben', sets: n(3, 15, 1) },
      { exercise_id: 'trizeps_kh', name: 'Trizeps KH', sets: n(3, 9, 14) },
      { exercise_id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', sets: [s(12, 14), s(10, 14), s(8, 14)] },
      { exercise_id: 'bauch', name: 'Bauch', sets: n(3) },
    ],
  },
  {
    id: 'beine',
    name: 'Beine',
    kind: 'beine',
    exercises: [
      { exercise_id: 'kniebeuge', name: 'Kniebeuge', sets: [s(10, 48, true), s(10, 48, true), s(7, 68), s(7, 68)] },
      { exercise_id: 'deficit_reverse_lunge', name: 'Stepback von der Bank', sets: n(3, 10) },
      { exercise_id: 'wadenpresse', name: 'Wadenpresse', sets: n(3, 12, 58) },
      { exercise_id: 'beinheben', name: 'Beinheben', sets: n(3, 10) },
    ],
  },
];

const TEMPLATES_KEY = 'recomp_strength_templates_v1';
const HISTORY_KEY = 'recomp_strength_history_v1';
const DRAFT_KEY = 'recomp_strength_draft_v1';

const read = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* Speicher voll */
  }
};

export const loadTemplates = (): StrengthTemplate[] => read(TEMPLATES_KEY, DEFAULT_TEMPLATES);
export const saveTemplates = (t: StrengthTemplate[]) => write(TEMPLATES_KEY, t);

export function upsertTemplate(t: StrengthTemplate): StrengthTemplate[] {
  const list = loadTemplates();
  const i = list.findIndex((x) => x.id === t.id);
  const next = i >= 0 ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t];
  saveTemplates(next);
  return next;
}

export function deleteTemplate(id: string): StrengthTemplate[] {
  const next = loadTemplates().filter((x) => x.id !== id);
  saveTemplates(next);
  return next;
}

/** Krafteinheiten und Gewichte lokal halten, damit die Schattenwerte auch ohne Netz da sind. */
export function cacheHistory(entries: Entry[]): void {
  const keep = entries
    .filter((e) => isStrength(e) || (e.kind === 'body' && typeof (e.data as any).weight_kg === 'number') || (e.kind === 'health' && (e.data as any).metric === 'weight'))
    .map((e) => ({ id: e.id, user_id: e.user_id, kind: e.kind, occurred_at: e.occurred_at, source: e.source, data: e.data }));
  write(HISTORY_KEY, keep);
}

export const cachedHistory = (): Entry[] => read<Entry[]>(HISTORY_KEY, []);

export function appendToCache(e: Entry): void {
  write(HISTORY_KEY, [...cachedHistory(), e]);
}

export const loadDraft = <T,>(): T | null => read<T | null>(DRAFT_KEY, null);
export const saveDraft = (d: unknown) => write(DRAFT_KEY, d);
export const clearDraft = () => write(DRAFT_KEY, null);

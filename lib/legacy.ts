// Übernimmt Einträge aus der alten App-Version (localStorage "ai_fitness_coach_history_v2").
// Getestet in tests/legacy.test.ts.

import type { NewEntry, Sport, StrengthSet } from '../supabase/functions/_shared/domain';
import { normalizeData } from '../supabase/functions/_shared/domain';
import { localIso, dayKey } from './time';

export const LEGACY_HISTORY_KEY = 'ai_fitness_coach_history_v2';

const toScale5 = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(5, Math.max(1, Math.ceil(n / 2)));
};

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

export function guessSport(text: string): Sport {
  const t = text.toLowerCase();
  if (t.includes('tennis')) return 'tennis';
  if (t.includes('capoeira')) return 'capoeira';
  if (/(lauf|run|jogg)/.test(t)) return 'laufen';
  if (/(rad|bike|cycl)/.test(t)) return 'rad';
  if (/(schwimm|swim)/.test(t)) return 'schwimmen';
  if (/(kraft|gym|strength|push|pull|leg|upper|lower|hyrox)/.test(t)) return 'kraft';
  if (/(mobil|yoga|stretch)/.test(t)) return 'mobility';
  return 'sonstiges';
}

function entryDate(h: any): Date | undefined {
  if (typeof h?.timestamp === 'number') return new Date(h.timestamp);
  if (typeof h?.date === 'string') {
    const m = h.date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); // de-DE
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
    const d = new Date(h.date);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

/** Wandelt die alte Historie in neue Einträge. external_id verhindert doppelten Import. */
export function convertLegacyHistory(history: unknown): NewEntry[] {
  if (!Array.isArray(history)) return [];
  const out: NewEntry[] = [];
  for (const h of history as any[]) {
    const d = entryDate(h);
    if (!d) continue;
    const at = localIso(d);
    const key = dayKey(d);
    const base = { occurred_at: at, source: 'import' as const };

    const body = normalizeData('body', {
      weight_kg: num(h.metrics?.weight),
      body_fat_pct: num(h.metrics?.bodyFat),
    });
    if (body) out.push({ ...base, kind: 'body', data: body, external_id: `legacy:${key}:body` });

    const diet = h.diet ?? {};
    const parts = [
      ['Frühstück', diet.breakfast],
      ['Mittag', diet.lunch],
      ['Snacks', diet.snacks],
      ['Abend', diet.dinner],
    ].filter(([, v]) => typeof v === 'string' && v.trim());
    if (parts.length || h.macros) {
      const meal = normalizeData('meal', {
        description: parts.length ? parts.map(([k, v]) => `${k}: ${v}`).join('; ') : 'Tagesernährung',
        protein_g: num(h.macros?.protein),
        kcal: num(h.macros?.calories),
        carbs_g: num(h.macros?.carbs),
        fat_g: num(h.macros?.fat),
        confidence: h.macros?.confidence,
      });
      if (meal) out.push({ ...base, kind: 'meal', data: meal, external_id: `legacy:${key}:meal` });
    }

    const tr = h.training ?? {};
    const exercises: any[] = Array.isArray(tr.exercises) ? tr.exercises : [];
    if (tr.trained || exercises.length) {
      const label = [tr.type, ...exercises.map((e) => e?.name)].filter(Boolean).join(' ');
      const sport = guessSport(label);
      const strength: StrengthSet[] = exercises
        .filter((e) => e?.type === 'strength' && e?.name)
        .map((e) => ({ exercise: e.name, sets: num(e.sets), reps: num(e.reps), weight_kg: num(e.weight), rpe: num(e.rpe) }));
      const duration = exercises.reduce((s, e) => s + (num(e?.duration) ?? 0), 0);
      const workout = normalizeData('workout', {
        sport,
        sport_label: sport === 'sonstiges' ? tr.type : undefined,
        duration_min: duration || undefined,
        rpe: num(tr.rpe),
        exercises: strength,
        notes: exercises.map((e) => e?.notes).filter(Boolean).join('; ') || undefined,
      });
      if (workout) out.push({ ...base, kind: 'workout', data: workout, external_id: `legacy:${key}:workout` });
    }

    const r = h.recovery ?? {};
    const sliders = [r.general, r.muscleSoreness, r.jointPain, r.sleepQuality, r.mood, r.concentration, r.appetite];
    const untouched = sliders.every((v) => v === undefined || v === 5) && !r.emotion;
    if (!untouched) {
      const wb = normalizeData('wellbeing', {
        energy: toScale5(r.general),
        soreness: toScale5(r.muscleSoreness),
        joint_pain: toScale5(r.jointPain),
        sleep_quality: toScale5(r.sleepQuality),
        mood: toScale5(r.mood),
        focus: toScale5(r.concentration),
        appetite: toScale5(r.appetite),
        notes: r.emotion,
      });
      if (wb) out.push({ ...base, kind: 'wellbeing', data: wb, external_id: `legacy:${key}:wellbeing` });
    }

    const noteText = [h.remarks, h.planning?.activity && `Plan: ${h.planning.activity} ${h.planning.duration ?? ''} ${h.planning.focus ?? ''}`]
      .filter((x) => typeof x === 'string' && x.trim())
      .join('\n');
    if (noteText) {
      out.push({ ...base, kind: 'note', data: { text: noteText.trim() }, external_id: `legacy:${key}:note` });
    }
  }
  return out;
}

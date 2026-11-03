// Tages- und Wochenwerte für die Auswertung. Reine Funktionen, getestet in tests/stats.test.ts.

import type { Entry, BodyData, HealthData, MealData, WorkoutData, Sport } from '../supabase/functions/_shared/domain';
import { addDays, dayKey, startOfDay, weekKey } from './time';

export interface DayStats {
  day: string;
  weight?: number;
  bodyFat?: number;
  waist?: number;
  protein?: number;
  kcal?: number;
  carbs?: number;
  fat?: number;
  leanMass?: number; // magere Körpermasse in kg = Gewicht x (1 - KFA)
  fatMass?: number; // Fettmasse in kg = Gewicht x KFA
  trainingMin?: number;
  sleepH?: number;
  hrv?: number;
  restingHr?: number;
  vo2max?: number;
  spo2?: number;
  steps?: number;
  entries: number;
}

const add = (a: number | undefined, b: number | undefined) =>
  b === undefined ? a : (a ?? 0) + b;

/** Fasst Einträge pro lokalem Tag zusammen. Manuelle Körperwerte haben Vorrang vor Apple-Health-Werten. */
export function dailyStats(entries: Entry[], from: Date, to: Date): DayStats[] {
  const days = new Map<string, DayStats>();
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    const k = dayKey(d);
    days.set(k, { day: k, entries: 0 });
  }
  const healthWeight = new Map<string, number>();
  const healthFat = new Map<string, number>();
  const sorted = [...entries].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  for (const e of sorted) {
    const k = dayKey(e.occurred_at);
    const s = days.get(k);
    if (!s) continue;
    s.entries++;
    switch (e.kind) {
      case 'body': {
        const b = e.data as BodyData;
        if (b.weight_kg !== undefined && s.weight === undefined) s.weight = b.weight_kg;
        if (b.body_fat_pct !== undefined && s.bodyFat === undefined) s.bodyFat = b.body_fat_pct;
        if (b.waist_cm !== undefined) s.waist = b.waist_cm;
        break;
      }
      case 'meal': {
        const m = e.data as MealData;
        s.protein = add(s.protein, m.protein_g);
        s.kcal = add(s.kcal, m.kcal);
        s.carbs = add(s.carbs, m.carbs_g);
        s.fat = add(s.fat, m.fat_g);
        break;
      }
      case 'workout': {
        const w = e.data as WorkoutData;
        s.trainingMin = add(s.trainingMin, w.duration_min);
        break;
      }
      case 'health': {
        const h = e.data as HealthData;
        if (h.metric === 'weight') healthWeight.set(k, h.value);
        if (h.metric === 'body_fat') healthFat.set(k, h.value);
        if (h.metric === 'sleep') s.sleepH = Math.round((h.value / 60) * 10) / 10;
        if (h.metric === 'hrv') s.hrv = h.value;
        if (h.metric === 'resting_hr') s.restingHr = h.value;
        if (h.metric === 'vo2max') s.vo2max = h.value;
        if (h.metric === 'spo2') s.spo2 = h.value;
        if (h.metric === 'steps') s.steps = h.value;
        break;
      }
    }
  }
  for (const s of days.values()) {
    if (s.weight === undefined && healthWeight.has(s.day)) s.weight = healthWeight.get(s.day);
    if (s.bodyFat === undefined && healthFat.has(s.day)) s.bodyFat = healthFat.get(s.day);
    if (s.weight !== undefined && s.bodyFat !== undefined) {
      s.leanMass = Math.round(s.weight * (1 - s.bodyFat / 100) * 10) / 10;
      s.fatMass = Math.round(s.weight * (s.bodyFat / 100) * 10) / 10;
    }
    for (const k of ['protein', 'kcal', 'carbs', 'fat'] as const) if (s[k] !== undefined) s[k] = Math.round(s[k]!);
  }
  return [...days.values()];
}

/** Gleitender Mittelwert über die letzten n Tage. Lücken zählen nicht mit. */
export function movingAverage(values: (number | undefined)[], n = 7): (number | undefined)[] {
  return values.map((_, i) => {
    const win = values.slice(Math.max(0, i - n + 1), i + 1).filter((v): v is number => v !== undefined);
    if (win.length === 0) return undefined;
    return Math.round((win.reduce((a, b) => a + b, 0) / win.length) * 10) / 10;
  });
}

export type WeekSport = { week: string } & Partial<Record<Sport, number>>;

/** Trainingsminuten pro Woche und Sportart */
export function weeklySportMinutes(entries: Entry[]): WeekSport[] {
  const weeks = new Map<string, WeekSport>();
  for (const e of entries) {
    if (e.kind !== 'workout') continue;
    const w = e.data as WorkoutData;
    if (!w.duration_min) continue;
    const k = weekKey(e.occurred_at);
    const row = weeks.get(k) ?? { week: k };
    row[w.sport] = (row[w.sport] ?? 0) + w.duration_min;
    weeks.set(k, row);
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/** Wochenmittel (Montag als Schlüssel) über Tage mit Wert. Tage ohne Eintrag zählen nicht mit. */
export function weeklyAverages<K extends keyof DayStats>(days: DayStats[], keys: K[]): ({ week: string } & Partial<Record<K, number>>)[] {
  const weeks = new Map<string, { week: string; sums: Record<string, number>; counts: Record<string, number> }>();
  for (const d of days) {
    const wk = weekKey(new Date(d.day + 'T12:00:00'));
    const w = weeks.get(wk) ?? { week: wk, sums: {}, counts: {} };
    for (const k of keys) {
      const v = d[k];
      if (typeof v !== 'number') continue;
      w.sums[k as string] = (w.sums[k as string] ?? 0) + v;
      w.counts[k as string] = (w.counts[k as string] ?? 0) + 1;
    }
    weeks.set(wk, w);
  }
  return [...weeks.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((w) => {
      const row: any = { week: w.week };
      for (const k of keys) if (w.counts[k as string]) row[k] = Math.round((w.sums[k as string] / w.counts[k as string]) * 10) / 10;
      return row;
    });
}

/** Mittelwert einer Kennzahl über Tage mit Wert */
export function average(days: DayStats[], key: keyof DayStats): number | undefined {
  const v = days.map((d) => d[key]).filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : undefined;
}

/** BMI = Gewicht / Größe in Metern zum Quadrat */
export function bmi(weightKg: number | undefined, heightCm: number | null | undefined): number | undefined {
  if (!weightKg || !heightCm) return undefined;
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

// Aktive Kalorien heute schätzen, solange Apple Health den Tag noch nicht geliefert hat (Kurzbefehl läuft morgens).
// Schätzung = üblicher Alltag ohne Training + Training heute (erledigt oder geplant).
// Alltag = Schnitt desselben Wochentags der letzten 3 Wochen (mindestens 2 Werte), sonst Schnitt der letzten 14 Tage.
// Trainingsverbrauch je Minute lernt die App aus deinen Apple-Trainings derselben Sportart, sonst Standardwerte.
// Ist der echte Wert von Apple höher, gilt der echte. Reine Funktionen, getestet in tests/energy.test.ts.

import type { Entry, PlanData, Sport, WorkoutData } from '../supabase/functions/_shared/domain';
import type { DayStats } from './stats';
import { matchPlans } from './plans';
import { dayKey } from './time';

/** kcal je Minute, wenn es noch keine eigenen Trainings mit Kalorien gibt (Mann um 85 kg, grob nach MET-Tabellen). */
export const DEFAULT_KCAL_PER_MIN: Record<Sport, number> = { laufen: 11, tennis: 8, capoeira: 9, kraft: 5, rad: 8, schwimmen: 9, mobility: 3, sonstiges: 5 };

/** Median kcal je Minute je Sportart aus Trainings mit Dauer und Kalorien. */
export function kcalPerMinute(entries: Pick<Entry, 'kind' | 'data'>[]): Record<Sport, number> {
  const per = new Map<Sport, number[]>();
  for (const e of entries) {
    if (e.kind !== 'workout') continue;
    const w = e.data as WorkoutData;
    if (!w.kcal || !w.duration_min || w.duration_min < 10) continue;
    const r = w.kcal / w.duration_min;
    if (r < 1 || r > 25) continue;
    per.set(w.sport, [...(per.get(w.sport) ?? []), r]);
  }
  const out = { ...DEFAULT_KCAL_PER_MIN };
  for (const [s, list] of per) {
    const sorted = [...list].sort((a, b) => a - b);
    out[s] = Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
  }
  return out;
}

const workoutKcal = (w: WorkoutData, rates: Record<Sport, number>) => w.kcal ?? (w.duration_min ? w.duration_min * rates[w.sport] : 0);

export interface ActiveEstimate {
  value: number | undefined; // aktive kcal heute, echt oder geschätzt
  estimated: boolean;
  base?: number; // Alltag ohne Training
  baseFrom?: 'wochentag' | '14 tage';
  training?: number; // Training heute, erledigt plus geplant
}

/**
 * days: Tageswerte bis einschließlich heute (letzter Eintrag = heute). entries: Einträge desselben Zeitraums mit Plänen.
 * Alltag = Schnitt der letzten 14 Tage vor heute von (aktive kcal minus Trainings-kcal), nur Tage mit Apple-Wert.
 */
export function estimateActiveToday(days: DayStats[], entries: Entry[], now: Date = new Date()): ActiveEstimate {
  const today = days[days.length - 1];
  const rates = kcalPerMinute(entries);
  const trainingByDay = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'workout') continue;
    const k = dayKey(e.occurred_at);
    trainingByDay.set(k, (trainingByDay.get(k) ?? 0) + workoutKcal(e.data as WorkoutData, rates));
  }
  const withoutTraining = (d: DayStats) => Math.max(0, d.activeKcal! - (trainingByDay.get(d.day) ?? 0));
  const hasValue = (d: DayStats | undefined): d is DayStats => !!d && typeof d.activeKcal === 'number' && d.activeKcal > 0;
  const mean = (l: number[]) => Math.round(l.reduce((a, b) => a + b, 0) / l.length);
  const n = days.length;
  const sameWeekday = [7, 14, 21].map((k) => days[n - 1 - k]).filter(hasValue).map(withoutTraining);
  const recent = days.slice(-15, -1).filter(hasValue).map(withoutTraining);
  const baseFrom = sameWeekday.length >= 2 ? 'wochentag' : recent.length ? '14 tage' : undefined;
  const base = baseFrom === 'wochentag' ? mean(sameWeekday) : baseFrom ? mean(recent) : undefined;

  const key = dayKey(now);
  let training = trainingByDay.get(key) ?? 0;
  for (const s of matchPlans(entries, now)) {
    if (dayKey(s.plan.occurred_at) !== key || s.status === 'erledigt' || s.status === 'ausgefallen') continue;
    const p = s.plan.data as PlanData;
    training += (p.duration_min ?? 60) * rates[p.sport];
  }
  training = Math.round(training);

  const actual = today?.activeKcal;
  if (base === undefined) return { value: actual, estimated: false, training };
  const estimate = base + training;
  if (actual !== undefined && actual >= estimate) return { value: actual, estimated: false, base, baseFrom, training };
  return { value: estimate, estimated: true, base, baseFrom, training };
}

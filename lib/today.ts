// Tagesleiste auf der Startseite: wo stehe ich heute? Reine Funktionen, getestet in tests/today.test.ts.

import type { Entry, PlanData, WorkoutData } from '../supabase/functions/_shared/domain';
import { SPORT_LABEL } from '../supabase/functions/_shared/domain';
import { dailyStats } from './stats';
import { matchPlans } from './plans';
import { addDays, dayKey, formatTime, startOfDay } from './time';

export interface TodaySummary {
  protein?: number; // g heute
  proteinGoal?: number;
  kcal?: number;
  kcalGoal?: number;
  carbs?: number;
  carbsGoal?: number;
  fat?: number;
  fatGoal?: number;
  sleepH?: number; // letzte Nacht
  trainingMin?: number; // heute trainiert
  /** heute noch offene Einheit: "Tennis 18:00" */
  nextPlan?: string;
  /** heute erledigt: "Tennis ✓" */
  donePlan?: string;
}

const sportName = (p: PlanData | WorkoutData) => (p.sport === 'sonstiges' ? p.sport_label ?? 'Training' : SPORT_LABEL[p.sport]);

/** entries: alle Einträge von gestern und heute (Schlaf hängt am Aufwachtag, also heute). */
export function todaySummary(entries: Entry[], goals: { protein?: number | null; kcal?: number | null; carbs?: number | null; fat?: number | null }, now: Date = new Date()): TodaySummary {
  const from = startOfDay(now);
  const to = addDays(from, 1);
  const today = dailyStats(entries, from, to)[0];
  const out: TodaySummary = {
    protein: today?.protein,
    kcal: today?.kcal,
    sleepH: today?.sleepH,
    trainingMin: today?.trainingMin,
    carbs: today?.carbs,
    fat: today?.fat,
    proteinGoal: goals.protein ?? undefined,
    kcalGoal: goals.kcal ?? undefined,
    carbsGoal: goals.carbs ?? undefined,
    fatGoal: goals.fat ?? undefined,
  };
  const key = dayKey(now);
  const states = matchPlans(entries, now).filter((s) => dayKey(s.plan.occurred_at) === key);
  const done = states.find((s) => s.status === 'erledigt');
  const open = states
    .filter((s) => s.status === 'geplant' || s.status === 'offen')
    .sort((a, b) => a.plan.occurred_at.localeCompare(b.plan.occurred_at))[0];
  if (done) out.donePlan = sportName(done.plan.data);
  if (open) out.nextPlan = `${sportName(open.plan.data)} ${formatTime(open.plan.occurred_at)}`;
  return out;
}

/** Feste Farben je Nährwert: Protein grün, Kohlenhydrate gelb, Fett rot, Kalorien lila. */
export const MACRO_COLOR = { protein: '#ADFF2F', carbs: '#FBBF24', fat: '#FF375F', kcal: '#8B5CF6' } as const;

/**
 * Stand gegen das Ziel. more = mehr ist gut (Protein), less = weniger ist gut (Kalorien, Kohlenhydrate, Fett).
 * 'ok' = im Rahmen, 'reached' = Protein-Ziel erreicht, 'over' = Grenze überschritten, 'none' = kein Ziel.
 */
export function goalState(value: number | undefined, goal: number | undefined, mode: 'more' | 'less'): 'none' | 'ok' | 'reached' | 'over' {
  if (!goal) return 'none';
  const v = value ?? 0;
  if (mode === 'more') return v >= goal ? 'reached' : 'ok';
  return v > goal ? 'over' : 'ok';
}

/** Anteil 0..1 am Ziel, null ohne Ziel */
export function goalRatio(value: number | undefined, goal: number | undefined): number | null {
  if (!goal) return null;
  return Math.min(1, (value ?? 0) / goal);
}

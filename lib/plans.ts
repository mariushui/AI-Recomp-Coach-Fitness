// Abgleich von geplanten Einheiten mit tatsächlichen Trainings.
// Ein Plan gilt als erledigt, wenn am selben Tag ein Training derselben Sportart existiert.
// Jedes Training erfüllt höchstens einen Plan. Getestet in tests/plans.test.ts.

import type { Entry, PlanData, WorkoutData } from '../supabase/functions/_shared/domain';
import { dayKey, weekKey } from './time';

export type PlanStatus = 'geplant' | 'erledigt' | 'offen' | 'ausgefallen';

export interface PlanState {
  plan: Entry<'plan'>;
  status: PlanStatus;
  workout?: Entry<'workout'>;
}

/** offen = Tag ist vorbei, kein passendes Training, nicht als ausgefallen markiert */
export function matchPlans(entries: Entry[], now: Date = new Date()): PlanState[] {
  const plans = entries.filter((e): e is Entry<'plan'> => e.kind === 'plan' && (e.data as PlanData).status !== 'entfernt').sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const workouts = entries.filter((e): e is Entry<'workout'> => e.kind === 'workout');
  const used = new Set<string>();
  const today = dayKey(now);
  return plans.map((plan) => {
    const p = plan.data as PlanData;
    const day = dayKey(plan.occurred_at);
    const sameDay = workouts.filter((w) => !used.has(w.id) && dayKey(w.occurred_at) === day);
    const match =
      sameDay.find((w) => (w.data as WorkoutData).sport === p.sport && (p.sport !== 'sonstiges' || (w.data as WorkoutData).sport_label === p.sport_label)) ??
      undefined;
    if (match) {
      used.add(match.id);
      return { plan, status: 'erledigt', workout: match };
    }
    if (p.status === 'ausgefallen') return { plan, status: 'ausgefallen' };
    return { plan, status: day < today ? 'offen' : 'geplant' };
  });
}

/** Training aus einem Plan vorbefüllen ("Doch gemacht") */
export function workoutFromPlan(p: PlanData): WorkoutData {
  const { goal, status, skip_reason, ...rest } = p;
  return { ...rest, notes: [rest.notes, goal && `Ziel: ${goal}`].filter(Boolean).join(' · ') || undefined };
}

export interface WeekPlanStats {
  week: string;
  planned: number;
  done: number;
  plannedMin: number;
  doneMin: number;
}

/** Planerfüllung pro Woche. Nur Pläne bis heute zählen, zukünftige verfälschen sonst die Quote. */
export function weeklyPlanStats(states: PlanState[], now: Date = new Date()): WeekPlanStats[] {
  const today = dayKey(now);
  const weeks = new Map<string, WeekPlanStats>();
  for (const s of states) {
    if (dayKey(s.plan.occurred_at) > today) continue;
    const k = weekKey(s.plan.occurred_at);
    const w = weeks.get(k) ?? { week: k, planned: 0, done: 0, plannedMin: 0, doneMin: 0 };
    w.planned++;
    w.plannedMin += s.plan.data.duration_min ?? 0;
    if (s.status === 'erledigt') {
      w.done++;
      w.doneMin += s.workout?.data.duration_min ?? 0;
    }
    weeks.set(k, w);
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}

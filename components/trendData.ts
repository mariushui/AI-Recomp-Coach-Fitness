// Gemeinsame Zeitachse für alle Diagramme im Verlauf.
// Woche und 30 Tage: ein Punkt pro Tag. 90 Tage und Jahr: ein Punkt pro Woche (Mittelwert bzw. Summe).
// Jeder Tag bzw. jede Woche im Zeitraum ist vorhanden, auch ohne Daten.

import type { Entry, PlanData, Sport, WorkoutData } from '../supabase/functions/_shared/domain';
import type { DayStats } from '../lib/stats';
import type { PlanState } from '../lib/plans';
import { addDays, dayKey, startOfDay, weekKey } from '../lib/time';

export type Granularity = 'day' | 'week';
export const granularityFor = (rangeDays: number): Granularity => (rangeDays <= 30 ? 'day' : 'week');

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export interface Bucket {
  key: string; // YYYY-MM-DD (Tag oder Montag der Woche)
  label: string;
  days: string[]; // enthaltene Tage
}

export function buckets(from: Date, to: Date, g: Granularity, rangeDays: number): Bucket[] {
  const out: Bucket[] = [];
  const map = new Map<string, Bucket>();
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    const day = dayKey(d);
    const key = g === 'day' ? day : weekKey(d);
    let b = map.get(key);
    if (!b) {
      const label =
        g === 'week' ? `${key.slice(8, 10)}.${key.slice(5, 7)}.` : rangeDays <= 7 ? `${WD[d.getDay()]} ${d.getDate()}.` : `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
      b = { key, label, days: [] };
      map.set(key, b);
      out.push(b);
    }
    b.days.push(day);
  }
  return out;
}

type NumKey = { [K in keyof DayStats]: DayStats[K] extends number | undefined ? K : never }[keyof DayStats];

/** Kennzahlen pro Bucket: bei Wochen Mittelwert über Tage mit Wert. */
export function aggregate(days: DayStats[], bs: Bucket[], keys: NumKey[]): Record<string, any>[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  return bs.map((b) => {
    const row: Record<string, any> = { key: b.key, label: b.label };
    for (const k of keys) {
      const vals = b.days.map((d) => byDay.get(d)?.[k]).filter((v): v is number => typeof v === 'number');
      if (vals.length) row[k] = Math.round((vals.reduce((a, c) => a + c, 0) / vals.length) * 10) / 10;
    }
    return row;
  });
}

/**
 * Training je Bucket und Sportart in Minuten, dazu der noch offene Plan-Anteil als Schatten:
 * "<sport>" = trainiert, "<sport>_plan" = geplant, aber (noch) nicht trainiert.
 * Leere Buckets bekommen 0, damit keine Lücken entstehen.
 */
export function trainingRows(entries: Entry[], plans: PlanState[], bs: Bucket[], g: Granularity): Record<string, any>[] {
  const keyOf = (iso: string) => (g === 'day' ? dayKey(iso) : weekKey(iso));
  const done = new Map<string, Map<Sport, number>>();
  const planned = new Map<string, Map<Sport, number>>();
  const add = (m: Map<string, Map<Sport, number>>, k: string, s: Sport, v: number) => {
    const inner = m.get(k) ?? new Map();
    inner.set(s, (inner.get(s) ?? 0) + v);
    m.set(k, inner);
  };
  for (const e of entries) {
    if (e.kind !== 'workout') continue;
    const w = e.data as WorkoutData;
    if (w.duration_min) add(done, keyOf(e.occurred_at), w.sport, w.duration_min);
  }
  for (const p of plans) {
    if (p.status === 'ausgefallen') continue;
    const pd = p.plan.data as PlanData;
    if (pd.duration_min) add(planned, keyOf(p.plan.occurred_at), pd.sport, pd.duration_min);
  }
  return bs.map((b) => {
    const row: Record<string, any> = { key: b.key, label: b.label };
    const d = done.get(b.key);
    const p = planned.get(b.key);
    const sports = new Set<Sport>([...(d?.keys() ?? []), ...(p?.keys() ?? [])]);
    for (const s of sports) {
      const dv = d?.get(s) ?? 0;
      const pv = p?.get(s) ?? 0;
      row[s] = dv;
      row[`${s}_plan`] = Math.max(0, pv - dv);
    }
    return row;
  });
}

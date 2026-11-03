// Erholung und Belastung, abgeleitet aus vorhandenen Daten. Reine Funktionen, getestet in tests/recovery.test.ts.
//
// Erholung (0 bis 100, 50 = wie dein eigener Schnitt): HRV, Ruhepuls und Schlafdauer der letzten Nacht
// im Vergleich zum eigenen Mittel der letzten 30 Tage. Jede Abweichung wird als z-Wert (begrenzt auf ±2)
// gewichtet: HRV 50 %, Ruhepuls 30 %, Schlaf 20 %. Fehlt eine Kennzahl, werden die anderen neu gewichtet.
// Mindestens 7 Tage Vergleichswerte je Kennzahl, sonst zählt sie nicht.
//
// Belastung (0 bis 21 pro Tag, Skala wie bei Athlytic): Summe über Trainings von Dauer in Minuten x RPE, geteilt durch 60.
// Ohne RPE gilt 5. Gibt es an einem Tag kein eigenes Training, zählen die Trainingsminuten aus Apple Health mit RPE 5.

import type { Entry, WorkoutData } from '../supabase/functions/_shared/domain';
import type { DayStats } from './stats';
import { dayKey } from './time';

export const BASELINE_DAYS = 30;
export const MIN_BASELINE = 7;
export const STRAIN_MAX = 21;

interface MetricCfg {
  key: 'hrv' | 'restingHr' | 'sleepH';
  weight: number;
  sign: 1 | -1; // 1 = höher ist besser
  minSd: number; // Untergrenze für die Streuung, sonst explodieren kleine Abweichungen
}

const METRICS: MetricCfg[] = [
  { key: 'hrv', weight: 0.5, sign: 1, minSd: 5 },
  { key: 'restingHr', weight: 0.3, sign: -1, minSd: 2 },
  { key: 'sleepH', weight: 0.2, sign: 1, minSd: 0.5 },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function meanSd(values: number[]): { mean: number; sd: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}

/** Erholung für den Tag an Position i, Vergleich mit den bis zu 30 Tagen davor. */
export function recoveryAt(days: DayStats[], i: number): number | undefined {
  const today = days[i];
  if (!today) return undefined;
  let weighted = 0;
  let weightSum = 0;
  for (const m of METRICS) {
    const v = today[m.key];
    if (typeof v !== 'number') continue;
    const base = days
      .slice(Math.max(0, i - BASELINE_DAYS), i)
      .map((d) => d[m.key])
      .filter((x): x is number => typeof x === 'number');
    if (base.length < MIN_BASELINE) continue;
    const { mean, sd } = meanSd(base);
    const z = clamp(((v - mean) / Math.max(sd, m.minSd)) * m.sign, -2, 2);
    weighted += z * m.weight;
    weightSum += m.weight;
  }
  if (weightSum === 0) return undefined;
  return Math.round(clamp(50 + 25 * (weighted / weightSum), 0, 100));
}

/** Erholung für jeden Tag der Liste (undefined, wo Vergleichswerte fehlen). */
export function dailyRecovery(days: DayStats[]): (number | undefined)[] {
  return days.map((_, i) => recoveryAt(days, i));
}

/** Belastung je Tag (Schlüssel YYYY-MM-DD). */
export function dailyStrain(entries: Entry[], days: DayStats[]): Map<string, number> {
  const manual = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'workout') continue;
    const w = e.data as WorkoutData;
    const min = w.duration_min ?? 0;
    if (min <= 0) continue;
    const k = dayKey(e.occurred_at);
    manual.set(k, (manual.get(k) ?? 0) + (min * (w.rpe ?? 5)) / 60);
  }
  const out = new Map<string, number>();
  for (const d of days) {
    let v = manual.get(d.day);
    if (v === undefined && d.exerciseMin) v = (d.exerciseMin * 5) / 60;
    if (v !== undefined) out.set(d.day, Math.round(clamp(v, 0, STRAIN_MAX) * 10) / 10);
  }
  return out;
}

export function recoveryLabel(score: number | undefined): { text: string; color: string } {
  if (score === undefined) return { text: 'noch keine Vergleichswerte', color: '#64748b' };
  if (score >= 67) return { text: 'gut erholt', color: '#ADFF2F' };
  if (score >= 34) return { text: 'mittel', color: '#F59E0B' };
  return { text: 'wenig erholt', color: '#FF375F' };
}

export function strainLabel(strain: number | undefined): string {
  if (strain === undefined || strain === 0) return 'keine Belastung';
  if (strain < 7) return 'leicht';
  if (strain < 14) return 'moderat';
  return 'hoch';
}

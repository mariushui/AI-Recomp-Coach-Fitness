// Erholung und Belastung, abgeleitet aus vorhandenen Daten. Reine Funktionen, getestet in tests/recovery.test.ts.
//
// Erholung (0 bis 100, 50 = wie dein eigener Schnitt): HRV, Ruhepuls und Schlafdauer der letzten Nacht
// im Vergleich zum eigenen Mittel der letzten 30 Tage. Jede Abweichung wird als z-Wert (begrenzt auf ±2)
// gewichtet: HRV 50 %, Ruhepuls 30 %, Schlaf 20 %. Fehlt eine Kennzahl, werden die anderen neu gewichtet.
// Mindestens 7 Tage Vergleichswerte je Kennzahl, sonst zählt sie nicht.
//
// Belastung (0 bis 10 pro Tag): Last = Summe über Trainings von Dauer in Minuten x RPE, dazu Trainingsminuten aus Apple
// Health, die kein Training abdeckt, mit RPE 4. Ohne RPE gilt ein Wert je Sportart (Laufen 7, Tennis 6, Kraft 6, Rad 5,
// Mobility 3). Belastung = 10 x (1 - e^(-Last / 930)). Die Skala steigt unten schnell und wird oben sehr zäh:
// Marathon nahe 10, Mitteldistanz-Triathlon 9,3, 2 h Tennis mit Rad und normalem Tag 6,5 bis 7,5, 1 h lockerer Lauf 3,6.

import type { Entry, Sport, WorkoutData } from '../supabase/functions/_shared/domain';
import type { DayStats } from './stats';
import { dayKey } from './time';

export const BASELINE_DAYS = 30;
export const MIN_BASELINE = 7;
export const STRAIN_MAX = 10;
export const STRAIN_K = 930; // Last, bei der 63 % der Skala erreicht sind

/** Gefühlte Belastung je Sportart, wenn kein RPE diktiert wurde. */
export const DEFAULT_RPE: Record<Sport, number> = { laufen: 7, tennis: 6, capoeira: 6, kraft: 6, schwimmen: 6, rad: 5, sonstiges: 4, mobility: 3 };
export const EXTRA_MINUTES_RPE = 4; // Apple-Trainingsminuten ohne zugehöriges Training (Spaziergang, E-Bike, Alltag)

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

/** Last → Belastung 0 bis 10 */
export function strainFromLoad(load: number): number {
  if (load <= 0) return 0;
  return Math.round(STRAIN_MAX * (1 - Math.exp(-load / STRAIN_K)) * 10) / 10;
}

/** Belastung je Tag (Schlüssel YYYY-MM-DD). */
export function dailyStrain(entries: Entry[], days: DayStats[]): Map<string, number> {
  const load = new Map<string, number>();
  const minutes = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'workout') continue;
    const w = e.data as WorkoutData;
    const min = w.duration_min ?? 0;
    if (min <= 0) continue;
    const k = dayKey(e.occurred_at);
    load.set(k, (load.get(k) ?? 0) + min * (w.rpe ?? DEFAULT_RPE[w.sport] ?? 4));
    minutes.set(k, (minutes.get(k) ?? 0) + min);
  }
  const out = new Map<string, number>();
  for (const d of days) {
    let l = load.get(d.day) ?? 0;
    const extra = (d.exerciseMin ?? 0) - (minutes.get(d.day) ?? 0);
    if (extra > 0) l += extra * EXTRA_MINUTES_RPE;
    if (l > 0) out.set(d.day, strainFromLoad(l));
  }
  return out;
}

/**
 * Zielbereich der Belastung je nach Erholung, wie der Zielkorridor bei Athlytic: gut erholt darf mehr.
 * Erholung 100 → 6,1 bis 8,5, Erholung 74 → 4,6 bis 7,0, Erholung 30 → 2,2 bis 4,6.
 */
export function strainTarget(recovery: number | undefined): { lo: number; hi: number } | undefined {
  if (recovery === undefined) return undefined;
  const lo = Math.round((0.5 + clamp(recovery, 0, 100) * 0.056) * 10) / 10;
  return { lo, hi: Math.round((lo + 2.4) * 10) / 10 };
}

/** Wo steht die Belastung zum Zielbereich? */
export function strainVsTarget(strain: number | undefined, target: { lo: number; hi: number } | undefined): 'unter' | 'im Ziel' | 'über' | undefined {
  if (strain === undefined || !target) return undefined;
  if (strain < target.lo) return 'unter';
  if (strain > target.hi) return 'über';
  return 'im Ziel';
}

export const BALANCE_BAND = 1.2; // halbe Breite des Zielbereichs
export const BALANCE_WINDOW = 7;

/**
 * Balance zwischen Belastung und Erholung, wie "Recovery-Based Training" bei Athlytic:
 * je Tag Belastung minus Mitte des Zielbereichs, davon das gleitende 7-Tage-Mittel.
 * Über +1,2 = Überlastung, unter -1,2 = erholsam, dazwischen passend. Tage ohne Belastung zählen als 0.
 */
export function balanceSeries(days: { recovery?: number; strain?: number }[]): (number | undefined)[] {
  const daily = days.map((d) => {
    const t = strainTarget(d.recovery);
    if (!t) return undefined;
    return (d.strain ?? 0) - (t.lo + t.hi) / 2;
  });
  return daily.map((_, i) => {
    const win = daily.slice(Math.max(0, i - BALANCE_WINDOW + 1), i + 1).filter((v): v is number => v !== undefined);
    if (win.length < 3) return undefined;
    return Math.round((win.reduce((a, b) => a + b, 0) / win.length) * 10) / 10;
  });
}

export function balanceLabel(b: number | undefined): { text: string; color: string } {
  if (b === undefined) return { text: 'noch keine Balance', color: '#64748b' };
  if (b > BALANCE_BAND) return { text: 'Überlastung', color: '#FF375F' };
  if (b < -BALANCE_BAND) return { text: 'erholsam, Luft nach oben', color: '#38BDF8' };
  return { text: 'passend trainiert', color: '#ADFF2F' };
}

/** Farbe je Tag: Belastung unter, im oder über dem Zielbereich, der sich aus der Erholung ergibt. */
export const ZONE_COLOR = { unter: '#64748b', 'im Ziel': '#ADFF2F', über: '#FF6B00' } as const;

export interface Potential {
  days: number; // Tage mit Erholungswert im Fenster
  inTarget: number;
  over: number;
  under: number;
  pct: number; // genutztes Potenzial: Belastung geteilt durch Mitte des Zielbereichs, im Schnitt, 100 = genau die Mitte
  text: string;
  color: string;
}

/**
 * Wie bei Athlytic: Habe ich mein Potenzial genutzt? Letzte 7 Tage mit Erholungswert.
 * Je Tag Belastung / Mitte des Zielbereichs (höchstens 150 %), Ruhetage zählen mit 0 %.
 * Ab 3 Tagen über dem Ziel oder über 115 % im Schnitt: zu viel. Ab 85 %: gut genutzt. Darunter: Luft nach oben.
 */
export function potentialSummary(days: { recovery?: number; strain?: number }[], window = 7): Potential | undefined {
  const list = days.filter((d) => typeof d.recovery === 'number').slice(-window);
  if (!list.length) return undefined;
  let sum = 0;
  let inTarget = 0;
  let over = 0;
  let under = 0;
  for (const d of list) {
    const t = strainTarget(d.recovery)!;
    const s = d.strain ?? 0;
    sum += Math.min(1.5, s / ((t.lo + t.hi) / 2));
    const z = strainVsTarget(s, t);
    if (z === 'im Ziel') inTarget++;
    else if (z === 'über') over++;
    else under++;
  }
  const pct = Math.round((sum / list.length) * 100);
  const [text, color] =
    over >= 3 || pct > 115 ? ['zu viel, Erholung einplanen', '#FF6B00'] : pct >= 85 ? ['Potenzial gut genutzt', '#ADFF2F'] : ['Luft nach oben', '#94a3b8'];
  return { days: list.length, inTarget, over, under, pct, text, color };
}

export const SLEEP_FULL_H = 9; // 9 h Schlaf = 100 %, 7 h 30 = 83 %

/** Schlaf der Nacht in Prozent eines vollen Schlafs. */
export function sleepScore(sleepH: number | undefined): number | undefined {
  if (sleepH === undefined) return undefined;
  return Math.round(clamp(sleepH / SLEEP_FULL_H, 0, 1) * 100);
}

export function recoveryLabel(score: number | undefined): { text: string; color: string } {
  if (score === undefined) return { text: 'noch keine Vergleichswerte', color: '#64748b' };
  if (score >= 67) return { text: 'bereit für Training', color: '#ADFF2F' };
  if (score >= 34) return { text: 'mittel erholt', color: '#F59E0B' };
  return { text: 'wenig erholt, locker', color: '#FF375F' };
}

/** Farbe der Belastung eines Tages, gleich im Ring-Kalender von Verlauf und Kalender. */
export function strainColor(strain: number | undefined): string {
  const l = strainLabel(strain);
  return l === 'leicht' ? '#38BDF8' : l === 'moderat' ? '#FBBF24' : l === 'hoch' ? '#FF6B00' : l === 'sehr hoch' ? '#FF375F' : '#475569';
}

export function strainLabel(strain: number | undefined): string {
  if (strain === undefined || strain === 0) return 'keine Belastung';
  if (strain < 3) return 'leicht';
  if (strain < 6) return 'moderat';
  if (strain < 8.5) return 'hoch';
  return 'sehr hoch';
}

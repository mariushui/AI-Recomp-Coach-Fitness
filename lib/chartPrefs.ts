// Welche Diagramme der Verlauf zeigt. Auswahl in den Einstellungen, gespeichert je Gerät im Browser.

export const CHARTS = [
  { key: 'body', label: 'Gewicht und Körper' },
  { key: 'nutrition', label: 'Ernährung' },
  { key: 'training', label: 'Training und Plan' },
  { key: 'activity', label: 'Aktivität (Schritte, Ringe)' },
  { key: 'heart', label: 'Herz: Ruhepuls, HRV, Cardio-Erholung' },
  { key: 'sleep', label: 'Schlaf' },
  { key: 'vo2', label: 'VO2max und Blutsauerstoff' },
  { key: 'recovery', label: 'Erholung und Belastung' },
] as const;
export type ChartKey = (typeof CHARTS)[number]['key'];

const KEY = 'recomp_trend_charts_v3';

export function loadCharts(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignorieren */
  }
  return new Set(CHARTS.map((c) => c.key));
}

export function saveCharts(charts: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...charts]));
  } catch {
    /* ignorieren */
  }
}

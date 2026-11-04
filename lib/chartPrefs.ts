// Welche Diagramme der Verlauf zeigt und in welcher Reihenfolge. Titel gelten gleich in Verlauf und Einstellungen.
// Gespeichert je Gerät im Browser.

export const CHARTS = [
  { key: 'rings', label: 'Ring-Kalender' },
  { key: 'body', label: 'Gewicht und Körper' },
  { key: 'nutrition', label: 'Ernährung' },
  { key: 'measures', label: 'Umfänge und Hautfalten' },
  { key: 'meals', label: 'Ernährung nach Mahlzeit' },
  { key: 'training', label: 'Training und Plan' },
  { key: 'activity', label: 'Aktivität' },
  { key: 'heart', label: 'Herz' },
  { key: 'sleep', label: 'Schlaf' },
  { key: 'vo2', label: 'VO2max und Blutsauerstoff' },
  { key: 'recovery', label: 'Erholung und Belastung' },
  { key: 'balance', label: 'Potenzial genutzt' },
] as const;
export type ChartKey = (typeof CHARTS)[number]['key'];
export const CHART_LABEL = Object.fromEntries(CHARTS.map((c) => [c.key, c.label])) as Record<ChartKey, string>;

const KEY = 'recomp_trend_charts_v3';
const ORDER_KEY = 'recomp_trend_order_v1';

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

/** Gespeicherte Reihenfolge. Unbekannte Schlüssel fallen weg, neue Diagramme kommen ans Ende. */
export function normalizeOrder(saved: string[] | null | undefined): ChartKey[] {
  const known = new Set<string>(CHARTS.map((c) => c.key));
  const seen = new Set<string>();
  const out: ChartKey[] = [];
  for (const k of saved ?? []) if (known.has(k) && !seen.has(k)) (seen.add(k), out.push(k as ChartKey));
  for (const c of CHARTS) if (!seen.has(c.key)) out.push(c.key);
  return out;
}

export function loadOrder(): ChartKey[] {
  try {
    return normalizeOrder(JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null'));
  } catch {
    return normalizeOrder(null);
  }
}

export function saveOrder(order: string[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    /* ignorieren */
  }
}

/** Element von Position from nach to verschieben. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}

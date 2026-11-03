// Wandelt das Paket des iOS-Kurzbefehls in Tageswerte um.
// Reines TypeScript, getestet in tests/health.test.ts.
//
// Erwartetes Format (siehe docs/KURZBEFEHL.md):
// {
//   "metrics": {
//     "weight":     { "values": "82,4\n82,1", "dates": "2026-11-01T07:12:00+01:00\n..." },
//     "body_fat":   { "values": "...", "dates": "..." },
//     "resting_hr": { "values": "...", "dates": "..." },
//     "hrv":        { "values": "...", "dates": "..." },
//     "vo2max":     { "values": "...", "dates": "..." },
//     "sleep":      { "values": "Kern\nTief\n...", "starts": "...", "ends": "..." }
//   }
// }
// values/dates dürfen Text mit Zeilenumbrüchen oder JSON-Arrays sein.

import type { HealthData, HealthMetric } from './domain.ts';

export interface HealthRow {
  metric: HealthMetric;
  day: string; // YYYY-MM-DD in lokaler Zeit des iPhones
  occurred_at: string; // ISO mit Offset
  external_id: string;
  data: HealthData;
}

export interface HealthParseResult {
  rows: HealthRow[];
  warnings: string[];
}

type PointMetric = 'weight' | 'body_fat' | 'resting_hr' | 'hrv' | 'vo2max';

const POINT_METRICS: Record<PointMetric, { unit: string; pick: 'first' | 'last' | 'mean'; min: number; max: number }> = {
  weight: { unit: 'kg', pick: 'first', min: 25, max: 300 }, // erste Messung des Tages = morgens
  body_fat: { unit: '%', pick: 'first', min: 2, max: 70 },
  resting_hr: { unit: 'bpm', pick: 'last', min: 25, max: 150 },
  hrv: { unit: 'ms', pick: 'mean', min: 5, max: 300 },
  vo2max: { unit: 'ml/kg/min', pick: 'last', min: 10, max: 95 },
};

/** Liest eine Liste aus Text (Zeilen) oder Array. */
export function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (typeof v === 'number') return [String(v)];
  return [];
}

/** "82,4" / "82.4 kg" / "1.234,5" / "0,18" → Zahl */
export function parseNumber(s: string): number | undefined {
  const m = s.match(/-?\d[\d.,\s]*/);
  if (!m) return undefined;
  let t = m[0].replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) {
    // das letzte Zeichen von beiden ist der Dezimaltrenner
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = t.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // deutsche Tausenderpunkte
  }
  t = t.replace(/[.,]$/, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Akzeptiert ISO 8601 ("2026-11-01T07:12:00+01:00"). Gibt lokalen Tag und normierten ISO-String zurück. */
export function parseDate(s: string): { day: string; iso: string; ms: number } | undefined {
  const t = s.trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(:\d{2})?)(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return undefined;
  const offset = m[5] ? (m[5] === 'Z' ? 'Z' : m[5].includes(':') ? m[5] : `${m[5].slice(0, 3)}:${m[5].slice(3)}`) : 'Z';
  const time = m[3] ? m[2] : `${m[2]}:00`;
  const iso = `${m[1]}T${time}${offset}`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  return { day: m[1], iso, ms };
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function parsePointMetric(metric: PointMetric, block: any, warnings: string[]): HealthRow[] {
  const cfg = POINT_METRICS[metric];
  const values = toList(block?.values);
  const dates = toList(block?.dates);
  if (values.length === 0) return [];
  if (values.length !== dates.length) {
    warnings.push(`${metric}: ${values.length} Werte, aber ${dates.length} Datumsangaben. Übersprungen.`);
    return [];
  }
  const byDay = new Map<string, { v: number; iso: string; ms: number }[]>();
  values.forEach((raw, i) => {
    let v = parseNumber(raw);
    const d = parseDate(dates[i]);
    if (v === undefined || !d) {
      warnings.push(`${metric}: Zeile ${i + 1} nicht lesbar ("${raw}" / "${dates[i]}").`);
      return;
    }
    // Körperfett kommt je nach Kurzbefehl als 0,18 oder 18
    if (metric === 'body_fat' && v > 0 && v < 1) v = v * 100;
    if (v < cfg.min || v > cfg.max) {
      warnings.push(`${metric}: Wert ${v} außerhalb des plausiblen Bereichs. Übersprungen.`);
      return;
    }
    const list = byDay.get(d.day) ?? [];
    list.push({ v, iso: d.iso, ms: d.ms });
    byDay.set(d.day, list);
  });

  const rows: HealthRow[] = [];
  for (const [day, list] of byDay) {
    list.sort((a, b) => a.ms - b.ms);
    let value: number;
    let at: string;
    if (cfg.pick === 'first') {
      value = list[0].v;
      at = list[0].iso;
    } else if (cfg.pick === 'last') {
      value = list[list.length - 1].v;
      at = list[list.length - 1].iso;
    } else {
      value = list.reduce((s, x) => s + x.v, 0) / list.length;
      at = list[list.length - 1].iso;
    }
    rows.push({
      metric,
      day,
      occurred_at: at,
      external_id: `${metric}:${day}`,
      data: { metric, value: round(value, 1), unit: cfg.unit },
    });
  }
  return rows;
}

type Stage = 'core' | 'deep' | 'rem' | 'asleep' | 'awake' | 'in_bed';

export function sleepStage(label: string): Stage | undefined {
  const l = label.toLowerCase();
  if (/(kern|core)/.test(l)) return 'core';
  if (/(tief|deep)/.test(l)) return 'deep';
  if (/rem/.test(l)) return 'rem';
  if (/(wach|awake)/.test(l)) return 'awake';
  if (/(im bett|in bed|inbed)/.test(l)) return 'in_bed';
  if (/(schlaf|asleep|unspecified|nicht angegeben)/.test(l)) return 'asleep';
  return undefined;
}

/** Länge der Vereinigung von Intervallen in Minuten. Verhindert Doppelzählung bei mehreren Quellen (Watch + App). */
export function unionMinutes(intervals: [number, number][]): number {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [a, b] of sorted) {
    if (a > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else if (b > curEnd) {
      curEnd = b;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total / 60000;
}

function parseSleep(block: any, warnings: string[]): HealthRow[] {
  const values = toList(block?.values);
  const starts = toList(block?.starts);
  const ends = toList(block?.ends);
  if (values.length === 0) return [];
  if (values.length !== starts.length || values.length !== ends.length) {
    warnings.push(`sleep: ${values.length} Werte, ${starts.length} Starts, ${ends.length} Enden. Übersprungen.`);
    return [];
  }
  // Nacht = Tag, an dem das Intervall endet
  const nights = new Map<string, { stage: Stage; a: number; b: number; endIso: string }[]>();
  values.forEach((label, i) => {
    const stage = sleepStage(label);
    const s = parseDate(starts[i]);
    const e = parseDate(ends[i]);
    if (!stage || !s || !e) {
      warnings.push(`sleep: Zeile ${i + 1} nicht lesbar ("${label}").`);
      return;
    }
    const list = nights.get(e.day) ?? [];
    list.push({ stage, a: s.ms, b: e.ms, endIso: e.iso });
    nights.set(e.day, list);
  });

  const rows: HealthRow[] = [];
  for (const [day, list] of nights) {
    const asleepStages: Stage[] = ['core', 'deep', 'rem', 'asleep'];
    const asleep = unionMinutes(list.filter((x) => asleepStages.includes(x.stage)).map((x) => [x.a, x.b]));
    const stages: HealthData['stages'] = {};
    for (const st of ['core', 'deep', 'rem', 'awake', 'in_bed'] as Stage[]) {
      const m = unionMinutes(list.filter((x) => x.stage === st).map((x) => [x.a, x.b]));
      if (m > 0) stages[st] = Math.round(m);
    }
    if (asleep <= 0) continue;
    const wake = list.reduce((acc, x) => (x.b > acc.b ? x : acc), list[0]);
    rows.push({
      metric: 'sleep',
      day,
      occurred_at: wake.endIso,
      external_id: `sleep:${day}`,
      data: { metric: 'sleep', value: Math.round(asleep), unit: 'min', stages },
    });
  }
  return rows;
}

export function parseHealthPayload(body: any): HealthParseResult {
  const warnings: string[] = [];
  const metrics = body?.metrics;
  if (!metrics || typeof metrics !== 'object') {
    return { rows: [], warnings: ['Kein Feld "metrics" im Paket gefunden.'] };
  }
  const rows: HealthRow[] = [];
  for (const m of Object.keys(POINT_METRICS) as PointMetric[]) {
    if (metrics[m]) rows.push(...parsePointMetric(m, metrics[m], warnings));
  }
  if (metrics.sleep) rows.push(...parseSleep(metrics.sleep, warnings));
  for (const k of Object.keys(metrics)) {
    if (!(k in POINT_METRICS) && k !== 'sleep') warnings.push(`Unbekannte Kennzahl "${k}" ignoriert.`);
  }
  return { rows, warnings };
}

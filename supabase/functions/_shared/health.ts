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
//     "spo2":       { "values": "0,97\n0,95", "dates": "..." },
//     "steps":      { "values": "...", "dates": "...", "sources": "Apple Watch von Marius\niPhone" },
//     "active_kcal": { "values": "...", "dates": "...", "sources": "..." },   (Bewegen-Ring)
//     "exercise_min": { "values": "...", "dates": "...", "sources": "..." },  (Trainieren-Ring)
//     "sleep":      { "values": "Kern\nTief\n...", "starts": "...", "ends": "..." }
//   },
//   "workouts": { "types": "Tennis\nLaufen", "starts": "...", "ends": "...", "kcal": "412\n380", "distances": "\n5,2 km", "sources": "..." }
// }
// values/dates dürfen Text mit Zeilenumbrüchen oder JSON-Arrays sein.

import type { HealthData, HealthMetric, WorkoutData } from './domain.ts';
import { sportFromActivity } from './workouts.ts';

export interface HealthRow {
  metric: HealthMetric;
  day: string; // YYYY-MM-DD in lokaler Zeit des iPhones
  occurred_at: string; // ISO mit Offset
  external_id: string;
  data: HealthData;
}

/** Training aus Apple Health, wird als Eintrag kind = workout mit source = health gespeichert. */
export interface WorkoutRow {
  day: string;
  occurred_at: string;
  external_id: string; // workout:<Start-ISO>
  data: WorkoutData;
}

export interface HealthParseResult {
  rows: HealthRow[];
  workouts: WorkoutRow[];
  warnings: string[];
}

type PointMetric = 'weight' | 'body_fat' | 'resting_hr' | 'hrv' | 'vo2max' | 'spo2' | 'hr_recovery' | 'glucose' | 'bmi' | 'resp_rate' | 'wrist_temp' | 'lean_mass' | 'walking_hr';

const POINT_METRICS: Record<PointMetric, { unit: string; pick: 'first' | 'last' | 'mean'; min: number; max: number }> = {
  weight: { unit: 'kg', pick: 'first', min: 25, max: 300 }, // erste Messung des Tages = morgens
  body_fat: { unit: '%', pick: 'first', min: 2, max: 70 },
  resting_hr: { unit: 'bpm', pick: 'last', min: 25, max: 150 },
  hrv: { unit: 'ms', pick: 'mean', min: 5, max: 300 },
  vo2max: { unit: 'ml/kg/min', pick: 'last', min: 10, max: 95 },
  spo2: { unit: '%', pick: 'mean', min: 70, max: 100 },
  hr_recovery: { unit: 'bpm', pick: 'last', min: 3, max: 100 }, // Cardio-Erholung: Pulsabfall 1 min nach dem Training
  glucose: { unit: 'mg/dL', pick: 'mean', min: 20, max: 600 }, // Tagesmittel, Werte unter 35 gelten als mmol/L und werden umgerechnet
  bmi: { unit: '', pick: 'first', min: 10, max: 60 },
  resp_rate: { unit: '/min', pick: 'mean', min: 4, max: 40 },
  wrist_temp: { unit: '°C', pick: 'mean', min: -5, max: 45 }, // je nach iOS absolut oder als Abweichung
  lean_mass: { unit: 'kg', pick: 'first', min: 20, max: 150 },
  walking_hr: { unit: 'bpm', pick: 'mean', min: 40, max: 180 },
};

/** Liest eine Liste aus Text (Zeilen) oder Array. */
export function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (typeof v === 'number') return [String(v)];
  return [];
}

/** "82,4" / "82.4 kg" / "1.234,5" / "0,18" → Zahl */
export function parseNumber(s: string, decimalDot = false): number | undefined {
  const m = s.match(/-?\d[\d.,\s]*/);
  if (!m) return undefined;
  let t = m[0].replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) {
    // das letzte Zeichen von beiden ist der Dezimaltrenner
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = t.replace(',', '.');
  } else if (decimalDot ? /^\d{1,3}(\.\d{3}){2,}$/.test(t) : /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // deutsche Tausenderpunkte
  }
  // decimalDot: bei Messwerten wie Gewicht ist "86.154" ein Dezimalwert (Waage mit 3 Nachkommastellen), keine 86.154 kg
  t = t.replace(/[.,]$/, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const MONTHS_DE: Record<string, number> = {
  jan: 1, feb: 2, mär: 3, mar: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12, may: 5,
};

/** Versatz einer Zeitzone in Minuten zu einem UTC-Zeitpunkt, z. B. 60 für Berlin im Winter. */
function zoneOffsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - utcMs) / 60000);
}

/** Lokale Uhrzeit in einer Zeitzone in UTC-Millisekunden und Offset-String umrechnen. */
function localToUtc(y: number, mo: number, d: number, h: number, mi: number, sec: number, tz: string): { ms: number; offset: string } {
  const guess = Date.UTC(y, mo - 1, d, h, mi, sec);
  let off = zoneOffsetMinutes(guess, tz);
  let ms = guess - off * 60000;
  const off2 = zoneOffsetMinutes(ms, tz);
  if (off2 !== off) {
    off = off2;
    ms = guess - off * 60000;
  }
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  return { ms, offset: `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}` };
}

const pad = (n: number) => String(n).padStart(2, '0');

export const DEFAULT_TZ = 'Europe/Berlin';

/**
 * Akzeptiert ISO 8601 ("2026-11-01T07:12:00+01:00") und die Textform, die Kurzbefehle für Datumswerte ausgibt:
 * "01.11.2026, 07:12", "01.11.26, 07:12:34", "1. Nov. 2026 um 07:12", "Nov 1, 2026 at 7:12 AM", "11/1/26, 7:12 AM".
 * Ohne Offset gilt die Zeitzone tz (Standard Europe/Berlin). Gibt lokalen Tag und normierten ISO-String zurück.
 */
export function parseDate(s: string, tz = DEFAULT_TZ): { day: string; iso: string; ms: number } | undefined {
  const t = s.trim().replace(/\u202f|\u00a0/g, ' ');
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(:\d{2})?)(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    const offset = m[5] ? (m[5] === 'Z' ? 'Z' : m[5].includes(':') ? m[5] : `${m[5].slice(0, 3)}:${m[5].slice(3)}`) : 'Z';
    const time = m[3] ? m[2] : `${m[2]}:00`;
    const iso = `${m[1]}T${time}${offset}`;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return undefined;
    return { day: m[1], iso, ms };
  }
  let y: number | undefined, mo: number | undefined, d: number | undefined;
  let rest = '';
  let g: RegExpMatchArray | null;
  if ((g = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4}),?\s+(.*)$/))) {
    // 01.11.2026, 07:12
    d = Number(g[1]); mo = Number(g[2]); y = Number(g[3]); rest = g[4];
  } else if ((g = t.match(/^(\d{1,2})\.\s*([A-Za-zÄäÖöÜü]+)\.?\s+(\d{4}),?\s+(?:um\s+)?(.*)$/))) {
    // 1. Nov. 2026 um 07:12
    d = Number(g[1]); mo = MONTHS_DE[g[2].toLowerCase().slice(0, 3)]; y = Number(g[3]); rest = g[4];
  } else if ((g = t.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4}),?\s+(?:at\s+)?(.*)$/))) {
    // Nov 1, 2026 at 7:12 AM
    mo = MONTHS_DE[g[1].toLowerCase().slice(0, 3)]; d = Number(g[2]); y = Number(g[3]); rest = g[4];
  } else if ((g = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(.*)$/))) {
    // 11/1/26, 7:12 AM
    mo = Number(g[1]); d = Number(g[2]); y = Number(g[3]); rest = g[4];
  }
  if (!y || !mo || !d) return undefined;
  if (y < 100) y += 2000;
  const tm = rest.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!tm) return undefined;
  let h = Number(tm[1]);
  const mi = Number(tm[2]);
  const sec = tm[3] ? Number(tm[3]) : 0;
  if (tm[4]) {
    const pm = tm[4].toUpperCase() === 'PM';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (mo > 12 || d > 31 || h > 23 || mi > 59) return undefined;
  const day = `${y}-${pad(mo)}-${pad(d)}`;
  const { ms, offset } = localToUtc(y, mo, d, h, mi, sec, tz);
  if (!Number.isFinite(ms)) return undefined;
  return { day, iso: `${day}T${pad(h)}:${pad(mi)}:${pad(sec)}${offset}`, ms };
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function parsePointMetric(metric: PointMetric, block: any, warnings: string[], tz: string): HealthRow[] {
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
    let v = parseNumber(raw, true);
    const d = parseDate(dates[i], tz);
    if (v === undefined || !d) {
      warnings.push(`${metric}: Zeile ${i + 1} nicht lesbar ("${raw}" / "${dates[i]}").`);
      return;
    }
    // Körperfett kommt je nach Kurzbefehl als 0,18 oder 18
    if ((metric === 'body_fat' || metric === 'spo2') && v > 0 && v <= 1) v = v * 100;
    if (metric === 'glucose' && v < 35) v = v * 18; // mmol/L nach mg/dL
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

function parseSleep(block: any, warnings: string[], tz: string): HealthRow[] {
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
    const s = parseDate(starts[i], tz);
    const e = parseDate(ends[i], tz);
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

/** Tagessumme je Quelle, die größte Quelle zählt (Schritte, aktive Kalorien, Trainingsminuten). */
type SummedMetric = 'steps' | 'active_kcal' | 'resting_kcal' | 'exercise_min' | 'distance_walk_run' | 'distance_cycling' | 'distance_swim' | 'swim_strokes';
const SUMMED: Record<SummedMetric, string> = { steps: 'Schritte', active_kcal: 'kcal', resting_kcal: 'kcal', exercise_min: 'min', distance_walk_run: 'km', distance_cycling: 'km', distance_swim: 'm', swim_strokes: 'Züge' };

function parseSummed(metric: SummedMetric, unit: string, block: any, warnings: string[], tz: string): HealthRow[] {
  const values = toList(block?.values);
  const dates = toList(block?.dates);
  const sources = toList(block?.sources);
  if (values.length === 0) return [];
  if (values.length !== dates.length) {
    warnings.push(`${metric}: ${values.length} Werte, aber ${dates.length} Datumsangaben. Übersprungen.`);
    return [];
  }
  const withSources = sources.length === values.length;
  if (!withSources) warnings.push(`${metric}: keine Quellen mitgeschickt, iPhone und Watch werden womöglich doppelt gezählt.`);
  const perDay = new Map<string, { bySource: Map<string, number>; lastIso: string; lastMs: number }>();
  values.forEach((raw, i) => {
    const v = parseNumber(raw, unit === 'km' || unit === 'kcal');
    const d = parseDate(dates[i], tz);
    if (v === undefined || !d || v < 0) {
      warnings.push(`${metric}: Zeile ${i + 1} nicht lesbar.`);
      return;
    }
    const day = perDay.get(d.day) ?? { bySource: new Map(), lastIso: d.iso, lastMs: d.ms };
    const src = withSources ? sources[i] : 'alle';
    day.bySource.set(src, (day.bySource.get(src) ?? 0) + v);
    if (d.ms > day.lastMs) {
      day.lastMs = d.ms;
      day.lastIso = d.iso;
    }
    perDay.set(d.day, day);
  });
  const rows: HealthRow[] = [];
  for (const [day, info] of perDay) {
    const max = Math.max(...info.bySource.values());
    const value = unit === 'km' ? Math.round(max * 100) / 100 : Math.round(max);
    rows.push({ metric, day, occurred_at: info.lastIso, external_id: `${metric}:${day}`, data: { metric, value, unit } });
  }
  return rows;
}

/** Wie toList, aber leere Zeilen bleiben erhalten, damit die Position zu den anderen Listen passt (Trainings ohne Distanz). */
function toRows(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim());
  if (typeof v === 'string') return v.split(/\r?\n/).map((x) => x.trim());
  if (typeof v === 'number') return [String(v)];
  return [];
}

/** "5,2 km" / "5230 m" / "5.2" → km. Ohne Einheit: unter 100 = km, sonst Meter. */
export function parseDistanceKm(s: string): number | undefined {
  const v = parseNumber(s);
  if (v === undefined || v <= 0) return undefined;
  const l = s.toLowerCase();
  if (/\bkm\b/.test(l)) return Math.round(v * 100) / 100;
  if (/\bmi\b|meile/.test(l)) return Math.round(v * 1.609344 * 100) / 100;
  if (/\bm\b/.test(l) || v >= 100) return Math.round((v / 1000) * 100) / 100;
  return Math.round(v * 100) / 100;
}

/** "1:06:52" / "28:09" / "3721" (Sekunden) / "62 min" → Minuten */
export function parseDurationMin(s: string): number | undefined {
  const t = s.trim();
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (m) return Math.round(((Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) / 60) * 10) / 10;
  const v = parseNumber(t);
  if (v === undefined || v <= 0) return undefined;
  if (/min/.test(t.toLowerCase())) return Math.round(v * 10) / 10;
  if (/\bh\b|std/.test(t.toLowerCase())) return Math.round(v * 60);
  // nackte Zahl: Kurzbefehle gibt Dauern in Sekunden aus
  return Math.round((v / 60) * 10) / 10;
}

function parseWorkouts(block: any, warnings: string[], tz: string): WorkoutRow[] {
  const types = toRows(block?.types);
  const starts = toRows(block?.starts);
  const ends = toRows(block?.ends);
  if (types.every((t) => !t)) return [];
  if (types.length !== starts.length) {
    warnings.push(`workouts: ${types.length} Trainings, aber ${starts.length} Startzeiten. Übersprungen.`);
    return [];
  }
  const n = types.length;
  const opt = (key: string) => {
    const l = toRows(block?.[key]);
    return l.length === n ? l : null;
  };
  const endList = ends.length === n ? ends : null;
  const kcal = opt('kcal');
  const dist = opt('distances');
  const dur = opt('durations');
  const hr = opt('avg_hr');
  const rows: WorkoutRow[] = [];
  const seen = new Set<string>();
  types.forEach((label, i) => {
    if (!label && !starts[i]) return;
    const s = parseDate(starts[i], tz);
    if (!s) {
      warnings.push(`workouts: Zeile ${i + 1}, Startzeit nicht lesbar ("${starts[i]}").`);
      return;
    }
    const e = endList && endList[i] ? parseDate(endList[i], tz) : undefined;
    let duration_min: number | undefined;
    if (e && e.ms > s.ms) duration_min = Math.round((e.ms - s.ms) / 60000);
    else if (dur && dur[i]) duration_min = parseDurationMin(dur[i]);
    if (duration_min !== undefined && (duration_min < 1 || duration_min > 600)) {
      warnings.push(`workouts: Zeile ${i + 1}, Dauer ${duration_min} min unplausibel. Übersprungen.`);
      return;
    }
    const external_id = `workout:${s.iso}`;
    if (seen.has(external_id)) return;
    seen.add(external_id);
    const data: WorkoutData = {
      ...sportFromActivity(label),
      session_type: 'training',
      duration_min,
      kcal: kcal && kcal[i] ? parseNumber(kcal[i]) : undefined,
      distance_km: dist && dist[i] ? parseDistanceKm(dist[i]) : undefined,
      avg_hr: hr && hr[i] ? parseNumber(hr[i]) : undefined,
      notes: `Apple Health: ${label.trim()}`,
    };
    for (const k of Object.keys(data) as (keyof WorkoutData)[]) if (data[k] === undefined) delete data[k];
    if (data.kcal !== undefined) data.kcal = Math.round(data.kcal);
    rows.push({ day: s.day, occurred_at: s.iso, external_id, data });
  });
  return rows;
}

export function parseHealthPayload(body: any): HealthParseResult {
  const warnings: string[] = [];
  const metrics = body?.metrics;
  if (!metrics || typeof metrics !== 'object') {
    return { rows: [], workouts: [], warnings: ['Kein Feld "metrics" im Paket gefunden.'] };
  }
  // Optionales Feld tz (IANA), falls das iPhone in einer anderen Zeitzone steht.
  let tz = DEFAULT_TZ;
  if (typeof body.tz === 'string' && body.tz.trim()) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: body.tz.trim() });
      tz = body.tz.trim();
    } catch {
      warnings.push(`Zeitzone "${body.tz}" unbekannt, ${DEFAULT_TZ} verwendet.`);
    }
  }
  const rows: HealthRow[] = [];
  for (const m of Object.keys(POINT_METRICS) as PointMetric[]) {
    if (metrics[m]) rows.push(...parsePointMetric(m, metrics[m], warnings, tz));
  }
  if (metrics.sleep) rows.push(...parseSleep(metrics.sleep, warnings, tz));
  for (const m of Object.keys(SUMMED) as SummedMetric[]) {
    if (metrics[m]) rows.push(...parseSummed(m, SUMMED[m], metrics[m], warnings, tz));
  }
  for (const k of Object.keys(metrics)) {
    if (!(k in POINT_METRICS) && k !== 'sleep' && !(k in SUMMED)) warnings.push(`Unbekannte Kennzahl "${k}" ignoriert.`);
  }
  // Trainings: "workouts" plus Kandidaten "workouts2" (zwei Varianten im Kurzbefehl, eine davon liefert).
  const workouts: WorkoutRow[] = [];
  const ids = new Set<string>();
  for (const key of ['workouts', 'workouts2']) {
    if (!body[key]) continue;
    for (const w of parseWorkouts(body[key], warnings, tz)) {
      if (ids.has(w.external_id)) continue;
      ids.add(w.external_id);
      workouts.push(w);
    }
  }
  return { rows, workouts, warnings };
}

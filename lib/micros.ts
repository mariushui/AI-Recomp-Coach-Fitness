// Mikronährstoffe: Tagessummen, Schnitt über Tage, Ampel gegen den Tageswert.
// Werte sind KI-Schätzungen je Mahlzeit, deshalb zeigt die App immer, wie viele Mahlzeiten einen Wert hatten.
// Reine Funktionen, getestet in tests/micros.test.ts.

import { MICROS, type Entry, type MealData, type MicroKey, type Micros } from '../supabase/functions/_shared/domain';
import { dayKey } from './time';

/** Summe mehrerer Mikronährstoff-Objekte. Nur Schlüssel, die mindestens einmal vorkommen. */
export function sumMicros(list: (Micros | undefined)[]): Micros | undefined {
  const out: Micros = {};
  for (const m of list) {
    if (!m) continue;
    for (const k of Object.keys(m) as MicroKey[]) {
      const v = m[k];
      if (typeof v === 'number') out[k] = Math.round(((out[k] ?? 0) + v) * 100) / 100;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export interface MicroDay {
  day: string;
  micros: Micros;
  meals: number; // Mahlzeiten an dem Tag
  withMicros: number; // davon mit Mikro-Schätzung
}

/** Tagessummen je Tag (YYYY-MM-DD). */
export function microsByDay(entries: Pick<Entry, 'kind' | 'occurred_at' | 'data'>[]): Map<string, MicroDay> {
  const out = new Map<string, MicroDay>();
  for (const e of entries) {
    if (e.kind !== 'meal') continue;
    const k = dayKey(e.occurred_at);
    const d = out.get(k) ?? { day: k, micros: {}, meals: 0, withMicros: 0 };
    d.meals++;
    const m = (e.data as MealData).micros;
    if (m) {
      d.withMicros++;
      d.micros = sumMicros([d.micros, m]) ?? {};
    }
    out.set(k, d);
  }
  return out;
}

/** Mittel je Nährstoff über Tage mit mindestens einer Mikro-Schätzung. */
export function averageMicros(days: MicroDay[]): { micros: Micros; days: number } {
  const used = days.filter((d) => d.withMicros > 0);
  const out: Micros = {};
  if (!used.length) return { micros: out, days: 0 };
  for (const m of MICROS) {
    const sum = used.reduce((a, d) => a + (d.micros[m.key] ?? 0), 0);
    if (sum > 0) out[m.key] = Math.round((sum / used.length) * 100) / 100;
  }
  return { micros: out, days: used.length };
}

export type MicroZone = 'gut' | 'knapp' | 'wenig' | 'zu viel';

/**
 * Ampel gegen den Tageswert.
 * Mindestwerte: ab 100 % gut, ab 66 % knapp, darunter wenig. Höchstwerte: bis 100 % gut, darüber zu viel.
 */
export function microZone(key: MicroKey, value: number | undefined): { zone: MicroZone; pct: number; color: string } | undefined {
  const def = MICROS.find((m) => m.key === key)!;
  if (value === undefined) return undefined;
  const pct = Math.round((value / def.ref) * 100);
  if (def.dir === 'max') return pct <= 100 ? { zone: 'gut', pct, color: '#ADFF2F' } : { zone: 'zu viel', pct, color: '#FF375F' };
  if (pct >= 100) return { zone: 'gut', pct, color: '#ADFF2F' };
  if (pct >= 66) return { zone: 'knapp', pct, color: '#FBBF24' };
  return { zone: 'wenig', pct, color: '#FF6B00' };
}

export const fmtMicro = (key: MicroKey, v: number | undefined) => {
  if (v === undefined) return '';
  const def = MICROS.find((m) => m.key === key)!;
  const digits = v < 1 ? 2 : v < 10 ? 1 : 0;
  return `${v.toLocaleString('de-DE', { maximumFractionDigits: digits })} ${def.unit}`;
};

/** Ø der Mikronährstoffe über die 7 Tage bis einschließlich day (Tage mit Schätzung). */
export function microsWeekAverage(byDay: Map<string, MicroDay>, day: string): { micros: Micros; days: number } {
  const from = new Date(day + 'T12:00:00');
  from.setDate(from.getDate() - 7);
  const fromKey = dayKey(from);
  return averageMicros([...byDay.values()].filter((d) => d.day <= day && d.day > fromKey));
}

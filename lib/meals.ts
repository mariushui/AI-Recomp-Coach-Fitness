// Ernährung nach Mahlzeit: wie viel Protein, Kohlenhydrate, Fett und kcal kommen zum Frühstück, mittags, abends
// und aus Snacks? Reine Funktionen, getestet in tests/meals.test.ts.

import type { Entry, MealData } from '../supabase/functions/_shared/domain';
import { dayKey } from './time';

export const SLOTS = ['fruehstueck', 'mittag', 'abend', 'snack'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { fruehstueck: 'Frühstück', mittag: 'Mittag', abend: 'Abend', snack: 'Snacks' };
export const SLOT_COLOR: Record<Slot, string> = { fruehstueck: '#5EEAD4', mittag: '#38BDF8', abend: '#6366F1', snack: '#F9A8D4' }; // bewusst andere Farben als die Makros

export type Macro = 'protein' | 'carbs' | 'fat' | 'kcal';
type Totals = Record<Macro, number>;
const zero = (): Totals => ({ protein: 0, carbs: 0, fat: 0, kcal: 0 });

/** Lokale Uhrzeit in Minuten seit Mitternacht, aus dem ISO-String mit Offset. */
const minutesOfDay = (iso: string) => {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 12 * 60;
};

/**
 * Mahlzeit einem Zeitfenster zuordnen. meal_type hat Vorrang, Shakes und Ergänzungen zählen zu Snacks.
 * Ohne meal_type entscheidet die Uhrzeit: bis 10:59 Frühstück, 11 bis 15:59 Mittag, 17 bis 21:59 Abend, sonst Snack.
 */
export function slotOf(e: Pick<Entry, 'occurred_at' | 'data'>): Slot {
  const t = (e.data as MealData).meal_type;
  if (t === 'fruehstueck' || t === 'mittag' || t === 'abend') return t;
  if (t === 'snack' || t === 'shake' || t === 'ergaenzung') return 'snack';
  const m = minutesOfDay(e.occurred_at);
  if (m < 11 * 60) return 'fruehstueck';
  if (m < 16 * 60) return 'mittag';
  if (m >= 17 * 60 && m < 22 * 60) return 'abend';
  return 'snack';
}

export interface SlotRow {
  slot: Slot;
  avg: Totals; // Mittel pro Tag mit Essen
  share: number; // Anteil an den kcal, 0..1
  proteinHits: number; // Anzahl Mahlzeiten mit mindestens 30 g Protein
  meals: number;
}

/** Durchschnitt je Zeitfenster über alle Tage, an denen überhaupt etwas gegessen wurde. */
export function mealBreakdown(entries: Entry[]): { rows: SlotRow[]; days: number; proteinMealsPerDay: number } {
  const perSlot: Record<Slot, Totals> = { fruehstueck: zero(), mittag: zero(), abend: zero(), snack: zero() };
  const meals: Record<Slot, number> = { fruehstueck: 0, mittag: 0, abend: 0, snack: 0 };
  const hits: Record<Slot, number> = { fruehstueck: 0, mittag: 0, abend: 0, snack: 0 };
  const days = new Set<string>();
  for (const e of entries) {
    if (e.kind !== 'meal') continue;
    const d = e.data as MealData;
    const s = slotOf(e);
    days.add(dayKey(e.occurred_at));
    meals[s]++;
    if ((d.protein_g ?? 0) >= 30) hits[s]++;
    perSlot[s].protein += d.protein_g ?? 0;
    perSlot[s].carbs += d.carbs_g ?? 0;
    perSlot[s].fat += d.fat_g ?? 0;
    perSlot[s].kcal += d.kcal ?? 0;
  }
  const n = days.size || 1;
  const kcalTotal = SLOTS.reduce((a, s) => a + perSlot[s].kcal, 0);
  const rows = SLOTS.map((slot) => ({
    slot,
    avg: {
      protein: Math.round(perSlot[slot].protein / n),
      carbs: Math.round(perSlot[slot].carbs / n),
      fat: Math.round(perSlot[slot].fat / n),
      kcal: Math.round(perSlot[slot].kcal / n),
    },
    share: kcalTotal ? perSlot[slot].kcal / kcalTotal : 0,
    proteinHits: hits[slot],
    meals: meals[slot],
  }));
  const allHits = SLOTS.reduce((a, s) => a + hits[s], 0);
  return { rows, days: days.size, proteinMealsPerDay: Math.round((allHits / n) * 10) / 10 };
}

/** Je Zeiteinheit (Tag oder Woche) die Summe eines Nährwerts pro Zeitfenster. key(iso) liefert den Schlüssel der Zeile. */
export function slotSeries(entries: Entry[], macro: Macro, key: (iso: string) => string): Map<string, Record<Slot, number>> {
  const out = new Map<string, Record<Slot, number>>();
  const field: Record<Macro, keyof MealData> = { protein: 'protein_g', carbs: 'carbs_g', fat: 'fat_g', kcal: 'kcal' };
  for (const e of entries) {
    if (e.kind !== 'meal') continue;
    const v = (e.data as MealData)[field[macro]];
    if (typeof v !== 'number') continue;
    const k = key(e.occurred_at);
    const row = out.get(k) ?? { fruehstueck: 0, mittag: 0, abend: 0, snack: 0 };
    row[slotOf(e)] += v;
    out.set(k, row);
  }
  return out;
}

export interface MacroSplit {
  protein: number; // Anteil an den Makro-kcal in Prozent
  carbs: number;
  fat: number;
  kcal: number; // kcal aus den drei Makros (Protein und KH 4, Fett 9)
}

/** Verteilung der Makros nach Kalorien, auf 100 % gerechnet. */
export function splitOf(g: { protein: number; carbs: number; fat: number }): MacroSplit | undefined {
  const p = g.protein * 4;
  const c = g.carbs * 4;
  const f = g.fat * 9;
  const total = p + c + f;
  if (!(total > 0)) return undefined;
  const pp = Math.round((p / total) * 100);
  const fp = Math.round((f / total) * 100);
  return { protein: pp, fat: fp, carbs: 100 - pp - fp, kcal: Math.round(total) };
}

/** Je Zeiteinheit die Makro-Verteilung der gewählten Mahlzeiten. key(iso) liefert den Schlüssel der Zeile. */
export function macroSplitSeries(entries: Entry[], slots: Set<Slot>, key: (iso: string) => string): Map<string, MacroSplit> {
  const sums = new Map<string, { protein: number; carbs: number; fat: number }>();
  for (const e of entries) {
    if (e.kind !== 'meal' || !slots.has(slotOf(e))) continue;
    const d = e.data as MealData;
    const k = key(e.occurred_at);
    const s = sums.get(k) ?? { protein: 0, carbs: 0, fat: 0 };
    s.protein += d.protein_g ?? 0;
    s.carbs += d.carbs_g ?? 0;
    s.fat += d.fat_g ?? 0;
    sums.set(k, s);
  }
  const out = new Map<string, MacroSplit>();
  for (const [k, s] of sums) {
    const sp = splitOf(s);
    if (sp) out.set(k, sp);
  }
  return out;
}

/** Verteilung je Mahlzeit über den ganzen Zeitraum, um zu sehen, welche Mahlzeit vom Ziel abweicht. */
export function splitBySlot(entries: Entry[]): Partial<Record<Slot, MacroSplit>> {
  const out: Partial<Record<Slot, MacroSplit>> = {};
  for (const s of SLOTS) {
    const one = macroSplitSeries(entries, new Set([s]), () => 'alle').get('alle');
    if (one) out[s] = one;
  }
  return out;
}

/** Zielverteilung aus den Zielen in Gramm. Fehlen KH- oder Fett-Ziel: Fett 30 % der kcal, Rest KH. */
export function targetSplit(goals: { protein?: number | null; carbs?: number | null; fat?: number | null; kcal?: number | null }): MacroSplit | undefined {
  if (goals.protein && goals.carbs && goals.fat) return splitOf({ protein: goals.protein, carbs: goals.carbs, fat: goals.fat });
  if (goals.protein && goals.kcal) {
    const fat = (goals.kcal * 0.3) / 9;
    const carbs = Math.max(0, (goals.kcal - goals.protein * 4 - fat * 9) / 4);
    return splitOf({ protein: goals.protein, carbs, fat });
  }
  return undefined;
}

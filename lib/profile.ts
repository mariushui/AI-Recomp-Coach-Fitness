import { supabase } from './supabase';

export interface Profile {
  display_name?: string | null;
  height_cm?: number | null;
  protein_goal_g?: number | null; // Tagesziel Protein in g
  kcal_goal?: number | null; // Tagesziel Kalorien
  birth_date?: string | null; // YYYY-MM-DD
  carbs_goal_g?: number | null;
  fat_goal_g?: number | null;
  energy_mode?: EnergyMode | null; // Ziel-Modus
  kcal_adjust_pct?: number | null; // Abweichung vom Verbrauch in %, negativ = Defizit
}

const COLUMNS = 'display_name, height_cm, protein_goal_g, kcal_goal, birth_date, carbs_goal_g, fat_goal_g, energy_mode, kcal_adjust_pct';

export type EnergyMode = 'recomp' | 'abnehmen' | 'halten' | 'masse';

/**
 * Ziel-Modi mit Empfehlung aus der Literatur (docs/literatur/studien.md):
 * - Nr. 6, Helms, Aragon, Fitschen 2014: Gewichtsverlust 0,5 bis 1 % pro Woche, um Muskeln zu erhalten.
 * - Nr. 14, Iraki et al. 2019: Überschuss 10 bis 20 %, Fortgeschrittene eher 5 bis 10 %, Zunahme 0,25 bis 0,5 % pro Woche.
 * - Recomposition: kleineres Defizit als beim Abnehmen, damit Muskeln trotz Defizit wachsen können (Ableitung, keine eigene Studie).
 * Protein bleibt in allen Modi bei 2 g je kg Magermasse (Vorgabe Marius).
 */
export const ENERGY_MODES: Record<EnergyMode, { label: string; pct: number; min: number; max: number; rate: string; text: string }> = {
  recomp: {
    label: 'Body Recomposition',
    pct: -10,
    min: -15,
    max: -5,
    rate: 'Gewicht −0 bis −0,5 % pro Woche, Taille sinkt, Kraft steigt',
    text: 'Leichtes Defizit von 5 bis 15 %. Fett geht langsam runter, mit viel Protein und Krafttraining bleiben oder wachsen die Muskeln. Passt bei mittlerem Körperfett und regelmäßigem Krafttraining.',
  },
  abnehmen: {
    label: 'Abnehmen',
    pct: -20,
    min: -25,
    max: -15,
    rate: 'Gewicht −0,5 bis −1 % pro Woche',
    text: 'Deutliches Defizit von 15 bis 25 %. Schneller Fettverlust, Muskeln schützen hohes Protein und weiter schweres Krafttraining. Über 1 % pro Woche geht es meist auf Kosten von Muskeln und Leistung.',
  },
  halten: {
    label: 'Gewicht halten',
    pct: 0,
    min: -5,
    max: 5,
    rate: 'Gewicht ±0,25 % pro Woche',
    text: 'Essen auf Höhe des Verbrauchs. Gut für Wettkampfphasen, Urlaub oder als Pause zwischen Defizit und Aufbau.',
  },
  masse: {
    label: 'Massephase',
    pct: 10,
    min: 5,
    max: 15,
    rate: 'Gewicht +0,25 bis +0,5 % pro Woche',
    text: 'Leichter Überschuss für Muskelaufbau, Trainierte eher 5 bis 10 %. Größerer Überschuss bringt kaum mehr Muskeln, aber mehr Fett. Taille im Blick behalten.',
  },
};

/** Gewählte Anpassung in Prozent: eigener Wert, sonst Standard des Modus, sonst 0. */
export function adjustPct(p: Pick<Profile, 'energy_mode' | 'kcal_adjust_pct'>): number {
  if (typeof p.kcal_adjust_pct === 'number') return p.kcal_adjust_pct;
  return p.energy_mode ? ENERGY_MODES[p.energy_mode].pct : 0;
}

export async function loadProfile(userId?: string): Promise<Profile> {
  const uid = userId ?? (await supabase.auth.getSession()).data.session?.user.id;
  if (!uid) return {};
  const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', uid).maybeSingle();
  if (error) throw error;
  return (data ?? {}) as Profile;
}

export async function saveProfile(userId: string, patch: Profile): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

/**
 * Vorschlag fürs Protein-Ziel bei Recomposition: 2 g pro kg Muskelmasse, auf 5 g gerundet.
 * Basis ist die Muskelmasse der Waage (zieht nur Fett und Knochen ab, entspricht fast der fettfreien Masse).
 * Fehlt sie, die gerechnete fettfreie Masse (Gewicht minus Fett).
 */
export function suggestedProteinGoal(massKg: number | undefined): number | undefined {
  if (!massKg || massKg < 20) return undefined;
  return Math.round((massKg * 2) / 5) * 5;
}

/**
 * Welche Masse als Protein-Basis gilt. Waagen zeigen "Muskeln" unterschiedlich: Withings und ähnliche als fettfreie Masse
 * ohne Knochen (etwa 90 % der fettfreien Masse), andere als Skelettmuskulatur (etwa 40 % des Gewichts).
 * Nur die erste Lesart taugt als Basis. Liegt der Waagenwert unter 75 % der fettfreien Masse, zählt die fettfreie Masse.
 */
export function proteinBasis(muscleKg: number | undefined, leanMassKg: number | undefined): { value: number; label: string } | undefined {
  if (muscleKg && (!leanMassKg || muscleKg >= leanMassKg * 0.75)) return { value: muscleKg, label: 'Muskelmasse laut Waage' };
  if (leanMassKg) return { value: leanMassKg, label: 'fettfreie Masse' };
  return undefined;
}

/**
 * Vorschlag fürs Kalorien-Ziel = geschätzter Verbrauch.
 * Grundumsatz nach Katch-McArdle (370 + 21,6 x fettfreie Masse), plus 10 % Verdauung, plus aktive Kalorien aus Apple Health.
 * Auf 50 kcal gerundet. Ohne fettfreie Masse kein Vorschlag.
 */
export function suggestedKcalGoal(leanMassKg: number | undefined, avgActiveKcal: number | undefined): number | undefined {
  if (!leanMassKg || leanMassKg < 20) return undefined;
  const bmr = 370 + 21.6 * leanMassKg;
  return Math.round((bmr * 1.1 + (avgActiveKcal ?? 0)) / 50) * 50;
}

/**
 * Vorschlag für Fett und Kohlenhydrate aus Kalorien- und Protein-Ziel:
 * Fett 30 % der Kalorien (9 kcal je g), der Rest Kohlenhydrate (4 kcal je g). Auf 5 g gerundet.
 */
export function suggestedMacroGoals(kcalGoal: number | undefined, proteinGoal: number | undefined): { carbs: number; fat: number } | undefined {
  if (!kcalGoal || !proteinGoal) return undefined;
  const fat = Math.round((kcalGoal * 0.3) / 9 / 5) * 5;
  const carbs = Math.max(20, Math.round((kcalGoal - proteinGoal * 4 - fat * 9) / 4 / 5) * 5);
  return { carbs, fat };
}

/**
 * Kalorienziel für einen Tag: Grundumsatz (Katch-McArdle aus der fettfreien Masse) plus 10 % Verdauung
 * plus die aktiven Kalorien dieses Tages aus Apple Health. Fehlt der Tageswert, zählt der 14-Tage-Schnitt.
 * Ohne fettfreie Masse bleibt es beim festen Ziel aus den Einstellungen.
 * goal = Verbrauch plus Anpassung des Ziel-Modus (z. B. −10 % bei Recomposition), burn = Verbrauch ohne Anpassung.
 */
export function dailyKcalTarget(
  leanMassKg: number | undefined,
  activeToday: number | undefined,
  activeAvg: number | undefined,
  fixedGoal: number | null | undefined,
  pct = 0, // Ziel-Modus: Abweichung vom Verbrauch in Prozent
): { goal: number | undefined; burn?: number; dynamic: boolean } {
  const burn = suggestedKcalGoal(leanMassKg, activeToday ?? activeAvg);
  if (burn !== undefined) return { goal: Math.round((burn * (1 + pct / 100)) / 50) * 50, burn, dynamic: true };
  return { goal: fixedGoal ?? undefined, dynamic: false };
}

/** Alter in Jahren aus dem Geburtsdatum */
export function ageFrom(birthDate: string | null | undefined, now: Date = new Date()): number | undefined {
  if (!birthDate) return undefined;
  const b = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(b.getTime())) return undefined;
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age >= 0 ? age : undefined;
}

import { supabase } from './supabase';

export interface Profile {
  display_name?: string | null;
  height_cm?: number | null;
  protein_goal_g?: number | null; // Tagesziel Protein in g
  kcal_goal?: number | null; // Tagesziel Kalorien
  birth_date?: string | null; // YYYY-MM-DD
  carbs_goal_g?: number | null;
  fat_goal_g?: number | null;
}

const COLUMNS = 'display_name, height_cm, protein_goal_g, kcal_goal, birth_date, carbs_goal_g, fat_goal_g';

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
 */
export function dailyKcalTarget(
  leanMassKg: number | undefined,
  activeToday: number | undefined,
  activeAvg: number | undefined,
  fixedGoal: number | null | undefined,
): { goal: number | undefined; dynamic: boolean } {
  const dyn = suggestedKcalGoal(leanMassKg, activeToday ?? activeAvg);
  if (dyn !== undefined) return { goal: dyn, dynamic: true };
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

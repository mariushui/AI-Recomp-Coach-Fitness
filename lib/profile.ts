import { supabase } from './supabase';

export interface Profile {
  display_name?: string | null;
  height_cm?: number | null;
  protein_goal_g?: number | null; // Tagesziel Protein in g
  kcal_goal?: number | null; // Tagesziel Kalorien
  birth_date?: string | null; // YYYY-MM-DD
}

const COLUMNS = 'display_name, height_cm, protein_goal_g, kcal_goal, birth_date';

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

/** Vorschlag fürs Protein-Ziel bei Recomposition: 2 g pro kg fettfreie Masse (Gewicht minus Fett, nicht die Muskelmasse der Waage), auf 5 g gerundet. */
export function suggestedProteinGoal(leanMassKg: number | undefined): number | undefined {
  if (!leanMassKg || leanMassKg < 20) return undefined;
  return Math.round((leanMassKg * 2) / 5) * 5;
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

/** Alter in Jahren aus dem Geburtsdatum */
export function ageFrom(birthDate: string | null | undefined, now: Date = new Date()): number | undefined {
  if (!birthDate) return undefined;
  const b = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(b.getTime())) return undefined;
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age >= 0 ? age : undefined;
}

import { supabase } from './supabase';

export interface Profile {
  display_name?: string | null;
  height_cm?: number | null;
  protein_goal_g?: number | null; // Tagesziel Protein in g
  kcal_goal?: number | null; // Tagesziel Kalorien
}

const COLUMNS = 'display_name, height_cm, protein_goal_g, kcal_goal';

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

/** Vorschlag fürs Protein-Ziel bei Recomposition: 2 g pro kg Körpergewicht, auf 5 g gerundet. */
export function suggestedProteinGoal(weightKg: number | undefined): number | undefined {
  if (!weightKg || weightKg < 30) return undefined;
  return Math.round((weightKg * 2) / 5) * 5;
}

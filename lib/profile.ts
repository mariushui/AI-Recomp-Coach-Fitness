import { supabase } from './supabase';

export interface Profile {
  display_name?: string | null;
  height_cm?: number | null;
}

export async function loadProfile(userId?: string): Promise<Profile> {
  const uid = userId ?? (await supabase.auth.getSession()).data.session?.user.id;
  if (!uid) return {};
  const { data, error } = await supabase.from('profiles').select('display_name, height_cm').eq('id', uid).maybeSingle();
  if (error) throw error;
  return (data ?? {}) as Profile;
}

export async function saveProfile(userId: string, patch: Profile): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

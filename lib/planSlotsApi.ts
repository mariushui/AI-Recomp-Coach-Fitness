// Datenzugriff für den Wochenplan (Tabelle plan_slots).
import { supabase } from './supabase';
import type { PlanSlot } from '../supabase/functions/_shared/domain';
import { addDays, dayKey } from './time';

export async function listSlots(): Promise<PlanSlot[]> {
  const { data, error } = await supabase.from('plan_slots').select('*').order('weekday').order('time');
  if (error) throw error;
  return ((data ?? []) as any[]).map((s) => ({ ...s, time: String(s.time).slice(0, 5) }));
}

export async function insertSlots(slots: Omit<PlanSlot, 'id'>[]): Promise<void> {
  if (!slots.length) return;
  const { error } = await supabase.from('plan_slots').insert(slots);
  if (error) throw error;
}

export async function updateSlot(id: string, patch: Partial<Omit<PlanSlot, 'id'>>): Promise<void> {
  const { error } = await supabase.from('plan_slots').update(patch).eq('id', id);
  if (error) throw error;
}

/** Einheit beenden statt löschen: vergangene Wochen behalten ihren Plan für die Auswertung. */
export async function endSlots(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const yesterday = dayKey(addDays(new Date(), -1));
  const { error } = await supabase.from('plan_slots').update({ valid_to: yesterday }).in('id', ids);
  if (error) throw error;
}

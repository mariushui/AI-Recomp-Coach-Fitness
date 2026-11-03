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

/**
 * external_ids aller Einträge, die eine Wochenplan-Einheit überschreiben (geändert, verschoben, gestrichen).
 * Unabhängig vom Zeitraum, damit eine in eine andere Woche verschobene Einheit am Ursprungstag nicht erneut erscheint.
 */
export async function listSlotOverrideIds(): Promise<string[]> {
  // Begrenzt auf 1 Jahr zurück, damit die Liste unter dem Supabase-Limit von 1.000 Zeilen bleibt.
  const since = addDays(new Date(), -365).toISOString();
  const { data, error } = await supabase.from('entries').select('external_id').eq('kind', 'plan').like('external_id', 'slot:%').gte('occurred_at', since);
  if (error) throw error;
  return ((data ?? []) as { external_id: string }[]).map((r) => r.external_id);
}

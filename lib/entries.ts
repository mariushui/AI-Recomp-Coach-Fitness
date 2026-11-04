import { supabase } from './supabase';
import type { Entry, NewEntry, WorkoutData } from '../supabase/functions/_shared/domain';
import { mergeWorkoutData, sameSport } from '../supabase/functions/_shared/workouts';
import type { ParseResult } from '../supabase/functions/_shared/parse';
import type { ImageInput } from '../supabase/functions/_shared/image';
import { addDays, dayKey, localIso, startOfDay, timeZone } from './time';

export async function listEntries(from: Date, to: Date): Promise<Entry[]> {
  const out: Entry[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .gte('occurred_at', from.toISOString())
      .lt('occurred_at', to.toISOString())
      .order('occurred_at', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    out.push(...((data ?? []) as Entry[]));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

/** Nur was die Kraft-Seite braucht: Krafteinheiten und Körpergewicht. Klein genug für jeden App-Start. */
export async function listStrengthHistory(days = 400): Promise<Entry[]> {
  const from = addDays(new Date(), -days).toISOString();
  const [w, b, h] = await Promise.all([
    supabase.from('entries').select('*').eq('kind', 'workout').eq('data->>sport', 'kraft').gte('occurred_at', from).order('occurred_at'),
    supabase.from('entries').select('*').eq('kind', 'body').not('data->weight_kg', 'is', null).gte('occurred_at', from).order('occurred_at'),
    supabase.from('entries').select('*').eq('kind', 'health').eq('data->>metric', 'weight').gte('occurred_at', from).order('occurred_at'),
  ]);
  for (const r of [w, b, h]) if (r.error) throw r.error;
  return [...(w.data ?? []), ...(b.data ?? []), ...(h.data ?? [])] as Entry[];
}

export async function listAllEntries(): Promise<Entry[]> {
  return listEntries(new Date('2000-01-01'), new Date('2100-01-01'));
}

export async function insertEntries(entries: NewEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const rest: NewEntry[] = [];
  for (const e of entries) {
    // Kraft aus der Eingabe hat eine eigene external_id (gegen doppeltes Speichern), darf aber trotzdem mit Apple zusammengehen
    const mergeable = !e.external_id || e.external_id.startsWith('kraft:');
    if (e.kind === 'workout' && mergeable && (await mergeIntoAppleWorkout(e as NewEntry<'workout'>))) continue;
    rest.push(e);
  }
  const withExternal = rest.filter((e) => e.external_id);
  const plain = rest.filter((e) => !e.external_id);
  if (plain.length) {
    const { error } = await supabase.from('entries').insert(plain);
    if (error) throw error;
  }
  if (withExternal.length) {
    // Import: gleiche external_id nicht doppelt anlegen
    const { error } = await supabase
      .from('entries')
      .upsert(withExternal, { onConflict: 'user_id,external_id', ignoreDuplicates: true });
    if (error) throw error;
  }
}

/**
 * Diktiertes Training trifft auf ein Training aus Apple Health am selben Tag mit gleicher Sportart:
 * Das Diktat wird Haupteintrag (RPE, Fokus, Übungen), Dauer, Kalorien und Distanz kommen von Apple, wo das Diktat nichts hat.
 * Gibt true zurück, wenn zusammengeführt wurde.
 */
async function mergeIntoAppleWorkout(e: NewEntry<'workout'>): Promise<boolean> {
  const day = startOfDay(new Date(e.occurred_at));
  const { data, error } = await supabase
    .from('entries')
    .select('id, data, occurred_at')
    .eq('kind', 'workout')
    .eq('source', 'health')
    .gte('occurred_at', addDays(day, -1).toISOString())
    .lt('occurred_at', addDays(day, 2).toISOString());
  if (error) throw error; // ohne Netz nicht still weitermachen, sonst landet nichts in der Warteschlange
  if (!data) return false;
  const key = dayKey(e.occurred_at);
  const apple = data.find((a) => dayKey(a.occurred_at) === key && sameSport(e.data, a.data as WorkoutData));
  if (!apple) return false;
  await updateEntry(apple.id, { data: mergeWorkoutData(e.data, apple.data as WorkoutData), source: e.source, raw_text: e.raw_text ?? null });
  return true;
}

export async function updateEntry(id: string, patch: Partial<NewEntry>): Promise<void> {
  const { error } = await supabase.from('entries').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
}

/** Zerlegt Text und optional ein Essensfoto per KI in Einträge. Speichert nichts. */
export async function parseText(text: string, image?: ImageInput | null): Promise<ParseResult> {
  const { data, error } = await supabase.functions.invoke('parse-log', {
    body: { text, now: localIso(), tz: timeZone(), ...(image ? { image } : {}) },
  });
  if (error) {
    let msg = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) msg = body.error;
    } catch {
      /* ignorieren */
    }
    throw new Error(msg);
  }
  return data as ParseResult;
}

import { supabase } from './supabase';
import type { Entry, NewEntry } from '../supabase/functions/_shared/domain';
import type { ParseResult } from '../supabase/functions/_shared/parse';
import type { ImageInput } from '../supabase/functions/_shared/image';
import { localIso, timeZone } from './time';

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

export async function listAllEntries(): Promise<Entry[]> {
  return listEntries(new Date('2000-01-01'), new Date('2100-01-01'));
}

export async function insertEntries(entries: NewEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const withExternal = entries.filter((e) => e.external_id);
  const plain = entries.filter((e) => !e.external_id);
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

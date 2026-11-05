// Einträge sicher speichern, mit Netz direkt, bei Netzproblemen in die Warteschlange.
// Jede Zeile bekommt eine feste Kennung (external_id). Kommt dieselbe Zeile zweimal an, etwa weil die Antwort des Servers
// das iPhone nicht erreicht hat und die App es nochmal versucht, bleibt es bei einem Eintrag.
import type { NewEntry } from '../supabase/functions/_shared/domain';
import { insertEntries } from './entries';
import { enqueue, isNetworkError } from './offlineQueue';
import { withTimeout } from './timeout';

export const SAVE_TIMEOUT_MS = 10_000;

export function withIds(rows: NewEntry[], prefix = 'app'): NewEntry[] {
  const batch = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return rows.map((r, i) => (r.external_id ? r : { ...r, external_id: `${prefix}:${batch}:${i}` }));
}

export async function saveEntries(rows: NewEntry[], prefix = 'app'): Promise<{ queued: boolean }> {
  const list = withIds(rows, prefix);
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
    await withTimeout(insertEntries(list), SAVE_TIMEOUT_MS);
    return { queued: false };
  } catch (e) {
    if (!isNetworkError(e) && (e as Error).message !== 'offline') throw e;
    enqueue(list);
    return { queued: true };
  }
}

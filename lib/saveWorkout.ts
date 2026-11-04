// Training speichern, mit Netz direkt, ohne Netz in die Warteschlange.
// external_id macht das wiederholbar: kommt ein Eintrag doppelt an, bleibt es einer.
import type { NewEntry } from '../supabase/functions/_shared/domain';
import { insertEntries } from './entries';
import { enqueue, isNetworkError } from './offlineQueue';

export async function saveWorkoutEntry(entry: NewEntry): Promise<{ queued: boolean }> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
    // Kellernetz mit einem Balken: nach 8 Sekunden lokal speichern statt warten
    await Promise.race([insertEntries([entry]), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))]);
    return { queued: false };
  } catch (e) {
    if (!isNetworkError(e) && (e as Error).message !== 'offline') throw e;
    enqueue([entry]);
    return { queued: true };
  }
}

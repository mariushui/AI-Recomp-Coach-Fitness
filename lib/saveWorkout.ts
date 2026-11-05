// Training speichern, mit Netz direkt, ohne Netz in die Warteschlange. Siehe lib/saveEntries.ts.
import type { NewEntry } from '../supabase/functions/_shared/domain';
import { saveEntries } from './saveEntries';

export const saveWorkoutEntry = (entry: NewEntry): Promise<{ queued: boolean }> => saveEntries([entry]);

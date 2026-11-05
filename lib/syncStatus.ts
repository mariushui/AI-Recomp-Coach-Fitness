// Letzter Abgleich mit Apple Health: Zeitpunkt des zuletzt gespeicherten Health-Eintrags.
import { supabase } from './supabase';

export const SHORTCUT_NAME = 'Recomp Health';
export const SHORTCUT_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
/** Ab so vielen Stunden ohne Abgleich zeigt die Startseite den Hinweis. */
export const SYNC_STALE_HOURS = 12;

export async function lastSync(): Promise<Date | undefined> {
  const { data, error } = await supabase.from('entries').select('created_at').eq('source', 'health').order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  const at = data?.[0]?.created_at;
  return at ? new Date(at) : undefined;
}

export const syncAgeHours = (last: Date | undefined, now: Date = new Date()) => (last ? (now.getTime() - last.getTime()) / 3_600_000 : undefined);
export const isStale = (last: Date | undefined, now: Date = new Date()) => {
  const h = syncAgeHours(last, now);
  return h === undefined || h >= SYNC_STALE_HOURS;
};

export function ageText(last: Date | undefined, now: Date = new Date()): string {
  const h = syncAgeHours(last, now);
  if (h === undefined) return 'noch nie';
  if (h < 1) return 'vor weniger als 1 Stunde';
  if (h < 48) return `vor ${Math.floor(h)} ${Math.floor(h) === 1 ? 'Stunde' : 'Stunden'}`;
  return `vor ${Math.floor(h / 24)} Tagen`;
}

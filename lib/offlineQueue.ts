// Warteschlange für Einträge ohne Netz. Speichern legt sie lokal ab, beim nächsten Online-Moment gehen sie raus.
import type { NewEntry } from '../supabase/functions/_shared/domain';

const KEY = 'recomp_offline_queue_v1';

interface Queued {
  id: string; // ID in der Warteschlange
  entry: NewEntry;
  queued_at: string;
}

const read = (): Queued[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};
const write = (q: Queued[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* Speicher voll: Eintrag bleibt nur im Speicher der Seite */
  }
};

export const queuedCount = () => read().length;

export function enqueue(entries: NewEntry[]): void {
  const now = new Date().toISOString();
  const q = read();
  for (const e of entries) {
    const id = `offline:${now}:${Math.random().toString(36).slice(2, 10)}`;
    q.push({ id, entry: e, queued_at: now });
  }
  write(q);
}

let running: Promise<number> | null = null;

/**
 * Schickt alles aus der Warteschlange. Gibt die Anzahl erfolgreich gespeicherter Einträge zurück.
 * Läuft schon ein Versand, wartet der zweite Aufruf darauf, statt doppelt zu senden.
 */
export function flush(send: (entries: NewEntry[]) => Promise<void>): Promise<number> {
  if (running) return running;
  running = (async () => {
    const q = read();
    if (q.length === 0) return 0;
    try {
      await send(q.map((x) => x.entry));
      // nur die gesendeten entfernen, falls inzwischen etwas Neues dazukam
      const sent = new Set(q.map((x) => x.id));
      write(read().filter((x) => !sent.has(x.id)));
      return q.length;
    } catch {
      return 0;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Netzfehler erkennen (fetch schlägt fehl, Gerät offline). Fachliche Fehler der Datenbank gehören nicht dazu. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((e as any)?.message ?? e).toLowerCase();
  return /failed to fetch|load failed|network|fetch failed|timeout/.test(msg);
}

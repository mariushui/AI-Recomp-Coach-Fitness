// Aufgaben im Hintergrund: Text oder Foto erkennen und speichern, Nährwerte neu berechnen. Du trägst derweil weiter ein.
// Liegt im Gerätespeicher, damit nichts verloren geht, wenn iOS die App pausiert. Beim nächsten Start geht es weiter.
// Eine Aufgabe nach der anderen, damit die KI nicht doppelt belastet wird.
import { supabase } from './supabase';
import { parseText, updateEntry } from './entries';
import { saveEntries } from './saveEntries';
import { withTimeout } from './timeout';
import { normalizeData, type EntrySource, type NewEntry } from '../supabase/functions/_shared/domain';
import type { ImageInput } from '../supabase/functions/_shared/image';
import { localIso } from './time';
import { KIND_LABEL } from '../supabase/functions/_shared/domain';
import { applyRecalc } from './nutritionRecalc';

export interface Job {
  id: string;
  type?: 'recalc' | 'parse'; // ohne Angabe: recalc (ältere Aufgaben)
  entryId?: string; // recalc: welche Mahlzeit
  text: string;
  label: string; // kurz, für den Hinweis
  tries: number;
  source?: EntrySource; // parse: Herkunft der Einträge
  now?: string; // parse: Zeitpunkt der Eingabe, damit "heute morgen" stimmt, auch wenn es später läuft
  hasImage?: boolean; // parse: Foto liegt nur im Speicher der Seite
  // parse: Ergebnis der KI, gemerkt. Schlägt danach nur das Speichern fehl, läuft die KI nicht nochmal und es entsteht nichts doppelt.
  rows?: NewEntry[];
  summary?: string;
  questions?: string[];
}
export type JobEvent =
  | { type: 'done'; job: Job; summary?: string; questions?: string[] }
  | { type: 'error'; job: Job; message: string }
  | { type: 'change' };

// Fotos sind zu groß für den Gerätespeicher. Sie liegen nur im Speicher der offenen Seite.
const images = new Map<string, ImageInput>();

const KEY = 'recomp_bg_jobs_v1';
const MAX_TRIES = 3;
// Zeitlimits: die KI-Funktion bricht nach 55 s selbst ab, danach lohnt kein Warten mehr.
const AI_TIMEOUT_MS = 60_000;
const DB_TIMEOUT_MS = 15_000;

const read = (): Job[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};
const write = (jobs: Job[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs));
  } catch {
    /* Speicher voll */
  }
};

const listeners = new Set<(e: JobEvent) => void>();
const emit = (e: JobEvent) => listeners.forEach((l) => l(e));
export function subscribeJobs(fn: (e: JobEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const pendingJobs = (): Job[] => read();

const patchJob = (id: string, patch: Partial<Job>) => write(read().map((j) => (j.id === id ? { ...j, ...patch } : j)));

/** Neue Aufgabe. Eine ältere für dieselbe Mahlzeit fällt weg, die neue hat den aktuellen Text. */
export function addRecalcJob(entryId: string, text: string, label: string): void {
  const job: Job = { id: `${entryId}:${Date.now()}`, type: 'recalc', entryId, text, label, tries: 0 };
  write([...read().filter((j) => j.entryId !== entryId), job]);
  emit({ type: 'change' });
  void runJobs();
}

/** Text (und optional Foto) erkennen lassen und die Einträge direkt speichern. */
export function addParseJob(text: string, source: EntrySource, image?: ImageInput | null): void {
  const id = `parse:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
  if (image) images.set(id, image);
  const job: Job = { id, type: 'parse', text, label: text.slice(0, 30) || 'Foto', tries: 0, source, now: localIso(), hasImage: !!image };
  write([...read(), job]);
  emit({ type: 'change' });
  void runJobs();
}

/**
 * Erkennen und speichern. Gibt eine kurze Zusammenfassung und die Rückfragen der KI zurück.
 * Zwei Schritte: erst die KI (Ergebnis wird im Auftrag gemerkt), dann das Speichern mit festen Kennungen.
 * Ein Wiederholungsversuch macht nur den Schritt nach, der noch fehlt.
 */
async function runParse(job: Job): Promise<{ summary: string; questions: string[] }> {
  let { rows, summary, questions } = job;
  if (!rows) {
    const image = images.get(job.id);
    if (job.hasImage && !image) throw new Error('Das Foto ging verloren, weil die App zwischendurch geschlossen war. Bitte nochmal aufnehmen.');
    const r = await withTimeout(parseText(job.text, image ?? null, job.now), AI_TIMEOUT_MS);
    const found: NewEntry[] = [];
    for (const e of r.entries) {
      const data = normalizeData(e.kind, e.data);
      if (data) found.push({ kind: e.kind, occurred_at: e.occurred_at, data, source: job.source ?? 'text', raw_text: job.text || null });
    }
    if (!found.length) {
      if (!job.text.trim()) throw new Error('Auf dem Foto wurde kein Essen erkannt.');
      found.push({ kind: 'note', occurred_at: job.now ?? localIso(), data: { text: job.text }, source: job.source ?? 'text', raw_text: job.text });
    }
    // Feste Kennung je Eintrag: dieselbe Zeile zweimal gesendet ergibt einen Eintrag
    rows = found.map((x, i) => ({ ...x, external_id: `${job.id}:${i}` }));
    const names = rows.map((x) => (x.kind === 'meal' ? ((x.data as any).description ?? 'Mahlzeit').split(/[,:]/)[0].slice(0, 24) : KIND_LABEL[x.kind]));
    summary = r.entries.length ? `Gespeichert: ${names.join(', ')}` : 'Nichts erkannt, als Notiz gespeichert';
    questions = r.questions ?? [];
    patchJob(job.id, { rows, summary, questions });
  }
  const { queued } = await saveEntries(rows);
  images.delete(job.id);
  return { summary: queued ? `${summary!.replace('Gespeichert', 'Auf dem Gerät gespeichert')}, wird gesendet` : summary!, questions: questions ?? [] };
}

let running = false;

/** Arbeitet die Liste ab. Ohne Netz bleibt alles liegen und läuft beim nächsten Online-Moment weiter. */
export async function runJobs(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = read()[0];
      if (!job) break;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      try {
        if (job.type === 'parse') {
          const { summary, questions } = await runParse(job);
          write(read().filter((j) => j.id !== job.id));
          emit({ type: 'done', job, summary, questions });
          continue;
        }
        const r = await withTimeout(parseText(job.text, null, undefined, 'nutrition'), AI_TIMEOUT_MS);
        const meals = r.entries.filter((e) => e.kind === 'meal').map((e) => e.data as any);
        if (!meals.length) throw new Error('Keine Nährwerte erkannt.');
        // Aktuellen Stand holen, damit inzwischen gemachte Änderungen nicht überschrieben werden
        const { data: row, error } = await withTimeout(Promise.resolve(supabase.from('entries').select('data').eq('id', job.entryId!).maybeSingle()), DB_TIMEOUT_MS);
        if (error) throw error;
        if (row) await withTimeout(updateEntry(job.entryId!, { data: applyRecalc(row.data, meals) }), DB_TIMEOUT_MS);
        write(read().filter((j) => j.id !== job.id));
        emit({ type: 'done', job });
      } catch (e) {
        if (job.type === 'parse' && /Tageslimit/.test(String((e as Error)?.message))) {
          write(read().filter((j) => j.id !== job.id));
          emit({ type: 'error', job, message: (e as Error).message });
          continue;
        }
        const tries = job.tries + 1;
        const message = e instanceof Error ? e.message : 'KI nicht erreichbar.';
        if (tries >= MAX_TRIES || message.includes('Foto ging verloren')) {
          write(read().filter((j) => j.id !== job.id));
          emit({ type: 'error', job, message });
        } else {
          // ans Ende stellen und kurz warten, oft ist die KI nur kurz überlastet.
          // Den frischen Stand nehmen: darin steckt das gemerkte KI-Ergebnis, sonst liefe die KI beim Wiederholen nochmal.
          const fresh = read().find((j) => j.id === job.id) ?? job;
          write([...read().filter((j) => j.id !== job.id), { ...fresh, tries }]);
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
    }
  } finally {
    running = false;
    emit({ type: 'change' });
  }
}

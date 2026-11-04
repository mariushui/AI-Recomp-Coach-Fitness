// Kraft-Eingabe für den Keller: funktioniert ohne Netz.
// Graue Schattenwerte = letzte Einheit (sonst Vorlage). Leere Felder übernehmen den Schatten.
// Gespeichert werden nur Sätze mit Haken. Tippen in ein Feld setzt den Haken automatisch.
import React, { useEffect, useMemo, useState } from 'react';
import { SESSION_KINDS, SESSION_KIND_LABEL, type Entry, type NewEntry, type SessionKind, type SetEntry, type StrengthSet, type WorkoutData } from '../supabase/functions/_shared/domain';
import { MUSCLES, MUSCLE_LABEL, addCustomExercise, allExercises, exerciseById, searchExercises, type Exercise, type LoadMode, type Muscle } from '../lib/exercises';
import { exerciseKey, lastSets, resolveSet, summarizeSets } from '../lib/strength';
import { appendToCache, clearDraft, loadDraft, loadTemplates, saveDraft, upsertTemplate, type StrengthTemplate } from '../lib/strengthTemplates';
import { insertEntries } from '../lib/entries';
import { enqueue, isNetworkError } from '../lib/offlineQueue';
import { localIso } from '../lib/time';
import { Button, ErrorBox } from './ui';
import { Icons } from './icons';

interface DraftSet {
  reps: string;
  weight: string;
  warmup: boolean;
  done: boolean;
}
interface DraftExercise {
  exercise_id: string;
  name: string;
  sets: DraftSet[];
  fallback: SetEntry[]; // Startwerte aus der Vorlage, falls es keine letzte Einheit gibt
}
export interface StrengthDraft {
  templateId?: string;
  templateName?: string;
  kind: SessionKind;
  startedAt: string;
  exercises: DraftExercise[];
  rpe: string;
}

const LOAD_HINT: Record<LoadMode, string> = {
  gesamt: 'kg',
  paar: 'kg je Hand',
  koerper: '± kg',
  ohne: '',
};

const fmt = (n?: number) => (n === undefined ? '' : n.toLocaleString('de-DE'));
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });

/** Neuer Entwurf aus einer Vorlage. Satzanzahl = letzte Einheit, sonst Vorlage. */
export function draftFromTemplate(t: StrengthTemplate | null, history: Entry[]): StrengthDraft {
  const exercises = (t?.exercises ?? []).map((x) => {
    const last = lastSets(history, x.exercise_id);
    const count = Math.max(1, (last ?? x.sets).length);
    return { exercise_id: x.exercise_id, name: x.name, fallback: x.sets, sets: Array.from({ length: count }, (_, i) => ({ reps: '', weight: '', warmup: !!(last ?? x.sets)[i]?.warmup, done: false })) };
  });
  return { templateId: t?.id, templateName: t?.name, kind: t?.kind ?? 'einzel', startedAt: localIso(), exercises, rpe: '' };
}

const StrengthLogger: React.FC<{
  history: Entry[];
  initial: StrengthDraft;
  onClose: () => void;
  onSaved: (queued: boolean) => void;
}> = ({ history, initial, onClose, onSaved }) => {
  const [draft, setDraft] = useState<StrengthDraft>(initial);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepTemplate, setKeepTemplate] = useState(false);
  const exercises = useMemo(() => allExercises(), [picker]);

  // Jeder Tastendruck landet sofort im Speicher des Geräts. App zu, Akku leer: nichts geht verloren.
  useEffect(() => saveDraft(draft), [draft]);

  const shadowsFor = (ex: DraftExercise): SetEntry[] => lastSets(history, ex.exercise_id, draft.startedAt) ?? ex.fallback;
  const lastInfo = (ex: DraftExercise) => {
    const before = new Date(draft.startedAt).getTime();
    const sessions = history
      .filter((e) => e.kind === 'workout' && new Date(e.occurred_at).getTime() < before)
      .filter((e) => (e.data as WorkoutData).exercises?.some((x) => exerciseKey(x, exercises) === ex.exercise_id))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return sessions[0]?.occurred_at;
  };

  const patchSet = (ei: number, si: number, patch: Partial<DraftSet>) =>
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((ex, i) => (i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => (j !== si ? s : { ...s, ...patch })) })),
    }));
  const addSet = (ei: number) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.map((ex, i) => (i !== ei ? ex : { ...ex, sets: [...ex.sets, { reps: '', weight: '', warmup: false, done: false }] })) }));
  const removeSet = (ei: number, si: number) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.map((ex, i) => (i !== ei ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== si) })) }));
  const removeExercise = (ei: number) => setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== ei) }));
  const moveExercise = (ei: number, dir: -1 | 1) =>
    setDraft((d) => {
      const list = [...d.exercises];
      const j = ei + dir;
      if (j < 0 || j >= list.length) return d;
      [list[ei], list[j]] = [list[j], list[ei]];
      return { ...d, exercises: list };
    });
  const addExercise = (x: Exercise) => {
    const last = lastSets(history, x.id);
    const count = Math.max(3, last?.length ?? 0);
    setDraft((d) => ({
      ...d,
      exercises: [...d.exercises, { exercise_id: x.id, name: x.name, fallback: [], sets: Array.from({ length: count }, (_, i) => ({ reps: '', weight: '', warmup: !!last?.[i]?.warmup, done: false })) }],
    }));
    setPicker(false);
  };

  const doneCount = draft.exercises.reduce((a, ex) => a + ex.sets.filter((s) => s.done).length, 0);

  const save = async () => {
    setError(null);
    const list: StrengthSet[] = [];
    for (const ex of draft.exercises) {
      const shadows = shadowsFor(ex);
      const sets = ex.sets
        .map((s, i) => (s.done ? resolveSet({ reps: s.reps, weight: s.weight, warmup: s.warmup }, shadows[i] ?? shadows[shadows.length - 1]) : undefined))
        .filter(Boolean) as SetEntry[];
      if (!sets.length) continue;
      const work = sets.filter((s) => !s.warmup);
      list.push({ exercise: ex.name, exercise_id: ex.exercise_id, set_list: sets, sets: work.length, reps: work[0]?.reps, weight_kg: work[0]?.weight_kg });
    }
    if (!list.length) return setError('Noch kein Satz abgehakt. Tippe auf den Haken neben einem Satz, dann speichern.');
    const minutes = Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 60000);
    const rpe = Number(draft.rpe.replace(',', '.'));
    const data: WorkoutData = {
      sport: 'kraft',
      session_type: 'training',
      session_kind: draft.kind,
      ...(draft.templateName ? { template: draft.templateName } : {}),
      ...(minutes >= 5 && minutes <= 240 ? { duration_min: minutes } : {}),
      ...(rpe >= 1 && rpe <= 10 ? { rpe } : {}),
      exercises: list,
    };
    // external_id macht das Speichern wiederholbar: kommt der Eintrag doppelt an, bleibt es einer
    const entry: NewEntry = { kind: 'workout', occurred_at: draft.startedAt, source: 'manual', external_id: `kraft:${draft.startedAt}`, data };
    setSaving(true);
    let queued = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
      // Kellernetz mit einem Balken: nach 8 Sekunden lokal speichern statt warten
      await Promise.race([insertEntries([entry]), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))]);
    } catch (e) {
      if (!isNetworkError(e) && (e as Error).message !== 'offline') {
        setSaving(false);
        return setError((e as Error).message);
      }
      enqueue([entry]);
      queued = true;
    }
    appendToCache({ id: 'lokal-' + draft.startedAt, user_id: '', kind: 'workout', occurred_at: draft.startedAt, source: 'manual', data } as Entry);
    if (keepTemplate) {
      const t: StrengthTemplate = {
        id: draft.templateId ?? 'eigen-' + Date.now(),
        name: draft.templateName ?? (window.prompt('Name der Vorlage', 'Neue Vorlage') || 'Neue Vorlage'),
        kind: draft.kind,
        exercises: list.map((x) => ({ exercise_id: x.exercise_id!, name: x.exercise, sets: x.set_list! })),
      };
      upsertTemplate(t);
    }
    clearDraft();
    setSaving(false);
    onSaved(queued);
  };

  const discard = () => {
    if (doneCount > 0 && !window.confirm('Training verwerfen? Abgehakte Sätze gehen verloren.')) return;
    clearDraft();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 bg-cyber-black overflow-y-auto">
      <div className="sticky top-0 z-10 bg-cyber-black/95 backdrop-blur border-b border-white/5 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3">
        <div className="max-w-xl mx-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="text-xs font-bold text-slate-400 px-1 py-1" aria-label="Minimieren, Training bleibt offen">
            <Icons.Left size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-slate-100 truncate">{draft.templateName ?? 'Freies Training'}</p>
            <p className="text-[11px] text-slate-500">
              {doneCount} Sätze abgehakt · seit {new Date(draft.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <Button variant="green" onClick={save} disabled={saving} className="!py-2">
            {saving ? 'Speichert …' : 'Fertig'}
          </Button>
        </div>
        <div className="max-w-xl mx-auto mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
          {SESSION_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, kind: k }))}
              aria-pressed={draft.kind === k}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${draft.kind === k ? 'text-slate-100 border-cyber-purple bg-cyber-purple/20' : 'text-slate-500 border-white/10'}`}
            >
              {SESSION_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-3 pb-40">
        {error && <ErrorBox>{error}</ErrorBox>}
        <p className="text-[11px] text-slate-500">Grau = letztes Mal. Nur tippen, was sich ändert. Haken = Satz gemacht.</p>

        {draft.exercises.map((ex, ei) => {
          const def = exerciseById(ex.exercise_id, exercises);
          const load = def?.load ?? 'gesamt';
          const shadows = shadowsFor(ex);
          const lastAt = lastInfo(ex);
          return (
            <div key={ex.exercise_id + ei} className="rounded-2xl bg-cyber-gray border border-white/5 p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-100 truncate">{ex.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {def ? MUSCLE_LABEL[def.muscle] : 'eigene Übung'}
                    {load === 'koerper' ? ' · Körpergewicht, Zusatz plus, Band minus' : ''}
                    {lastAt ? ` · zuletzt ${shortDate(lastAt)}: ${summarizeSets(shadows)}` : shadows.length ? ` · Vorlage: ${summarizeSets(shadows)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => moveExercise(ei, -1)} disabled={ei === 0} className="text-slate-500 disabled:opacity-20 px-1" aria-label="Nach oben">
                  ▲
                </button>
                <button type="button" onClick={() => moveExercise(ei, 1)} disabled={ei === draft.exercises.length - 1} className="text-slate-500 disabled:opacity-20 px-1" aria-label="Nach unten">
                  ▼
                </button>
                <button type="button" onClick={() => removeExercise(ei)} className="text-slate-500 px-1" aria-label={`${ex.name} entfernen`}>
                  <Icons.Close size={18} />
                </button>
              </div>

              <div className="mt-2 space-y-1.5">
                {ex.sets.map((s, si) => {
                  const sh = shadows[si] ?? shadows[shadows.length - 1];
                  return (
                    <div key={si} className={`flex items-center gap-1.5 rounded-xl px-1.5 py-1 ${s.done ? 'bg-cyber-green/10' : ''}`}>
                      <button
                        type="button"
                        onClick={() => patchSet(ei, si, { warmup: !s.warmup })}
                        aria-pressed={s.warmup}
                        aria-label={s.warmup ? 'Aufwärmsatz, tippen für Arbeitssatz' : 'Arbeitssatz, tippen für Aufwärmsatz'}
                        className={`h-9 w-9 shrink-0 rounded-lg text-xs font-bold ${s.warmup ? 'bg-amber-400/20 text-amber-300' : 'bg-white/5 text-slate-400'}`}
                      >
                        {s.warmup ? 'W' : si + 1 - ex.sets.slice(0, si).filter((x) => x.warmup).length}
                      </button>
                      {load !== 'ohne' && (
                        <label className="flex-1 min-w-0 flex items-center rounded-lg bg-cyber-black border border-white/10 focus-within:border-cyber-purple">
                          <input
                            inputMode="decimal"
                            value={s.weight}
                            placeholder={fmt(sh?.weight_kg)}
                            onChange={(e) => patchSet(ei, si, { weight: e.target.value, done: true })}
                            className="w-full bg-transparent px-2 py-2 text-base text-slate-100 placeholder-slate-600 focus:outline-none"
                            aria-label={`Satz ${si + 1} Gewicht`}
                          />
                          <span className="pr-2 text-[10px] text-slate-500 whitespace-nowrap">{LOAD_HINT[load]}</span>
                        </label>
                      )}
                      <label className={`${load === 'ohne' ? 'flex-1' : 'w-24 shrink-0'} flex items-center rounded-lg bg-cyber-black border border-white/10 focus-within:border-cyber-purple`}>
                        <input
                          inputMode="numeric"
                          value={s.reps}
                          placeholder={fmt(sh?.reps)}
                          onChange={(e) => patchSet(ei, si, { reps: e.target.value, done: true })}
                          className="w-full bg-transparent px-2 py-2 text-base text-slate-100 placeholder-slate-600 focus:outline-none"
                          aria-label={`Satz ${si + 1} Wiederholungen`}
                        />
                        <span className="pr-2 text-[10px] text-slate-500">Wdh.</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => patchSet(ei, si, { done: !s.done })}
                        aria-pressed={s.done}
                        aria-label={s.done ? 'Satz gemacht, tippen zum Zurücknehmen' : 'Satz gemacht'}
                        className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${s.done ? 'bg-cyber-green text-cyber-black' : 'bg-white/5 text-slate-500'}`}
                      >
                        <Icons.Check size={18} />
                      </button>
                      <button type="button" onClick={() => removeSet(ei, si)} className="h-9 w-6 shrink-0 text-slate-600" aria-label={`Satz ${si + 1} löschen`}>
                        <Icons.Close size={14} className="mx-auto" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => addSet(ei)} className="mt-2 w-full rounded-xl border border-dashed border-white/10 py-2 text-xs font-bold text-slate-400">
                + Satz
              </button>
            </div>
          );
        })}

        <button type="button" onClick={() => setPicker(true)} className="w-full rounded-2xl border border-dashed border-cyber-purple/40 py-3 text-sm font-bold text-cyber-purple">
          + Übung
        </button>

        <div className="rounded-2xl bg-cyber-gray border border-white/5 p-3 space-y-3">
          <label className="flex items-center gap-3">
            <span className="flex-1 text-sm text-slate-300">Wie hart war es? (1 bis 10, optional)</span>
            <input
              inputMode="numeric"
              value={draft.rpe}
              onChange={(e) => setDraft((d) => ({ ...d, rpe: e.target.value }))}
              className="w-16 rounded-lg bg-cyber-black border border-white/10 px-2 py-2 text-base text-center"
              aria-label="Gefühlte Belastung"
            />
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={keepTemplate} onChange={(e) => setKeepTemplate(e.target.checked)} className="h-5 w-5 accent-cyber-purple" />
            <span className="text-sm text-slate-300">{draft.templateName ? `Übungsliste in „${draft.templateName}“ übernehmen` : 'Als neue Vorlage speichern'}</span>
          </label>
          <button type="button" onClick={discard} className="text-xs text-red-300">
            Training verwerfen
          </button>
        </div>
      </div>

      {picker && <ExercisePicker exercises={exercises} onPick={addExercise} onClose={() => setPicker(false)} />}
    </div>
  );
};

/** Übung aus dem Katalog wählen oder eigene anlegen. */
const ExercisePicker: React.FC<{ exercises: Exercise[]; onPick: (x: Exercise) => void; onClose: () => void }> = ({ exercises, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle>('brust');
  const [load, setLoad] = useState<LoadMode>('gesamt');
  const hits = searchExercises(q, exercises);
  const exact = exercises.some((x) => x.name.toLowerCase() === q.trim().toLowerCase());
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onClose}>
      <div className="w-full max-w-xl mx-auto max-h-[85vh] flex flex-col rounded-t-3xl bg-cyber-gray border-t border-white/10 pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 pb-2 flex items-center gap-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Übung suchen oder neu eingeben"
            className="flex-1 rounded-xl bg-cyber-black border border-white/10 px-3 py-2.5 text-base text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-purple"
          />
          <button type="button" onClick={onClose} className="text-slate-400 p-2" aria-label="Schließen">
            <Icons.Close size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4 space-y-1">
          {q.trim() && !exact && (
            <div className="rounded-xl border border-cyber-purple/30 bg-cyber-purple/10 p-3 space-y-2">
              <p className="text-sm font-bold text-slate-100">„{q.trim()}“ als eigene Übung</p>
              <div className="flex gap-2">
                <select value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle)} className="flex-1 rounded-lg bg-cyber-black border border-white/10 px-2 py-2 text-sm" aria-label="Hauptmuskel">
                  {MUSCLES.map((m) => (
                    <option key={m} value={m}>
                      {MUSCLE_LABEL[m]}
                    </option>
                  ))}
                </select>
                <select value={load} onChange={(e) => setLoad(e.target.value as LoadMode)} className="flex-1 rounded-lg bg-cyber-black border border-white/10 px-2 py-2 text-sm" aria-label="Gewicht">
                  <option value="gesamt">Gewicht gesamt</option>
                  <option value="paar">2 Kurzhanteln</option>
                  <option value="koerper">Körpergewicht</option>
                  <option value="ohne">ohne Gewicht</option>
                </select>
              </div>
              <Button onClick={() => onPick(addCustomExercise(q, muscle, load))} className="w-full !py-2">
                Anlegen und hinzufügen
              </Button>
            </div>
          )}
          {hits.map((x) => (
            <button key={x.id} type="button" onClick={() => onPick(x)} className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-white/5">
              <span className="text-sm text-slate-100">{x.name}</span>
              <span className="text-[11px] text-slate-500">{MUSCLE_LABEL[x.muscle]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export { loadDraft, loadTemplates };
export default StrengthLogger;

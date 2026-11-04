// Eingabe für Technik-Sport (Tennis, Capoeira, auch alles andere außer Kraft).
// Bis zu 3 Fokus-Punkte mit Notiz zum Fortschritt, dazu Highlight und Flop. Funktioniert ohne Netz.
import React, { useEffect, useState } from 'react';
import { SPORT_LABEL, type Entry, type NewEntry, type PlanData, type Sport, type WorkoutData } from '../supabase/functions/_shared/domain';
import { focusHistory, loadFocusList, preselectFocus, saveFocusList } from '../lib/trainingPlan';
import { saveWorkoutEntry } from '../lib/saveWorkout';
import { localIso } from '../lib/time';
import { Button, ErrorBox } from './ui';
import { Icons } from './icons';

const DRAFT_KEY = 'recomp_skill_draft_v1';

export interface SkillDraft {
  sport: Sport;
  planAt?: string;
  plannedMin?: number;
  startedAt: string;
  foci: string[];
  focusNotes: Record<string, string>;
  high: string;
  low: string;
  notes: string;
  rpe: string;
  duration: string;
  sessionType: NonNullable<WorkoutData['session_type']>;
}

export const loadSkillDraft = (): SkillDraft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const saveSkillDraft = (d: SkillDraft | null) => {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* egal */
  }
};
export const clearSkillDraft = () => saveSkillDraft(null);

export function newSkillDraft(sport: Sport, plan: Entry<'plan'> | undefined, history: Entry[]): SkillDraft {
  const p = plan?.data as PlanData | undefined;
  const last = [...history]
    .filter((e) => e.kind === 'workout' && (e.data as WorkoutData).sport === sport)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]?.data as WorkoutData | undefined;
  return {
    sport,
    planAt: plan?.occurred_at,
    plannedMin: p?.duration_min,
    startedAt: localIso(),
    foci: preselectFocus(loadFocusList(sport), p, last),
    focusNotes: {},
    high: '',
    low: '',
    notes: '',
    rpe: '',
    duration: '',
    sessionType: p?.session_type ?? 'training',
  };
}

const TYPES: [NonNullable<WorkoutData['session_type']>, string][] = [
  ['training', 'Training'],
  ['stunde', 'Stunde'],
  ['match', 'Match'],
  ['frei', 'Frei'],
];

const area = 'w-full rounded-xl bg-cyber-black border border-white/10 px-3 py-2.5 text-base text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-purple';
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });

const SkillLogger: React.FC<{ initial: SkillDraft; history: Entry[]; onClose: () => void; onSaved: (queued: boolean) => void }> = ({ initial, history, onClose, onSaved }) => {
  const [d, setD] = useState<SkillDraft>(initial);
  const [list, setList] = useState<string[]>(() => loadFocusList(initial.sport));
  const [newFocus, setNewFocus] = useState('');
  const [editList, setEditList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => saveSkillDraft(d), [d]);

  const set = (patch: Partial<SkillDraft>) => setD((x) => ({ ...x, ...patch }));
  const toggle = (f: string) =>
    setD((x) => (x.foci.includes(f) ? { ...x, foci: x.foci.filter((y) => y !== f) } : x.foci.length >= 3 ? x : { ...x, foci: [...x.foci, f] }));
  const addFocus = () => {
    const f = newFocus.trim();
    if (!f || list.includes(f)) return setNewFocus('');
    const next = [...list, f];
    setList(next);
    saveFocusList(d.sport, next);
    setNewFocus('');
    setD((x) => (x.foci.length < 3 ? { ...x, foci: [...x.foci, f] } : x));
  };
  const removeFocus = (f: string) => {
    const next = list.filter((x) => x !== f);
    setList(next);
    saveFocusList(d.sport, next);
    setD((x) => ({ ...x, foci: x.foci.filter((y) => y !== f) }));
  };

  const elapsed = Math.round((Date.now() - new Date(d.startedAt).getTime()) / 60000);
  const durationGuess = d.plannedMin ?? (elapsed >= 10 && elapsed <= 300 ? elapsed : undefined);

  const save = async () => {
    setError(null);
    const num = (v: string) => {
      const n = Number(v.replace(',', '.'));
      return v.trim() && Number.isFinite(n) ? n : undefined;
    };
    const duration = num(d.duration) ?? durationGuess;
    const rpe = num(d.rpe);
    const data: WorkoutData = {
      sport: d.sport,
      session_type: d.sessionType,
      ...(duration ? { duration_min: duration } : {}),
      ...(rpe && rpe >= 1 && rpe <= 10 ? { rpe } : {}),
      ...(d.foci.length ? { focus: d.foci.join(', '), focus_notes: d.foci.map((f) => ({ focus: f, ...(d.focusNotes[f]?.trim() ? { note: d.focusNotes[f].trim() } : {}) })) } : {}),
      ...(d.high.trim() ? { high: d.high.trim() } : {}),
      ...(d.low.trim() ? { low: d.low.trim() } : {}),
      ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
    };
    // Gespeichert wird zum geplanten Termin, wenn es einen gibt und er heute ist, sonst zum Start der Eingabe
    const at = d.planAt && d.planAt.slice(0, 10) === d.startedAt.slice(0, 10) ? d.planAt : d.startedAt;
    const entry: NewEntry = { kind: 'workout', occurred_at: at, source: 'manual', external_id: `training:${d.startedAt}`, data };
    setSaving(true);
    try {
      const { queued } = await saveWorkoutEntry(entry);
      clearSkillDraft();
      onSaved(queued);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    if (!window.confirm('Eingabe verwerfen?')) return;
    clearSkillDraft();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 bg-cyber-black overflow-y-auto">
      <div className="sticky top-0 z-10 bg-cyber-black/95 backdrop-blur border-b border-white/5 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3">
        <div className="max-w-xl mx-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="px-1 py-1 text-slate-400" aria-label="Minimieren, Eingabe bleibt offen">
            <Icons.Left size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-slate-100 truncate">{SPORT_LABEL[d.sport]}</p>
            <p className="text-[11px] text-slate-500">
              seit {new Date(d.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              {d.plannedMin ? ` · geplant ${d.plannedMin} min` : ''}
            </p>
          </div>
          <Button variant="green" onClick={save} disabled={saving} className="!py-2">
            {saving ? 'Speichert …' : 'Fertig'}
          </Button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-3 pb-40">
        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="rounded-2xl bg-cyber-gray border border-white/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Fokus heute, bis zu 3</p>
            <button type="button" onClick={() => setEditList(!editList)} className="text-[11px] text-slate-500">
              {editList ? 'Fertig' : 'Liste bearbeiten'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {list.map((f) => {
              const on = d.foci.includes(f);
              return (
                <span key={f} className="inline-flex">
                  <button
                    type="button"
                    onClick={() => (editList ? removeFocus(f) : toggle(f))}
                    aria-pressed={on}
                    disabled={!editList && !on && d.foci.length >= 3}
                    className={`rounded-full border px-3 py-1.5 text-sm font-bold disabled:opacity-30 ${on ? 'border-cyber-green bg-cyber-green/15 text-slate-100' : 'border-white/10 text-slate-400'}`}
                  >
                    {editList ? `${f} ✕` : f}
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2">
            <input value={newFocus} onChange={(e) => setNewFocus(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFocus()} placeholder="Neuer Fokus, z. B. Volley" className={area + ' !py-2 text-sm'} />
            <Button variant="ghost" onClick={addFocus} className="!py-2 shrink-0">
              Dazu
            </Button>
          </div>
        </div>

        {d.foci.map((f) => {
          const last = focusHistory(history, f, 1)[0];
          return (
            <div key={f} className="rounded-2xl bg-cyber-gray border border-white/5 p-3">
              <p className="font-bold text-slate-100">{f}</p>
              <p className="text-[11px] text-slate-500 mb-2">{last ? `Letztes Mal (${shortDate(last.at)}): ${last.note}` : 'Noch keine Notiz zu diesem Fokus.'}</p>
              <textarea
                rows={2}
                value={d.focusNotes[f] ?? ''}
                onChange={(e) => setD((x) => ({ ...x, focusNotes: { ...x.focusNotes, [f]: e.target.value } }))}
                placeholder="Was lief, was hast du gemerkt?"
                className={area}
                aria-label={`Notiz zu ${f}`}
              />
            </div>
          );
        })}

        <div className="rounded-2xl bg-cyber-gray border border-white/5 p-3 space-y-2">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-cyber-green">↑ Highlight</span>
            <textarea rows={2} value={d.high} onChange={(e) => set({ high: e.target.value })} placeholder="Bester Moment" className={area + ' mt-1'} />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-[#FF6B00]">↓ Flop</span>
            <textarea rows={2} value={d.low} onChange={(e) => set({ low: e.target.value })} placeholder="Was nicht lief" className={area + ' mt-1'} />
          </label>
        </div>

        <div className="rounded-2xl bg-cyber-gray border border-white/5 p-3 space-y-3">
          <div className="flex gap-1.5">
            {TYPES.map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => set({ sessionType: k })}
                aria-pressed={d.sessionType === k}
                className={`flex-1 rounded-full border py-1.5 text-xs font-bold ${d.sessionType === k ? 'border-cyber-purple bg-cyber-purple/20 text-slate-100' : 'border-white/10 text-slate-500'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center rounded-xl bg-cyber-black border border-white/10 focus-within:border-cyber-purple">
              <input inputMode="numeric" value={d.duration} onChange={(e) => set({ duration: e.target.value })} placeholder={durationGuess ? String(durationGuess) : 'Dauer'} className="w-full bg-transparent px-3 py-2.5 text-base placeholder-slate-600 focus:outline-none" aria-label="Dauer in Minuten" />
              <span className="pr-3 text-[11px] text-slate-500">min</span>
            </label>
            <label className="flex items-center rounded-xl bg-cyber-black border border-white/10 focus-within:border-cyber-purple">
              <input inputMode="numeric" value={d.rpe} onChange={(e) => set({ rpe: e.target.value })} placeholder="1 bis 10" className="w-full bg-transparent px-3 py-2.5 text-base placeholder-slate-600 focus:outline-none" aria-label="Wie hart, 1 bis 10" />
              <span className="pr-3 text-[11px] text-slate-500">hart</span>
            </label>
          </div>
          <textarea rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Sonstige Notizen" className={area} />
          <button type="button" onClick={discard} className="text-xs text-red-300">
            Eingabe verwerfen
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkillLogger;

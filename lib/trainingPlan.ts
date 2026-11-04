// Training-Seite: was laut Plan als Nächstes ansteht, welche Kraft-Vorlage dazu gehört, Fokus-Punkte für Technik-Sport.
// Reine Funktionen plus kleiner Gerätespeicher. Getestet in tests/trainingPlan.test.ts.

import type { Entry, FocusNote, PlanData, Sport, WorkoutData } from '../supabase/functions/_shared/domain';
import { matchPlans, type PlanState } from './plans';
import { dayKey } from './time';
import type { StrengthTemplate } from './strengthTemplates';

/** Offene Einheiten ab heute, die nächste zuerst. Erledigte und gestrichene fallen raus. */
export function upcomingSessions(entries: Entry[], now: Date = new Date(), days = 14): PlanState[] {
  const today = dayKey(now);
  const last = dayKey(new Date(now.getTime() + days * 86_400_000));
  return matchPlans(entries, now)
    .filter((s) => s.status === 'geplant' && dayKey(s.plan.occurred_at) >= today && dayKey(s.plan.occurred_at) <= last)
    .sort((a, b) => a.plan.occurred_at.localeCompare(b.plan.occurred_at));
}

/** Schlüssel, unter dem die gewählte Vorlage für eine Plan-Einheit gemerkt wird: je Wochenplan-Einheit, sonst je Eintrag. */
export function planKey(plan: Entry<'plan'>): string {
  const m = plan.external_id?.match(/^slot:([^:]+):/);
  return m ? `slot:${m[1]}` : `plan:${plan.id}`;
}

const KIND_WORDS: [RegExp, StrengthTemplate['kind']][] = [
  [/\bpull\b|zieh|rücken|ruecken|bizeps|hinge/i, 'pull'],
  [/\bpush\b|drück|drueck|brust|trizeps|bank/i, 'push'],
  [/bein|\bleg|unterkörper|unterkoerper|squat|kniebeuge/i, 'beine'],
];

/** Passende Kraft-Vorlage zu einem Plan: gemerkte Wahl, dann Name der Vorlage im Text, dann Stichworte. */
export function matchTemplate(plan: Entry<'plan'>, templates: StrengthTemplate[], memory: Record<string, string> = {}): StrengthTemplate | undefined {
  const remembered = memory[planKey(plan)];
  if (remembered) {
    const t = templates.find((x) => x.id === remembered);
    if (t) return t;
  }
  const p = plan.data as PlanData;
  const text = [p.focus, p.goal, p.notes, p.sport_label].filter(Boolean).join(' ').toLowerCase();
  if (!text) return undefined;
  const byName = templates.find((t) => text.includes(t.name.toLowerCase()));
  if (byName) return byName;
  // erstes Stichwort im Text gewinnt ("Pull, Bizeps, Hinge" ist Pull, auch wenn Hinge vorkommt)
  let best: { pos: number; kind: StrengthTemplate['kind'] } | undefined;
  for (const [re, kind] of KIND_WORDS) {
    const m = text.match(re);
    if (m && m.index !== undefined && (!best || m.index < best.pos)) best = { pos: m.index, kind };
  }
  return best ? templates.find((t) => t.kind === best!.kind) : undefined;
}

// Gerätespeicher: gemerkte Vorlagen je Plan-Einheit und Fokus-Listen je Sportart
const MEMORY_KEY = 'recomp_plan_template_v1';
const FOCUS_KEY = 'recomp_focus_list_v1';
const PLAN_CACHE_KEY = 'recomp_plan_cache_v1';

const read = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* Speicher voll */
  }
};

export const loadTemplateMemory = () => read<Record<string, string>>(MEMORY_KEY, {});
export const rememberTemplate = (plan: Entry<'plan'>, templateId: string) => write(MEMORY_KEY, { ...loadTemplateMemory(), [planKey(plan)]: templateId });

export const DEFAULT_FOCUS: Partial<Record<Sport, string[]>> = {
  tennis: ['Topspin Vorhand', 'Topspin Rückhand', 'Kick-Aufschlag'],
  capoeira: [],
};
export const loadFocusList = (sport: Sport): string[] => read<Partial<Record<Sport, string[]>>>(FOCUS_KEY, DEFAULT_FOCUS)[sport] ?? DEFAULT_FOCUS[sport] ?? [];
export function saveFocusList(sport: Sport, list: string[]): void {
  write(FOCUS_KEY, { ...read<Partial<Record<Sport, string[]>>>(FOCUS_KEY, DEFAULT_FOCUS), [sport]: list });
}

/** Plan der nächsten Tage und Technik-Trainings fürs Training ohne Netz merken. */
export interface TrainingCache {
  range: Entry[]; // Pläne und Trainings von gestern bis in 2 Wochen
  skill: Entry[]; // Tennis und Capoeira, für die Fokus-Notizen
}
export const cacheTraining = (c: TrainingCache) => write(PLAN_CACHE_KEY, c);
export const cachedTraining = (): TrainingCache => read<TrainingCache>(PLAN_CACHE_KEY, { range: [], skill: [] });

/** Vorauswahl der Fokus-Punkte: aus dem Plan-Text, sonst die der letzten Einheit, sonst die ersten 3 der Liste. Höchstens 3. */
export function preselectFocus(list: string[], plan: PlanData | undefined, last: WorkoutData | undefined): string[] {
  const text = (plan?.focus ?? '').toLowerCase();
  // Ganzer Name im Plan ("Kick-Aufschlag") oder ein markantes Wort daraus ("Rückhand" trifft "Topspin Rückhand")
  const words = (f: string) => f.toLowerCase().split(/[\s-]+/).filter((w) => w.length >= 5);
  const fromPlan = text ? list.filter((f) => text.includes(f.toLowerCase()) || words(f).some((w) => text.includes(w))) : [];
  if (fromPlan.length) return fromPlan.slice(0, 3);
  const fromLast = (last?.focus_notes ?? []).map((f) => f.focus).filter((f) => list.includes(f));
  if (fromLast.length) return fromLast.slice(0, 3);
  return list.slice(0, 3);
}

/** Letzte Notizen zu einem Fokus, neueste zuerst. */
export function focusHistory(workouts: Entry[], focus: string, limit = 5): { at: string; note: string }[] {
  const out: { at: string; note: string }[] = [];
  for (const e of [...workouts].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))) {
    if (e.kind !== 'workout') continue;
    const f = ((e.data as WorkoutData).focus_notes ?? []).find((x: FocusNote) => x.focus === focus && x.note);
    if (f) out.push({ at: e.occurred_at, note: f.note! });
    if (out.length >= limit) break;
  }
  return out;
}

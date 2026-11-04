import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Entry, PlanData, PlanSlot } from '../supabase/functions/_shared/domain';
import { normalizeData } from '../supabase/functions/_shared/domain';
import { deleteEntry, insertEntries, listEntries, updateEntry } from '../lib/entries';
import { dailyStats } from '../lib/stats';
import { bodyValues, dayWorkouts, kcalRing, kcalTargetsByDay, proteinRing, strainRing } from '../lib/calendarDay';
import { microsByDay, microsWeekAverage } from '../lib/micros';
import { dailyStrain } from '../lib/recovery';
import { matchPlans, workoutFromPlan, type PlanState, type PlanStatus } from '../lib/plans';
import { addDays, dayKey, formatTime, localIso, startOfDay } from '../lib/time';
import { entryTitle, healthLine, summarize } from '../lib/format';
import { EntryIcon, Icons } from './icons';
import { listSlotOverrideIds, listSlots } from '../lib/planSlotsApi';
import { expandSlots, fromSlot, isVirtual, visiblePlans } from '../lib/planTemplate';
import { ageFrom, loadProfile, maxHeartRate, type Profile } from '../lib/profile';
import EntryEditor, { type Draft } from './EntryEditor';
import { addRecalcJob } from '../lib/backgroundJobs';
import SwipeToDelete from './SwipeToDelete';
import TrainingPlanView from './TrainingPlanView';
import RingCalendar, { type RingDay, type RingDot } from './RingCalendar';
import DaySummary from './DaySummary';
import { Button, Card, ErrorBox } from './ui';

const SPORT_COLOR: Record<string, string> = {
  tennis: '#ADFF2F',
  laufen: '#00F0FF',
  capoeira: '#FF6B00',
  kraft: '#8B5CF6',
  rad: '#38BDF8',
  schwimmen: '#22D3EE',
  mobility: '#F472B6',
  sonstiges: '#94A3B8',
};

const STATUS_LABEL: Record<PlanStatus, { text: string; cls: string }> = {
  geplant: { text: 'geplant', cls: 'bg-white/10 text-slate-300' },
  erledigt: { text: 'erledigt', cls: 'bg-cyber-green/15 text-cyber-green' },
  offen: { text: 'nicht erfasst', cls: 'bg-red-500/15 text-red-300' },
  ausgefallen: { text: 'ausgefallen', cls: 'bg-white/5 text-slate-500 line-through' },
};

const readPref = <T extends string>(key: string, fallback: T, allowed: readonly T[]): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* egal */
  }
};

const weekStart = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

const CalendarView: React.FC<{ refreshKey: number; onChanged: () => void }> = ({ refreshKey, onChanged }) => {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slots, setSlots] = useState<PlanSlot[]>([]);
  const [showPlan, setShowPlan] = useState(false);

  const ws = weekStart(day);
  const wsKey = dayKey(ws);
  const today = startOfDay(new Date());
  const todayKey = dayKey(today);
  const monthKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}`;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ringMode, setRingModeState] = useState<'ernaehrung' | 'training'>(() => readPref('recomp_cal_mode', 'ernaehrung', ['ernaehrung', 'training']));
  const [metric, setMetricState] = useState<'protein' | 'kcal'>(() => readPref('recomp_cal_metric', 'protein', ['protein', 'kcal']));
  const setRingMode = (m: 'ernaehrung' | 'training') => (setRingModeState(m), writePref('recomp_cal_mode', m));
  const setMetric = (m: 'protein' | 'kcal') => (setMetricState(m), writePref('recomp_cal_metric', m));
  const detailRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const first = new Date(`${monthKey}-01T12:00:00`); // lokal, nicht UTC
      const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
      const from = addDays(startOfDay(first), -30); // Vorlauf für Magermasse und Ø 7 Tage
      const to = addDays(weekStart(addDays(next, -1)), 7); // bis zum Ende der letzten Woche des Monats
      const [list, sl, overrides] = await Promise.all([listEntries(from, to), listSlots(), listSlotOverrideIds()]);
      setSlots(sl);
      setEntries(visiblePlans([...list, ...expandSlots(sl, list, from, to, overrides)]));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    loadProfile().then(setProfile).catch(() => undefined);
  }, [refreshKey]);

  const states = useMemo(() => matchPlans(entries), [entries]);
  const dayStr = dayKey(day);
  const dayPlans = states.filter((s) => dayKey(s.plan.occurred_at) === dayStr);
  const dayEntries = entries.filter((e) => e.kind !== 'plan' && dayKey(e.occurred_at) === dayStr);
  const healthEntries = dayEntries.filter((e): e is Entry<'health'> => e.kind === 'health');
  const [healthOpen, setHealthOpen] = useState(false);
  const isFuture = day > today;
  const isToday = day.getTime() === today.getTime();

  // Tageswerte für den ganzen geladenen Zeitraum: Ringe, Ziel-Kalorien, Belastung
  const allDays = useMemo(() => {
    const first = new Date(`${monthKey}-01T12:00:00`);
    const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    return dailyStats(entries, addDays(startOfDay(first), -30), addDays(weekStart(addDays(next, -1)), 7));
  }, [entries, monthKey]);
  const strainByDay = useMemo(() => dailyStrain(entries, allDays), [entries, allDays]);
  const kcalTargets = useMemo(() => kcalTargetsByDay(allDays, entries, profile ?? {}), [allDays, entries, profile]);
  const microByDay = useMemo(() => microsByDay(entries), [entries]);
  const maxHr = maxHeartRate(profile?.max_hr, ageFrom(profile?.birth_date))?.value;

  // Plan-Punkte unter den Ringen: Ring = geplant, gefüllt = erledigt, roter Rand = nicht erfasst
  const dotsByDay = useMemo(() => {
    const out = new Map<string, RingDot[]>();
    const matched = new Set(states.map((s) => s.workout?.id).filter(Boolean));
    const push = (k: string, d: RingDot) => out.set(k, [...(out.get(k) ?? []), d]);
    for (const st of states) {
      const c = SPORT_COLOR[st.plan.data.sport] ?? '#94A3B8';
      push(dayKey(st.plan.occurred_at), { color: c, filled: st.status === 'erledigt', alert: st.status === 'offen', faded: st.status === 'ausgefallen' });
    }
    for (const e of entries) {
      if (e.kind === 'workout' && !matched.has(e.id)) push(dayKey(e.occurred_at), { color: SPORT_COLOR[(e.data as any).sport] ?? '#94A3B8', filled: true });
    }
    return out;
  }, [states, entries]);

  const monthStartKey = `${monthKey}-01`;
  const nextMonthKey = dayKey(new Date(day.getFullYear(), day.getMonth() + 1, 1));
  const ringDays: RingDay[] = allDays
    .filter((d) => d.day >= monthStartKey && d.day < nextMonthKey)
    .map((d) => {
      const ring =
        ringMode === 'training'
          ? strainRing(d.day, strainByDay.get(d.day), todayKey)
          : metric === 'protein'
            ? proteinRing(d.day, d.protein, profile?.protein_goal_g, todayKey)
            : kcalRing(d.day, d.kcal, kcalTargets.get(d.day), todayKey);
      return { ...ring, dots: dotsByDay.get(d.day) };
    });

  const stats = allDays.find((d) => d.day === dayStr);
  const dayGoals = {
    protein: profile?.protein_goal_g,
    carbs: profile?.carbs_goal_g,
    fat: profile?.fat_goal_g,
    kcal: kcalTargets.get(dayStr) ?? profile?.kcal_goal ?? undefined,
  };

  const shiftMonth = (n: number) => {
    const t = new Date(day.getFullYear(), day.getMonth() + n, 1);
    setDay(t.getFullYear() === today.getFullYear() && t.getMonth() === today.getMonth() ? today : t);
  };
  const selectDay = (k: string) => {
    setDay(startOfDay(new Date(`${k}T12:00:00`)));
    // Zum Tag springen, sonst liegt er unter dem Kalender außerhalb des Bildschirms
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const weekStates = states.filter((s) => dayKey(s.plan.occurred_at) >= wsKey && dayKey(s.plan.occurred_at) < dayKey(addDays(ws, 7)));
  const weekDone = weekStates.filter((s) => s.status === 'erledigt').length;
  const weekPlanned = weekStates.length;
  const weekPlanMin = weekStates.reduce((a, s) => a + (s.plan.data.duration_min ?? 0), 0);
  const weekDoneMin = entries
    .filter((e) => e.kind === 'workout' && dayKey(e.occurred_at) >= wsKey && dayKey(e.occurred_at) < dayKey(addDays(ws, 7)))
    .reduce((a, e) => a + ((e.data as any).duration_min ?? 0), 0);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startNewPlan = () => {
    const at = new Date(day);
    at.setHours(18, 0, 0, 0);
    setEditId('new');
    setDraft({ kind: 'plan', occurred_at: localIso(at), data: { sport: 'tennis' }, manual: true });
  };

  const editing = entries.find((e) => e.id === editId);

  const startEdit = (e: Entry) => {
    setEditId(e.id);
    setDraft({ kind: e.kind, occurred_at: e.occurred_at, data: e.data });
  };

  const saveDraft = () =>
    run(async () => {
      if (!draft) return;
      const data = normalizeData(draft.kind, draft.data);
      if (!data) throw new Error('Eintrag ist leer.');
      if (editId === 'new') await insertEntries([{ kind: draft.kind, occurred_at: draft.occurred_at, data, source: 'manual' }]);
      else if (editing && isVirtual(editing))
        // Änderung nur für diese Woche: Vorlage bleibt, dieser Tag bekommt einen eigenen Eintrag
        await insertEntries([{ kind: 'plan', occurred_at: draft.occurred_at, data, source: 'manual', external_id: editing.external_id }]);
      else if (editId) await updateEntry(editId, { occurred_at: draft.occurred_at, data });
      setEditId(null);
      setDraft(null);
    });

  const remove = (id: string, ask = true) =>
    run(async () => {
      const e = entries.find((x) => x.id === id);
      if (e?.kind === 'plan' && (isVirtual(e) || fromSlot(e))) {
        // Aus dem Wochenplan: nur für diesen Tag streichen, sonst taucht die Einheit wieder auf
        const data = { ...(e.data as PlanData), status: 'entfernt' as const };
        if (isVirtual(e)) await insertEntries([{ kind: 'plan', occurred_at: e.occurred_at, data, source: 'manual', external_id: e.external_id }]);
        else await updateEntry(e.id, { data });
      } else {
        if (ask && !confirm('Eintrag löschen?')) return;
        await deleteEntry(id);
      }
      setEditId(null);
      setDraft(null);
    });

  const markSkipped = (s: PlanState, skipped: boolean) =>
    run(async () => {
      const { status, ...rest } = s.plan.data as PlanData;
      const data = skipped ? { ...rest, status: 'ausgefallen' as const } : rest;
      if (isVirtual(s.plan)) await insertEntries([{ kind: 'plan', occurred_at: s.plan.occurred_at, data, source: 'manual', external_id: s.plan.external_id }]);
      else await updateEntry(s.plan.id, { data });
    });

  const markDone = (s: PlanState) =>
    run(async () => {
      await insertEntries([
        { kind: 'workout', occurred_at: s.plan.occurred_at, data: workoutFromPlan(s.plan.data as PlanData), source: 'manual' },
      ]);
    });

  const editorBlock = (
    <div className="space-y-2">
      {draft && (
        <EntryEditor
          draft={draft}
          onChange={setDraft}
          defaultOpen
          onRecalcBackground={
            editId && editId !== 'new' && editing && !isVirtual(editing) && draft.kind === 'meal'
              ? (text) =>
                  run(async () => {
                    // Erst speichern, was im Fenster geändert wurde, dann rechnet der Hintergrund
                    const data = normalizeData(draft.kind, draft.data);
                    if (data) await updateEntry(editId, { occurred_at: draft.occurred_at, data });
                    addRecalcJob(editId, text, (draft.data?.description ?? 'Mahlzeit').slice(0, 30));
                    setEditId(null);
                    setDraft(null);
                  })
              : undefined
          }
        />
      )}
      <div className="flex gap-2">
        <Button variant="green" className="flex-1" onClick={saveDraft}>
          Speichern
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setEditId(null);
            setDraft(null);
          }}
        >
          Abbrechen
        </Button>
        {editId && editId !== 'new' && (
          <Button variant="danger" onClick={() => remove(editId)}>
            {editing?.kind === 'plan' && (isVirtual(editing) || fromSlot(editing)) ? 'Diese Woche streichen' : 'Löschen'}
          </Button>
        )}
      </div>
    </div>
  );

  if (showPlan)
    return (
      <TrainingPlanView
        onClose={() => {
          setShowPlan(false);
          load();
        }}
        onChanged={onChanged}
      />
    );

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowPlan(true)}
        className="w-full flex items-center justify-between rounded-2xl bg-cyber-purple/15 border border-cyber-purple/30 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-bold text-slate-100">Trainingsplan</span>
          <span className="block text-xs text-slate-400">
            {slots.filter((x) => !x.valid_to || x.valid_to >= dayKey(today)).length
              ? `${slots.filter((x) => !x.valid_to || x.valid_to >= dayKey(today)).length} feste Einheiten pro Woche`
              : 'Noch kein fester Plan. Jetzt einsprechen'}
          </span>
        </span>
        <span className="text-cyber-purple text-sm font-bold flex items-center gap-1">bearbeiten <Icons.Right size={14} weight="bold" /></span>
      </button>

      {/* Monat als Ring-Kalender */}
      <div className="flex items-center justify-between">
        <button className="h-10 w-10 rounded-full bg-white/5" onClick={() => shiftMonth(-1)} aria-label="Vormonat">
          <Icons.Left size={18} className="mx-auto" />
        </button>
        <button className="text-center" onClick={() => setDay(today)}>
          <div className="font-display font-bold text-slate-100">{new Date(`${monthKey}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</div>
          {!(day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth() && isToday) && <div className="text-xs text-cyber-purple">zu heute</div>}
        </button>
        <button className="h-10 w-10 rounded-full bg-white/5" onClick={() => shiftMonth(1)} aria-label="Folgemonat">
          <Icons.Right size={18} className="mx-auto" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([['ernaehrung', 'Ernährung'], ['training', 'Training']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setRingMode(k)} aria-pressed={ringMode === k} className={`rounded-full border px-3 py-1 text-xs font-bold ${ringMode === k ? 'text-slate-100 border-white/20 bg-white/5' : 'text-slate-500 border-white/5'}`}>
            {l}
          </button>
        ))}
        {ringMode === 'ernaehrung' && (
          <span className="ml-auto flex gap-1.5">
            {([['protein', 'Protein'], ['kcal', 'Kalorien']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMetric(k)} aria-pressed={metric === k} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${metric === k ? 'text-slate-100 border-cyber-purple/60 bg-cyber-purple/15' : 'text-slate-500 border-white/5'}`}>
                {l}
              </button>
            ))}
          </span>
        )}
      </div>

      <RingCalendar days={ringDays} today={todayKey} selected={dayStr} onSelect={selectDay} />
      <p className="text-[11px] text-slate-500 -mt-2">
        {ringMode === 'training'
          ? 'Ring = Belastung des Tages von 0 bis 10 (blau leicht, gelb moderat, orange hoch, rot sehr hoch). '
          : metric === 'protein'
            ? 'Ring = Protein in Prozent deines Ziels (grün ab 90 %, gelb ab 60 %, orange darunter). '
            : 'Ring = Kalorien in Prozent deines Tagesziels (gelb unter 70 %, grün bis 105 %, orange bis 115 %, rot darüber). '}
        Punkte darunter = Training: Ring geplant, gefüllt erledigt, roter Rand nicht erfasst.
      </p>

      {weekPlanned > 0 && (
        <p className="text-xs text-slate-400">
          Woche: <b className="text-slate-200">{weekDone} von {weekPlanned}</b> geplanten Einheiten erledigt · {weekDoneMin} von {weekPlanMin} min
        </p>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}

      {/* Tag */}
      <div ref={detailRef} className="flex items-baseline justify-between pt-1 scroll-mt-20">
        <h2 className="font-display font-bold text-slate-100">
          {isToday ? 'Heute' : day.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
      </div>

      {!isFuture && (
        <DaySummary
          isToday={isToday}
          stats={stats}
          goals={dayGoals}
          micro={microByDay.get(dayStr)}
          week={microsWeekAverage(microByDay, dayStr)}
          workouts={dayWorkouts(entries, dayStr, maxHr)}
          strain={strainByDay.get(dayStr)}
          body={bodyValues(stats)}
        />
      )}

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Plan</p>
        {dayPlans.length === 0 && editId !== 'new' && <p className="text-sm text-slate-500">Nichts geplant.</p>}
        {dayPlans.map((s) =>
          editId === s.plan.id ? (
            <div key={s.plan.id}>{editorBlock}</div>
          ) : (
            <Card key={s.plan.id} className="space-y-2">
              <button className="w-full text-left flex gap-3 items-start" onClick={() => startEdit(s.plan)}>
                <span className="shrink-0 mt-0.5" style={{ color: SPORT_COLOR[s.plan.data.sport] }}>
                  <EntryIcon kind="plan" data={s.plan.data} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex justify-between items-center text-xs gap-2">
                    <span className="font-bold text-slate-100">
                      {entryTitle(s.plan)} · {formatTime(s.plan.occurred_at)}
                      {fromSlot(s.plan) && <span className="ml-1.5 font-normal text-[10px] text-cyber-purple">{isVirtual(s.plan) ? 'Wochenplan' : 'Wochenplan, angepasst'}</span>}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_LABEL[s.status].cls}`}>
                      {STATUS_LABEL[s.status].text}
                    </span>
                  </span>
                  <span className="block text-sm text-slate-300 mt-0.5 break-words">{summarize('plan', s.plan.data)}</span>
                  {s.workout && (
                    <span className="flex gap-1 items-start text-xs text-cyber-green mt-1 break-words"><Icons.Check size={14} weight="bold" className="mt-0.5 shrink-0" /> {summarize('workout', s.workout.data)}</span>
                  )}
                </span>
              </button>
              {(s.status === 'offen' || (s.status === 'geplant' && !isFuture)) && (
                <div className="flex gap-2">
                  <Button variant="green" className="flex-1 !py-2" onClick={() => markDone(s)}>
                    Wie geplant gemacht
                  </Button>
                  <Button variant="ghost" className="!py-2" onClick={() => markSkipped(s, true)}>
                    Ausgefallen
                  </Button>
                </div>
              )}
              {s.status === 'ausgefallen' && (
                <button className="text-xs text-slate-400 underline" onClick={() => markSkipped(s, false)}>
                  Doch nicht ausgefallen
                </button>
              )}
            </Card>
          ),
        )}
        {editId === 'new' ? (
          editorBlock
        ) : (
          <Button variant="ghost" className="w-full" onClick={startNewPlan}>
            + Einheit planen
          </Button>
        )}
      </div>

      {!isFuture && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Erfasst</p>
          {loading && <p className="text-sm text-slate-500">Lade …</p>}
          {!loading && dayEntries.length === 0 && <p className="text-sm text-slate-500">Noch keine Einträge.</p>}
          {dayEntries
            .filter((e) => e.kind !== 'health')
            .map((e) =>
              editId === e.id ? (
                <div key={e.id}>{editorBlock}</div>
              ) : (
                <SwipeToDelete key={e.id} onDelete={() => remove(e.id, false)}>
                <button onClick={() => startEdit(e)} className="w-full text-left">
                  <Card className="flex gap-3 items-start">
                    <EntryIcon kind={e.kind} data={e.data} className="text-cyber-purple shrink-0 mt-0.5" />
                    <span className="flex-1 min-w-0">
                      <span className="flex justify-between text-xs">
                        <span className="font-bold text-cyber-purple uppercase tracking-wider">{entryTitle(e)}</span>
                        <span className="text-slate-500">{formatTime(e.occurred_at)}</span>
                      </span>
                      <span className="block text-sm text-slate-200 mt-0.5 break-words">{summarize(e.kind, e.data)}</span>
                    </span>
                    <Icons.Right size={16} className="text-slate-600 shrink-0 mt-1" />
                  </Card>
                </button>
                </SwipeToDelete>
              ),
            )}
          {healthEntries.length > 0 && (
            <Card className="space-y-2">
              <button type="button" onClick={() => setHealthOpen(!healthOpen)} aria-expanded={healthOpen} className="w-full text-left flex gap-3 items-start">
                <EntryIcon kind="health" className="text-cyber-purple shrink-0 mt-0.5" />
                <span className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-cyber-purple uppercase tracking-wider">Apple Health</span>
                  <span className="block text-sm text-slate-200 mt-0.5 break-words">{healthLine(healthEntries)}</span>
                </span>
                <Icons.Right size={16} className={`text-slate-600 shrink-0 mt-1 transition-transform ${healthOpen ? 'rotate-90' : ''}`} />
              </button>
              {healthOpen &&
                healthEntries.map((e) =>
                  editId === e.id ? (
                    <div key={e.id}>{editorBlock}</div>
                  ) : (
                    <SwipeToDelete key={e.id} onDelete={() => remove(e.id, false)} className="!rounded-lg">
                    <button onClick={() => startEdit(e)} className="w-full text-left flex justify-between gap-2 rounded-lg bg-cyber-black/60 px-3 py-2 text-sm">
                      <span className="text-slate-200">{summarize('health', e.data)}</span>
                      <span className="text-slate-500 text-xs shrink-0">{formatTime(e.occurred_at)}</span>
                    </button>
                    </SwipeToDelete>
                  ),
                )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarView;

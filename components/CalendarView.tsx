import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Entry, PlanData } from '../supabase/functions/_shared/domain';
import { normalizeData } from '../supabase/functions/_shared/domain';
import { deleteEntry, insertEntries, listEntries, updateEntry } from '../lib/entries';
import { dailyStats } from '../lib/stats';
import { matchPlans, workoutFromPlan, type PlanState, type PlanStatus } from '../lib/plans';
import { addDays, dayKey, formatTime, localIso, startOfDay } from '../lib/time';
import { KIND_ICON, entryTitle, summarize } from '../lib/format';
import EntryEditor, { type Draft } from './EntryEditor';
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

const weekStart = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

const Stat: React.FC<{ label: string; value?: number; unit: string }> = ({ label, value, unit }) => (
  <div className="rounded-xl bg-cyber-black/60 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="text-lg font-bold text-slate-100">
      {value === undefined ? <span className="text-slate-600">–</span> : value}
      {value !== undefined && <span className="text-xs text-slate-400 ml-1">{unit}</span>}
    </div>
  </div>
);

const CalendarView: React.FC<{ refreshKey: number; onChanged: () => void }> = ({ refreshKey, onChanged }) => {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const ws = weekStart(day);
  const wsKey = dayKey(ws);
  const today = startOfDay(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listEntries(weekStart(new Date(wsKey)), addDays(weekStart(new Date(wsKey)), 7)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [wsKey]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const states = useMemo(() => matchPlans(entries), [entries]);
  const dayStr = dayKey(day);
  const dayPlans = states.filter((s) => dayKey(s.plan.occurred_at) === dayStr);
  const dayEntries = entries.filter((e) => e.kind !== 'plan' && dayKey(e.occurred_at) === dayStr);
  const stats = dailyStats(entries, day, addDays(day, 1))[0];
  const isFuture = day > today;
  const isToday = day.getTime() === today.getTime();

  const weekDone = states.filter((s) => s.status === 'erledigt').length;
  const weekPlanned = states.length;
  const weekPlanMin = states.reduce((a, s) => a + (s.plan.data.duration_min ?? 0), 0);
  const weekDoneMin = entries.filter((e) => e.kind === 'workout').reduce((a, e) => a + ((e.data as any).duration_min ?? 0), 0);

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
      else if (editId) await updateEntry(editId, { occurred_at: draft.occurred_at, data });
      setEditId(null);
      setDraft(null);
    });

  const remove = (id: string) =>
    run(async () => {
      if (!confirm('Eintrag löschen?')) return;
      await deleteEntry(id);
      setEditId(null);
      setDraft(null);
    });

  const markSkipped = (s: PlanState, skipped: boolean) =>
    run(async () => {
      const { status, ...rest } = s.plan.data as PlanData;
      await updateEntry(s.plan.id, { data: skipped ? { ...rest, status: 'ausgefallen' } : rest });
    });

  const markDone = (s: PlanState) =>
    run(async () => {
      await insertEntries([
        { kind: 'workout', occurred_at: s.plan.occurred_at, data: workoutFromPlan(s.plan.data as PlanData), source: 'manual' },
      ]);
    });

  const editorBlock = (
    <div className="space-y-2">
      {draft && <EntryEditor draft={draft} onChange={setDraft} defaultOpen />}
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
            Löschen
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Woche */}
      <div className="flex items-center justify-between">
        <button className="h-10 w-10 rounded-full bg-white/5" onClick={() => setDay(addDays(day, -7))} aria-label="Vorwoche">
          ‹
        </button>
        <button className="text-center" onClick={() => setDay(today)}>
          <div className="font-display font-bold text-slate-100">
            {ws.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} bis{' '}
            {addDays(ws, 6).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
          </div>
          {!isToday && <div className="text-xs text-cyber-purple">zu heute</div>}
        </button>
        <button className="h-10 w-10 rounded-full bg-white/5" onClick={() => setDay(addDays(day, 7))} aria-label="Folgewoche">
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(ws, i);
          const k = dayKey(d);
          const sel = k === dayStr;
          const isT = d.getTime() === today.getTime();
          const ps = states.filter((s) => dayKey(s.plan.occurred_at) === k);
          const matched = new Set(ps.map((s) => s.workout?.id).filter(Boolean));
          const extra = entries.filter((e) => e.kind === 'workout' && dayKey(e.occurred_at) === k && !matched.has(e.id));
          return (
            <button
              key={k}
              onClick={() => setDay(d)}
              className={`rounded-xl py-2 flex flex-col items-center gap-1 border ${
                sel ? 'bg-cyber-purple/20 border-cyber-purple' : 'bg-cyber-gray border-white/5'
              }`}
            >
              <span className={`text-[10px] uppercase ${isT ? 'text-cyber-green font-bold' : 'text-slate-500'}`}>
                {d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}
              </span>
              <span className={`text-sm font-bold ${isT ? 'text-cyber-green' : 'text-slate-200'}`}>{d.getDate()}</span>
              <span className="flex flex-wrap justify-center gap-0.5 min-h-[8px] px-1">
                {ps.map((s) => {
                  const c = SPORT_COLOR[s.plan.data.sport] ?? '#94A3B8';
                  const filled = s.status === 'erledigt';
                  return (
                    <span
                      key={s.plan.id}
                      className={`h-2 w-2 rounded-full ${s.status === 'ausgefallen' ? 'opacity-30' : ''}`}
                      style={{ background: filled ? c : 'transparent', border: `1.5px solid ${s.status === 'offen' ? '#F87171' : c}` }}
                    />
                  );
                })}
                {extra.map((w) => (
                  <span key={w.id} className="h-2 w-2 rounded-full" style={{ background: SPORT_COLOR[(w.data as any).sport] ?? '#94A3B8' }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {weekPlanned > 0 && (
        <p className="text-xs text-slate-400">
          Woche: <b className="text-slate-200">{weekDone} von {weekPlanned}</b> geplanten Einheiten erledigt · {weekDoneMin} von {weekPlanMin} min
        </p>
      )}
      <p className="text-[11px] text-slate-500 -mt-2">Ring = geplant, gefüllt = erledigt, roter Ring = nicht erfasst.</p>

      {error && <ErrorBox>{error}</ErrorBox>}

      {/* Tag */}
      <div className="flex items-baseline justify-between pt-1">
        <h2 className="font-display font-bold text-slate-100">
          {isToday ? 'Heute' : day.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
      </div>

      {!isFuture && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Gewicht" value={stats?.weight} unit="kg" />
          <Stat label="Protein" value={stats?.protein} unit="g" />
          <Stat label="Training" value={stats?.trainingMin} unit="min" />
        </div>
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
                <span className="h-3 w-3 rounded-full mt-1.5 shrink-0" style={{ background: SPORT_COLOR[s.plan.data.sport] }} />
                <span className="flex-1 min-w-0">
                  <span className="flex justify-between items-center text-xs gap-2">
                    <span className="font-bold text-slate-100">
                      {entryTitle(s.plan)} · {formatTime(s.plan.occurred_at)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_LABEL[s.status].cls}`}>
                      {STATUS_LABEL[s.status].text}
                    </span>
                  </span>
                  <span className="block text-sm text-slate-300 mt-0.5 break-words">{summarize('plan', s.plan.data)}</span>
                  {s.workout && (
                    <span className="block text-xs text-cyber-green mt-1 break-words">✓ {summarize('workout', s.workout.data)}</span>
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
          {dayEntries.map((e) =>
            editId === e.id ? (
              <div key={e.id}>{editorBlock}</div>
            ) : (
              <button key={e.id} onClick={() => startEdit(e)} className="w-full text-left">
                <Card className="flex gap-3 items-start">
                  <span className="text-xl leading-none">{KIND_ICON[e.kind]}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex justify-between text-xs">
                      <span className="font-bold text-cyber-purple uppercase tracking-wider">{entryTitle(e)}</span>
                      <span className="text-slate-500">{formatTime(e.occurred_at)}</span>
                    </span>
                    <span className="block text-sm text-slate-200 mt-0.5 break-words">{summarize(e.kind, e.data)}</span>
                  </span>
                </Card>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarView;

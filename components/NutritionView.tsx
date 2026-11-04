// Ernährung: ein Tag im Detail (Makros, Mahlzeiten, Mikronährstoffe) und das Muster nach Mahlzeit über 14 Tage.
import React, { useEffect, useMemo, useState } from 'react';
import { MICROS, normalizeData, type Entry, type MealData } from '../supabase/functions/_shared/domain';
import { deleteEntry, listEntries, updateEntry } from '../lib/entries';
import { dailyKcalTarget, loadProfile, type Profile } from '../lib/profile';
import { average, dailyStats } from '../lib/stats';
import { listSlotOverrideIds, listSlots } from '../lib/planSlotsApi';
import { expandSlots, visiblePlans } from '../lib/planTemplate';
import { estimateActiveToday } from '../lib/energy';
import { SLOTS, SLOT_COLOR, SLOT_LABEL, mealBreakdown, slotOf } from '../lib/meals';
import { averageMicros, fmtMicro, microZone, microsByDay } from '../lib/micros';
import { MACRO_COLOR } from '../lib/today';
import { addDays, dayKey, formatTime, startOfDay } from '../lib/time';
import { MacroRow } from './TodayBar';
import EntryEditor, { type Draft } from './EntryEditor';
import { addRecalcJob } from '../lib/backgroundJobs';
import { Button, Card, ErrorBox } from './ui';
import { Icons } from './icons';

const Title: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <div>
    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{children}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
);

const dayLabel = (d: Date) => {
  const k = dayKey(d);
  if (k === dayKey(new Date())) return 'Heute';
  if (k === dayKey(addDays(new Date(), -1))) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
};

const NutritionView: React.FC<{ refreshKey: number; onChanged: () => void }> = ({ refreshKey, onChanged }) => {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const to = addDays(startOfDay(new Date()), 1);
    const from = addDays(to, -31);
    Promise.all([listEntries(from, to), listSlots(), listSlotOverrideIds(), loadProfile()])
      .then(([list, slots, overrides, p]) => {
        setEntries(visiblePlans([...list, ...expandSlots(slots, list, from, to, overrides)]));
        setProfile(p);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [refreshKey, reload]);

  const key = dayKey(day);
  const isToday = key === dayKey(new Date());
  const view = useMemo(() => {
    const to = addDays(startOfDay(new Date()), 1);
    const from = addDays(to, -31);
    const days = dailyStats(entries, from, to);
    const idx = days.findIndex((d) => d.day === key);
    const d = days[idx];
    const lean = days.slice(0, idx + 1).map((x) => x.leanMass).filter((x): x is number => typeof x === 'number');
    const active = isToday ? estimateActiveToday(days, entries).value : d?.activeKcal;
    const kcal = dailyKcalTarget(lean[lean.length - 1], active, average(days.slice(Math.max(0, idx - 14), idx), 'activeKcal'), profile?.kcal_goal);
    const meals = entries
      .filter((e): e is Entry<'meal'> => e.kind === 'meal' && dayKey(e.occurred_at) === key)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const byDay = microsByDay(entries);
    const week = [...byDay.values()].filter((x) => x.day <= key && x.day > dayKey(addDays(day, -7)));
    const pattern = mealBreakdown(entries.filter((e) => e.occurred_at >= addDays(startOfDay(new Date()), -14).toISOString()));
    return { d, kcalGoal: kcal.goal, meals, micro: byDay.get(key), week: averageMicros(week), pattern };
  }, [entries, key, isToday, profile, day]);

  const startEdit = (e: Entry) => {
    setEditId(e.id);
    setDraft({ kind: e.kind, occurred_at: e.occurred_at, data: e.data });
  };
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setEditId(null);
      setDraft(null);
      setReload((r) => r + 1);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = () =>
    run(async () => {
      if (!draft || !editId) return;
      const data = normalizeData(draft.kind, draft.data);
      if (!data) throw new Error('Eintrag ist leer.');
      await updateEntry(editId, { occurred_at: draft.occurred_at, data });
    });
  const remove = () =>
    run(async () => {
      if (!editId || !confirm('Mahlzeit löschen?')) return;
      await deleteEntry(editId);
    });

  const { d, meals, micro, week, pattern } = view;
  const withMicros = micro?.withMicros ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-slate-100">Ernährung</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDay((x) => addDays(x, -1))} className="p-1.5 text-slate-400" aria-label="Tag davor">
            <Icons.Left size={18} />
          </button>
          <span className="text-sm font-bold text-slate-200 w-24 text-center">{dayLabel(day)}</span>
          <button type="button" onClick={() => setDay((x) => addDays(x, 1))} disabled={isToday} className="p-1.5 text-slate-400 disabled:opacity-20" aria-label="Tag danach">
            <Icons.Right size={18} />
          </button>
        </div>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}

      <Card className="space-y-2">
        <MacroRow label="Protein" value={d?.protein} goal={profile?.protein_goal_g ?? undefined} unit="g" mode="more" color={MACRO_COLOR.protein} />
        <MacroRow label="Kohlenhydr." value={d?.carbs} goal={profile?.carbs_goal_g ?? undefined} unit="g" mode="less" color={MACRO_COLOR.carbs} />
        <MacroRow label="Fett" value={d?.fat} goal={profile?.fat_goal_g ?? undefined} unit="g" mode="less" color={MACRO_COLOR.fat} />
        <MacroRow label="Kalorien" value={d?.kcal} goal={view.kcalGoal} unit="kcal" mode="less" color={MACRO_COLOR.kcal} />
      </Card>

      <Card>
        <Title sub={meals.length ? `${meals.length} Einträge. Antippen zum Ändern.` : 'Noch nichts erfasst.'}>Mahlzeiten</Title>
        <div className="mt-2">
          {meals.map((m) => {
            const md = m.data as MealData;
            const slot = slotOf(m);
            if (editId === m.id && draft)
              return (
                <div key={m.id} className="space-y-2 py-2">
                  <EntryEditor
                    draft={draft}
                    onChange={setDraft}
                    defaultOpen
                    onRecalcBackground={(text) =>
                      run(async () => {
                        // Erst speichern, was im Fenster geändert wurde, dann rechnet der Hintergrund
                        const data = normalizeData(draft.kind, draft.data);
                        if (data) await updateEntry(m.id, { occurred_at: draft.occurred_at, data });
                        addRecalcJob(m.id, text, (md.description || 'Mahlzeit').slice(0, 30));
                      })
                    }
                  />
                  <div className="flex gap-2">
                    <Button variant="green" className="flex-1" onClick={save}>
                      Speichern
                    </Button>
                    <Button variant="ghost" onClick={() => (setEditId(null), setDraft(null))}>
                      Abbrechen
                    </Button>
                    <Button variant="danger" onClick={remove}>
                      Löschen
                    </Button>
                  </div>
                </div>
              );
            return (
              <button key={m.id} type="button" onClick={() => startEdit(m)} className="w-full flex items-center gap-2.5 border-t border-white/5 py-2 text-left">
                <span className="h-8 w-1 rounded-full shrink-0" style={{ background: SLOT_COLOR[slot] }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-100 truncate">{md.description || md.items?.map((i) => i.name).join(', ')}</span>
                  <span className="block text-[11px] text-slate-500">
                    {formatTime(m.occurred_at)} · {SLOT_LABEL[slot]}
                    {md.micros ? '' : ' · ohne Mikros'}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  {md.protein_g !== undefined && <span className="block text-sm font-bold tabular-nums" style={{ color: MACRO_COLOR.protein }}>{md.protein_g} g</span>}
                  {md.kcal !== undefined && <span className="block text-[11px] text-slate-400 tabular-nums">{md.kcal} kcal</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <Title
          sub={
            withMicros
              ? `KI-Schätzung aus ${withMicros} von ${micro?.meals ?? 0} Mahlzeiten. Grob, vor allem bei Vitaminen. Tageswert für Männer um 45 nach DGE.`
              : 'Für diesen Tag gibt es noch keine Schätzung. Neue Mahlzeiten bekommen sie automatisch. Ältere: Mahlzeit antippen, „Nährwerte neu berechnen“.'
          }
        >
          Mikronährstoffe
        </Title>
        {(withMicros > 0 || week.days > 0) && (
          <table className="w-full mt-3 text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-bold pb-1">Nährstoff</th>
                <th className="text-right font-bold pb-1">{isToday ? 'Heute' : 'Tag'}</th>
                <th className="pb-1 w-20"></th>
                <th className="text-right font-bold pb-1 whitespace-nowrap">Ø 7 Tage</th>
              </tr>
            </thead>
            <tbody>
              {MICROS.map((m) => {
                const v = micro?.micros[m.key];
                const z = microZone(m.key, v);
                const w = week.micros[m.key];
                const wz = microZone(m.key, w);
                return (
                  <tr key={m.key} className="border-t border-white/5">
                    <td className="py-1.5 text-slate-200">
                      {m.label}
                      <span className="block text-[10px] text-slate-500">
                        {m.dir === 'max' ? 'höchstens' : 'Ziel'} {m.ref.toLocaleString('de-DE')} {m.unit}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-bold" style={{ color: z?.color ?? '#475569' }}>
                      {v !== undefined ? fmtMicro(m.key, v) : '–'}
                    </td>
                    <td className="py-1.5 pl-2">
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        {z && <div className="h-full rounded-full" style={{ width: `${Math.min(100, z.pct)}%`, background: z.color }} />}
                      </div>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-xs" style={{ color: wz?.color ?? '#475569' }}>
                      {w !== undefined ? fmtMicro(m.key, w) : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {pattern.days > 0 && (
        <Card>
          <Title sub={`Ø je Tag mit Essen, letzte 14 Tage (${pattern.days} Tage). Protein-Treffer = Mahlzeit mit mindestens 30 g.`}>Muster nach Mahlzeit</Title>
          <table className="w-full mt-3 text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-bold pb-1"></th>
                <th className="text-right font-bold pb-1">Protein</th>
                <th className="text-right font-bold pb-1">kcal</th>
                <th className="text-right font-bold pb-1">Anteil</th>
                <th className="text-right font-bold pb-1">≥ 30 g</th>
              </tr>
            </thead>
            <tbody>
              {pattern.rows.map((r) => (
                <tr key={r.slot} className="border-t border-white/5">
                  <td className="py-1.5">
                    <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: SLOT_COLOR[r.slot] }} />
                    <span className="text-slate-200">{SLOT_LABEL[r.slot]}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums" style={{ color: MACRO_COLOR.protein }}>{r.avg.protein} g</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-300">{r.avg.kcal}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-400">{Math.round(r.share * 100)} %</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-400">
                    {r.proteinHits}/{r.meals}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">Ø {pattern.proteinMealsPerDay.toLocaleString('de-DE')} Mahlzeiten pro Tag mit mindestens 30 g Protein.</p>
        </Card>
      )}
    </div>
  );
};

export default NutritionView;

// Tagesleiste oben auf "Erfassen": Ernährung gegen die Ziele, dazu Schlaf, Training, Erholung und Belastung.
import React, { useEffect, useState } from 'react';
import { listEntries } from '../lib/entries';
import { loadProfile } from '../lib/profile';
import { listSlotOverrideIds, listSlots } from '../lib/planSlotsApi';
import { expandSlots, visiblePlans } from '../lib/planTemplate';
import { goalColor, goalRatio, todaySummary, type TodaySummary } from '../lib/today';
import { BASELINE_DAYS, dailyRecovery, dailyStrain, recoveryLabel, strainLabel } from '../lib/recovery';
import { dailyStats } from '../lib/stats';
import { addDays, dayKey, startOfDay } from '../lib/time';

/** Eine Zeile Ernährung: Wert, Ziel, Balken mit gleitender Farbe. */
const MacroRow: React.FC<{ label: string; value?: number; goal?: number; unit: string; mode: 'more' | 'less' }> = ({ label, value, goal, unit, mode }) => {
  const ratio = goalRatio(value, goal);
  const color = goalColor(value, goal, mode);
  return (
    <div className="grid grid-cols-[88px_1fr_auto] items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</span>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        {ratio !== null && <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(ratio * 100)}%`, background: color }} />}
      </div>
      <span className="text-sm font-display font-bold text-slate-100 tabular-nums whitespace-nowrap">
        {value !== undefined ? value : <span className="text-slate-600">–</span>}
        <span className="text-[11px] font-normal text-slate-400 ml-0.5">{unit}</span>
        {goal !== undefined && <span className="text-[11px] font-normal text-slate-500"> / {goal}</span>}
      </span>
    </div>
  );
};

const Tile: React.FC<{ label: string; value?: number; unit: string; max?: number; sub?: string; color?: string }> = ({ label, value, unit, max, sub, color = '#ADFF2F' }) => {
  const ratio = goalRatio(value, max);
  return (
    <div className="rounded-xl bg-cyber-gray border border-white/5 px-3 py-2 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">{label}</p>
      <p className="text-lg font-display font-bold text-slate-100 leading-tight truncate">
        {value !== undefined ? value : <span className="text-slate-600">–</span>}
        <span className="text-[11px] font-normal text-slate-400 ml-0.5">{unit}</span>
      </p>
      {ratio !== null && (
        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(ratio * 100)}%`, background: color }} />
        </div>
      )}
      {sub && <p className="text-[11px] text-slate-500 mt-1 truncate">{sub}</p>}
    </div>
  );
};

const TodayBar: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [s, setS] = useState<TodaySummary | null>(null);
  const [recovery, setRecovery] = useState<number | undefined>();
  const [strain, setStrain] = useState<number | undefined>();

  useEffect(() => {
    let alive = true;
    const now = new Date();
    const from = addDays(startOfDay(now), -BASELINE_DAYS);
    const to = addDays(startOfDay(now), 1);
    Promise.all([listEntries(from, to), listSlots(), listSlotOverrideIds(), loadProfile()])
      .then(([list, slots, overrides, profile]) => {
        if (!alive) return;
        const entries = visiblePlans([...list, ...expandSlots(slots, list, from, to, overrides)]);
        setS(todaySummary(entries, { protein: profile.protein_goal_g, kcal: profile.kcal_goal, carbs: profile.carbs_goal_g, fat: profile.fat_goal_g }, now));
        const days = dailyStats(entries, from, to);
        const rec = dailyRecovery(days);
        setRecovery(rec[rec.length - 1]);
        setStrain(dailyStrain(entries, days).get(dayKey(now)));
      })
      .catch(() => alive && setS({}));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (!s) return <div className="h-[200px]" />;
  const trainingSub = s.nextPlan ? `Geplant: ${s.nextPlan}` : s.donePlan ? `${s.donePlan} erledigt` : 'Nichts geplant';

  return (
    <div className="space-y-2" aria-label="Heute">
      <div className="rounded-xl bg-cyber-gray border border-white/5 px-3 py-2.5 space-y-2">
        <MacroRow label="Protein" value={s.protein} goal={s.proteinGoal} unit="g" mode="more" />
        <MacroRow label="Kalorien" value={s.kcal} goal={s.kcalGoal} unit="kcal" mode="less" />
        <MacroRow label="Kohlenhydr." value={s.carbs} goal={s.carbsGoal} unit="g" mode="less" />
        <MacroRow label="Fett" value={s.fat} goal={s.fatGoal} unit="g" mode="less" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Schlaf letzte Nacht" value={s.sleepH} unit="h" />
        <Tile label="Training heute" value={s.trainingMin} unit="min" sub={trainingSub} />
        <Tile label="Erholung" value={recovery} unit="" max={100} sub={recoveryLabel(recovery).text} color={recoveryLabel(recovery).color} />
        <Tile label="Belastung heute" value={strain} unit="" max={21} sub={strainLabel(strain)} color="#FF6B00" />
      </div>
    </div>
  );
};

export default TodayBar;

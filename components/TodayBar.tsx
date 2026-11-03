// Tagesleiste oben auf "Erfassen": Protein, Kalorien, Schlaf, Training auf einen Blick.
import React, { useEffect, useState } from 'react';
import { listEntries } from '../lib/entries';
import { loadProfile } from '../lib/profile';
import { listSlotOverrideIds, listSlots } from '../lib/planSlotsApi';
import { expandSlots, visiblePlans } from '../lib/planTemplate';
import { goalRatio, todaySummary, type TodaySummary } from '../lib/today';
import { dailyRecovery, dailyStrain, recoveryLabel, strainLabel, BASELINE_DAYS } from '../lib/recovery';
import { dailyStats } from '../lib/stats';
import { dayKey } from '../lib/time';
import { addDays, startOfDay } from '../lib/time';

const Tile: React.FC<{ label: string; value?: number; unit: string; goal?: number; max?: number; sub?: string; color?: string }> = ({ label, value, unit, goal, max, sub, color = '#ADFF2F' }) => {
  const ratio = goalRatio(value, goal ?? max);
  return (
    <div className="rounded-xl bg-cyber-gray border border-white/5 px-3 py-2 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">{label}</p>
      <p className="text-lg font-display font-bold text-slate-100 leading-tight truncate">
        {value !== undefined ? value : <span className="text-slate-600">–</span>}
        <span className="text-[11px] font-normal text-slate-400 ml-0.5">{unit}</span>
        {goal !== undefined && <span className="text-[11px] font-normal text-slate-500"> / {goal}</span>}
      </p>
      {ratio !== null && (
        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(ratio * 100)}%`, background: goal && ratio >= 1 ? '#ADFF2F' : color }} />
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
        setS(todaySummary(entries, { protein: profile.protein_goal_g, kcal: profile.kcal_goal }, now));
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

  if (!s) return <div className="h-[72px]" />;
  const training = s.trainingMin !== undefined ? s.trainingMin : undefined;
  const trainingSub = s.nextPlan ? `Geplant: ${s.nextPlan}` : s.donePlan ? `${s.donePlan} erledigt` : 'Nichts geplant';

  return (
    <div className="grid grid-cols-2 gap-2" aria-label="Heute">
      <Tile label="Protein" value={s.protein} unit="g" goal={s.proteinGoal} color="#8B5CF6" />
      <Tile label="Kalorien" value={s.kcal} unit="kcal" goal={s.kcalGoal} color="#F59E0B" />
      <Tile label="Schlaf letzte Nacht" value={s.sleepH} unit="h" />
      <Tile label="Training heute" value={training} unit="min" sub={trainingSub} />
      <Tile label="Erholung" value={recovery} unit="" max={100} sub={recoveryLabel(recovery).text} color={recoveryLabel(recovery).color} />
      <Tile label="Belastung heute" value={strain} unit="" max={21} sub={strainLabel(strain)} color="#FF6B00" />
    </div>
  );
};

export default TodayBar;

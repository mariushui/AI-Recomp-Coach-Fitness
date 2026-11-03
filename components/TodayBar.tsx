// Tagesleiste oben auf "Erfassen": Protein, Kalorien, Schlaf, Training auf einen Blick.
import React, { useEffect, useState } from 'react';
import { listEntries } from '../lib/entries';
import { loadProfile } from '../lib/profile';
import { listSlotOverrideIds, listSlots } from '../lib/planSlotsApi';
import { expandSlots, visiblePlans } from '../lib/planTemplate';
import { goalRatio, todaySummary, type TodaySummary } from '../lib/today';
import { addDays, startOfDay } from '../lib/time';

const Tile: React.FC<{ label: string; value?: number; unit: string; goal?: number; sub?: string; color?: string }> = ({ label, value, unit, goal, sub, color = '#ADFF2F' }) => {
  const ratio = goalRatio(value, goal);
  return (
    <div className="rounded-xl bg-cyber-gray border border-white/5 px-3 py-2 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">{label}</p>
      <p className="text-lg font-display font-bold text-slate-100 leading-tight truncate">
        {value !== undefined ? value : <span className="text-slate-600">–</span>}
        <span className="text-[11px] font-normal text-slate-400 ml-0.5">{unit}</span>
        {goal !== undefined && <span className="text-[11px] font-normal text-slate-500"> / {goal}</span>}
      </p>
      {ratio !== null ? (
        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(ratio * 100)}%`, background: ratio >= 1 ? '#ADFF2F' : color }} />
        </div>
      ) : (
        sub && <p className="text-[11px] text-slate-500 mt-1 truncate">{sub}</p>
      )}
    </div>
  );
};

const TodayBar: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [s, setS] = useState<TodaySummary | null>(null);

  useEffect(() => {
    let alive = true;
    const now = new Date();
    const from = addDays(startOfDay(now), -1);
    const to = addDays(startOfDay(now), 1);
    Promise.all([listEntries(from, to), listSlots(), listSlotOverrideIds(), loadProfile()])
      .then(([list, slots, overrides, profile]) => {
        if (!alive) return;
        const entries = visiblePlans([...list, ...expandSlots(slots, list, from, to, overrides)]);
        setS(todaySummary(entries, { protein: profile.protein_goal_g, kcal: profile.kcal_goal }, now));
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
    </div>
  );
};

export default TodayBar;

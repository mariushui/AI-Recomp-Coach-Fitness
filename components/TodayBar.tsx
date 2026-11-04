// Tagesleiste oben auf "Erfassen": Ernährung gegen die Ziele, darunter vier Kacheln wie bei Athlytic:
// Erholung in Prozent, Schlaf in Prozent mit Dauer, Belastung 0 bis 10 mit Zielbereich, Verbrauch in kcal.
import React, { useEffect, useState } from 'react';
import { listEntries } from '../lib/entries';
import { dailyKcalTarget, loadProfile } from '../lib/profile';
import { average } from '../lib/stats';
import { listSlotOverrideIds, listSlots } from '../lib/planSlotsApi';
import { expandSlots, visiblePlans } from '../lib/planTemplate';
import { MACRO_COLOR, goalRatio, goalState, todaySummary, type TodaySummary } from '../lib/today';
import { BASELINE_DAYS, dailyRecovery, dailyStrain, recoveryLabel, sleepScore, strainLabel, strainTarget, strainVsTarget } from '../lib/recovery';
import { dailyStats } from '../lib/stats';
import { addDays, dayKey, startOfDay } from '../lib/time';

/** Eine Zeile Ernährung: Wert, Ziel, Balken mit gleitender Farbe. */
const MacroRow: React.FC<{ label: string; value?: number; goal?: number; unit: string; mode: 'more' | 'less'; color: string }> = ({ label, value, goal, unit, mode, color }) => {
  const ratio = goalRatio(value, goal);
  const state = goalState(value, goal, mode);
  const valueColor = state === 'over' ? '#FF375F' : state === 'reached' ? '#ADFF2F' : undefined;
  return (
    <div className="grid grid-cols-[88px_1fr_auto] items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider truncate" style={{ color }}>{label}</span>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        {ratio !== null && <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(ratio * 100)}%`, background: color, opacity: state === 'over' ? 1 : 0.85 }} />}
      </div>
      <span className="text-sm font-display font-bold tabular-nums whitespace-nowrap" style={{ color: valueColor ?? '#f1f5f9' }} title={state === 'over' ? 'über dem Ziel' : state === 'reached' ? 'Ziel erreicht' : undefined}>
        {value !== undefined ? value : <span className="text-slate-600">–</span>}
        {state === 'over' && ' ↑'}
        {state === 'reached' && ' ✓'}
        <span className="text-[11px] font-normal text-slate-400 ml-0.5">{unit}</span>
        {goal !== undefined && <span className="text-[11px] font-normal text-slate-500"> / {goal}</span>}
      </span>
    </div>
  );
};

/** Große Kachel: Titel, Zahl in Farbe, Einheit, Untertitel, Balken. Optional ein Zielbereich als zwei Markierungen im Balken. */
const Tile: React.FC<{
  label: string;
  value?: string;
  unit?: string;
  sub?: string;
  color: string;
  ratio?: number | null;
  target?: { lo: number; hi: number } | null; // Anteil 0..1
}> = ({ label, value, unit, sub, color, ratio, target }) => (
  <div className="rounded-2xl bg-cyber-gray border border-white/5 px-3.5 py-3 min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">{label}</p>
    <p className="mt-1 font-display font-bold leading-none truncate" style={{ color: value ? color : '#475569', fontSize: 30 }}>
      {value ?? '–'}
      {value && unit && <span className="text-xs font-bold ml-1 align-baseline" style={{ color, opacity: 0.8 }}>{unit}</span>}
    </p>
    <p className="text-[11px] text-slate-400 mt-1.5 truncate min-h-[14px]">{sub ?? ''}</p>
    <div className="relative mt-2 h-1.5 rounded-full bg-white/10 overflow-visible">
      {ratio !== null && ratio !== undefined && (
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`, background: color }} />
      )}
      {target && (
        <>
          <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-cyber-green/80" style={{ left: `${Math.round(target.lo * 100)}%` }} aria-hidden />
          <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-cyber-green/80" style={{ left: `${Math.round(target.hi * 100)}%` }} aria-hidden />
          <div className="absolute top-0 h-full bg-cyber-green/15" style={{ left: `${Math.round(target.lo * 100)}%`, width: `${Math.round((target.hi - target.lo) * 100)}%` }} aria-hidden />
        </>
      )}
    </div>
  </div>
);

const fmtKcal = (n: number) => n.toLocaleString('de-DE');
const fmtSleep = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`;

const TodayBar: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [s, setS] = useState<TodaySummary | null>(null);
  const [recovery, setRecovery] = useState<number | undefined>();
  const [strain, setStrain] = useState<number | undefined>();
  const [burned, setBurned] = useState<number | undefined>();
  const [kcalDynamic, setKcalDynamic] = useState(false);

  useEffect(() => {
    let alive = true;
    const now = new Date();
    const from = addDays(startOfDay(now), -BASELINE_DAYS);
    const to = addDays(startOfDay(now), 1);
    Promise.all([listEntries(from, to), listSlots(), listSlotOverrideIds(), loadProfile()])
      .then(([list, slots, overrides, profile]) => {
        if (!alive) return;
        const entries = visiblePlans([...list, ...expandSlots(slots, list, from, to, overrides)]);
        const days = dailyStats(entries, from, to);
        const lean = days.map((d) => d.leanMass).filter((x): x is number => typeof x === 'number');
        const today = days[days.length - 1];
        const kcal = dailyKcalTarget(lean[lean.length - 1], today?.activeKcal, average(days.slice(-15, -1), 'activeKcal'), profile.kcal_goal);
        setKcalDynamic(kcal.dynamic);
        setBurned(kcal.dynamic ? kcal.goal : undefined);
        setS(todaySummary(entries, { protein: profile.protein_goal_g, kcal: kcal.goal, carbs: profile.carbs_goal_g, fat: profile.fat_goal_g }, now));
        const rec = dailyRecovery(days);
        setRecovery(rec[rec.length - 1]);
        setStrain(dailyStrain(entries, days).get(dayKey(now)));
      })
      .catch(() => alive && setS({}));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (!s) return <div className="h-[260px]" />;
  const trainingSub = s.nextPlan ? `Geplant: ${s.nextPlan}` : s.donePlan ? `${s.donePlan} erledigt` : s.trainingMin ? `${s.trainingMin} min trainiert` : undefined;
  const rec = recoveryLabel(recovery);
  const target = strainTarget(recovery);
  const vs = strainVsTarget(strain, target);
  const sleepPct = sleepScore(s.sleepH);
  const strainSub = strain === undefined ? trainingSub ?? 'keine Belastung' : `${strainLabel(strain)}${vs ? `, ${vs === 'im Ziel' ? 'im Zielbereich' : vs === 'unter' ? 'unter dem Ziel' : 'über dem Ziel'}` : ''}`;

  return (
    <div className="space-y-2" aria-label="Heute">
      <div className="rounded-xl bg-cyber-gray border border-white/5 px-3 py-2.5 space-y-2">
        <MacroRow label="Protein" value={s.protein} goal={s.proteinGoal} unit="g" mode="more" color={MACRO_COLOR.protein} />
        <MacroRow label="Kohlenhydr." value={s.carbs} goal={s.carbsGoal} unit="g" mode="less" color={MACRO_COLOR.carbs} />
        <MacroRow label="Fett" value={s.fat} goal={s.fatGoal} unit="g" mode="less" color={MACRO_COLOR.fat} />
        <MacroRow label="Kalorien" value={s.kcal} goal={s.kcalGoal} unit="kcal" mode="less" color={MACRO_COLOR.kcal} />
        {kcalDynamic && <p className="text-[10px] text-slate-500 pt-0.5">Kalorienziel = Grundumsatz + aktive Kalorien heute aus Apple Health</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Erholung" value={recovery !== undefined ? String(recovery) : undefined} unit="%" sub={rec.text} color={rec.color} ratio={recovery !== undefined ? recovery / 100 : null} />
        <Tile label="Schlaf" value={sleepPct !== undefined ? String(sleepPct) : undefined} unit="%" sub={s.sleepH !== undefined ? fmtSleep(s.sleepH) : 'keine Nacht erfasst'} color="#8B5CF6" ratio={sleepPct !== undefined ? sleepPct / 100 : null} />
        <Tile
          label="Belastung"
          value={strain !== undefined ? strain.toLocaleString('de-DE') : undefined}
          unit="/10"
          sub={strainSub}
          color="#38BDF8"
          ratio={strain !== undefined ? strain / 10 : null}
          target={target ? { lo: target.lo / 10, hi: target.hi / 10 } : null}
        />
        <Tile label="Verbrauch" value={burned !== undefined ? fmtKcal(burned) : undefined} unit="kcal" sub={burned !== undefined ? 'Grundumsatz + aktiv heute' : 'braucht Apple Health'} color="#FB923C" ratio={burned !== undefined && s.kcal !== undefined ? s.kcal / burned : null} />
      </div>
    </div>
  );
};

export default TodayBar;

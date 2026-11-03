import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SPORTS, SPORT_LABEL, type Entry } from '../supabase/functions/_shared/domain';
import { listEntries } from '../lib/entries';
import { average, bmi, dailyStats, movingAverage, weeklyAverages, weeklySportMinutes } from '../lib/stats';
import { loadProfile } from '../lib/profile';
import { Icons } from './icons';
import { matchPlans, weeklyPlanStats } from '../lib/plans';
import { listSlots } from '../lib/planSlotsApi';
import { expandSlots, visiblePlans } from '../lib/planTemplate';
import { addDays, startOfDay } from '../lib/time';
import { Card, ErrorBox } from './ui';

const RANGES = [7, 30, 90, 365] as const;
const RANGE_LABEL: Record<(typeof RANGES)[number], string> = { 7: 'Woche', 30: '30 Tage', 90: '90 Tage', 365: 'Jahr' };

const CHARTS = [
  { key: 'body', label: 'Gewicht und Körper' },
  { key: 'nutrition', label: 'Ernährung' },
  { key: 'training', label: 'Training pro Woche' },
  { key: 'plan', label: 'Plan erfüllt' },
  { key: 'sleep', label: 'Schlaf und HRV' },
  { key: 'steps', label: 'Schritte' },
  { key: 'vo2', label: 'VO2max und Blutsauerstoff' },
  { key: 'rhr', label: 'Ruhepuls' },
] as const;
const CHART_KEY = 'recomp_trend_charts_v1';
const loadCharts = (): Set<string> => {
  try {
    const raw = localStorage.getItem(CHART_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignorieren */
  }
  return new Set(CHARTS.map((c) => c.key));
};

const BODY_SERIES = [
  { key: 'weight', label: 'Gewicht', color: '#ADFF2F' },
  { key: 'fatMass', label: 'Fett kg', color: '#FF6B00' },
  { key: 'lean', label: 'Magermasse kg', color: '#00F0FF' },
  { key: 'fat', label: 'Körperfett %', color: '#FBBF24' },
  { key: 'bmi', label: 'BMI', color: '#F472B6' },
] as const;
const MACROS = [
  { key: 'protein', label: 'Protein', color: '#8B5CF6', unit: 'g' },
  { key: 'carbs', label: 'Kohlenhydrate', color: '#38BDF8', unit: 'g' },
  { key: 'fat', label: 'Fett', color: '#FBBF24', unit: 'g' },
  { key: 'kcal', label: 'Kalorien', color: '#94A3B8', unit: 'kcal' },
] as const;
type MacroKey = (typeof MACROS)[number]['key'];

/** An- und abklickbare Auswahl */
const Chips: React.FC<{ items: readonly { key: string; label: string; color: string }[]; on: Set<string>; toggle: (k: string) => void }> = ({ items, on, toggle }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((i) => {
      const active = on.has(i.key);
      return (
        <button
          key={i.key}
          onClick={() => toggle(i.key)}
          aria-pressed={active}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${active ? 'text-slate-100 border-white/20 bg-white/5' : 'text-slate-500 border-white/5'}`}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: active ? i.color : 'transparent', border: `1.5px solid ${i.color}` }} />
          {i.label}
        </button>
      );
    })}
  </div>
);

const useToggleSet = (initial: string[]) => {
  const [on, setOn] = useState(() => new Set(initial));
  const toggle = (k: string) =>
    setOn((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return [on, toggle] as const;
};
const SPORT_COLORS: Record<string, string> = {
  tennis: '#ADFF2F',
  laufen: '#00F0FF',
  capoeira: '#FF6B00',
  kraft: '#8B5CF6',
  rad: '#38BDF8',
  schwimmen: '#22D3EE',
  mobility: '#F472B6',
  sonstiges: '#94A3B8',
};

const axis = { stroke: '#475569', fontSize: 11 };
const tooltipStyle = { contentStyle: { background: '#121214', border: '1px solid #333', borderRadius: 12, fontSize: 12 } };
const shortDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

const Chart: React.FC<{ title: string; hint?: string; controls?: React.ReactNode; children: React.ReactElement }> = ({ title, hint, controls, children }) => (
  <Card>
    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
    {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
    {controls && <div className="mt-2 space-y-2">{controls}</div>}
    <div className="h-52 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </Card>
);

const Trends: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [range, setRange] = useState<(typeof RANGES)[number]>(90);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const to = addDays(startOfDay(new Date()), 1);
  const from = addDays(to, -range);

  useEffect(() => {
    Promise.all([listEntries(from, to), listSlots()])
      .then(([list, slots]) => setEntries(visiblePlans([...list, ...expandSlots(slots, list, from, to)])))
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, refreshKey]);

  const [bodyOn, toggleBody] = useToggleSet(['weight', 'fatMass', 'lean']);
  const [charts, setCharts] = useState<Set<string>>(loadCharts);
  const [menuOpen, setMenuOpen] = useState(false);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  useEffect(() => {
    loadProfile().then((p) => setHeightCm(p.height_cm ?? null)).catch(() => undefined);
  }, []);
  const show = (k: string) => charts.has(k);
  const toggleChart = (k: string) =>
    setCharts((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      try {
        localStorage.setItem(CHART_KEY, JSON.stringify([...n]));
      } catch {
        /* ignorieren */
      }
      return n;
    });
  const [macroOn, toggleMacro] = useToggleSet(['protein', 'carbs', 'fat']);
  const [weekly, setWeekly] = useState(false);

  const days = useMemo(() => {
    const s = dailyStats(entries, from, to);
    const avg = movingAverage(s.map((d) => d.weight));
    const leanAvg = movingAverage(s.map((d) => d.leanMass));
    const fatAvg = movingAverage(s.map((d) => d.bodyFat));
    const fatMassAvg = movingAverage(s.map((d) => d.fatMass));
    return s.map((d, i) => ({
      ...d,
      weightAvg: avg[i],
      leanAvg: leanAvg[i],
      bodyFatAvg: fatAvg[i],
      fatMassAvg: fatMassAvg[i],
      bmi: bmi(avg[i], heightCm),
      label: shortDay(d.day),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, heightCm]);
  const weeks = useMemo(() => weeklySportMinutes(entries).map((w) => ({ ...w, label: shortDay(w.week) })), [entries]);
  const planWeeks = useMemo(
    () => weeklyPlanStats(matchPlans(entries)).map((w) => ({ ...w, label: shortDay(w.week), open: w.planned - w.done })),
    [entries],
  );
  const nutritionDays = useMemo(
    () => (weekly ? weeklyAverages(days, ['protein', 'carbs', 'fat', 'kcal']).map((w) => ({ ...w, label: shortDay(w.week) })) : days),
    [days, weekly],
  );
  const macroAvg = Object.fromEntries(MACROS.map((m) => [m.key, average(days, m.key)])) as Record<MacroKey, number | undefined>;
  const sportsUsed = SPORTS.filter((s) => weeks.some((w) => w[s]));
  const has = (k: keyof (typeof days)[number]) => days.some((d) => d[k] !== undefined);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-slate-100">Verlauf</h2>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300"
        >
          <Icons.Gear size={16} /> Diagramme
        </button>
      </div>
      {menuOpen && (
        <Card className="space-y-1">
          <p className="text-xs text-slate-500 mb-1">Was soll im Verlauf erscheinen?</p>
          {CHARTS.map((c) => (
            <label key={c.key} className="flex items-center gap-3 py-1.5 text-sm text-slate-200">
              <input type="checkbox" className="h-4 w-4 accent-[#8B5CF6]" checked={charts.has(c.key)} onChange={() => toggleChart(c.key)} />
              {c.label}
            </label>
          ))}
        </Card>
      )}
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-xl py-2 text-xs font-bold ${range === r ? 'bg-cyber-purple text-white' : 'bg-white/5 text-slate-400'}`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {entries.length === 0 && !error && (
        <Card>
          <p className="text-sm text-slate-400">Noch keine Daten im Zeitraum.</p>
        </Card>
      )}

      {show('body') && has('weight') && (
        <Chart
          title="Gewicht und Körperzusammensetzung"
          hint={`Linien = 7-Tage-Schnitt. Fett + Magermasse = Gewicht. Steigt die Magermasse bei sinkendem Fett, klappt die Recomposition. Rechte Achse: % und BMI.${heightCm ? '' : ' Für den BMI unter Mehr die Körpergröße eintragen.'}`}
          controls={<Chips items={BODY_SERIES.filter((x) => x.key !== 'bmi' || heightCm)} on={bodyOn} toggle={toggleBody} />}
        >
          <ComposedChart data={days}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis yAxisId="kg" {...axis} domain={['dataMin - 2', 'dataMax + 2']} width={36} allowDecimals={false} />
            {(bodyOn.has('fat') || bodyOn.has('bmi')) && <YAxis yAxisId="pct" orientation="right" {...axis} domain={['dataMin - 2', 'dataMax + 2']} width={32} allowDecimals={false} />}
            <Tooltip {...tooltipStyle} />
            {bodyOn.has('weight') && (
              <Line yAxisId="kg" dataKey="weight" name="Gewicht (Tag)" stroke="none" dot={{ r: 1.5, fill: '#64748b', stroke: 'none' }} activeDot={false} isAnimationActive={false} />
            )}
            {bodyOn.has('weight') && <Line yAxisId="kg" dataKey="weightAvg" name="Gewicht kg" stroke="#ADFF2F" dot={false} strokeWidth={2} connectNulls />}
            {bodyOn.has('fatMass') && <Line yAxisId="kg" dataKey="fatMassAvg" name="Fett kg" stroke="#FF6B00" dot={false} strokeWidth={2} connectNulls />}
            {bodyOn.has('lean') && <Line yAxisId="kg" dataKey="leanAvg" name="Magermasse kg" stroke="#00F0FF" dot={false} strokeWidth={2} connectNulls />}
            {bodyOn.has('bmi') && <Line yAxisId="pct" dataKey="bmi" name="BMI" stroke="#F472B6" dot={false} strokeWidth={2} strokeDasharray="2 3" connectNulls />}
            {bodyOn.has('fat') && <Line yAxisId="pct" dataKey="bodyFatAvg" name="Körperfett %" stroke="#FBBF24" dot={false} strokeWidth={2} strokeDasharray="5 3" connectNulls />}
          </ComposedChart>
        </Chart>
      )}

      {show('nutrition') && (has('protein') || has('carbs') || has('fat') || has('kcal')) && (
        <Chart
          title="Ernährung"
          hint={`Ø pro Tag im Zeitraum: ${MACROS.map((m) => (macroAvg[m.key] !== undefined ? `${m.label} ${macroAvg[m.key]} ${m.unit}` : null)).filter(Boolean).join(' · ')}`}
          controls={
            <>
              <Chips items={MACROS} on={macroOn} toggle={toggleMacro} />
              <div className="flex gap-1.5">
                {[false, true].map((w) => (
                  <button
                    key={String(w)}
                    onClick={() => setWeekly(w)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${weekly === w ? 'bg-cyber-purple text-white' : 'bg-white/5 text-slate-400'}`}
                  >
                    {w ? 'Ø pro Woche' : 'pro Tag'}
                  </button>
                ))}
              </div>
            </>
          }
        >
          <ComposedChart data={nutritionDays}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis yAxisId="g" {...axis} width={36} />
            {macroOn.has('kcal') && <YAxis yAxisId="kcal" orientation="right" {...axis} width={40} />}
            <Tooltip {...tooltipStyle} />
            {MACROS.filter((m) => macroOn.has(m.key)).map((m) => (
              <Line
                key={m.key}
                yAxisId={m.key === 'kcal' ? 'kcal' : 'g'}
                dataKey={m.key}
                name={`${m.label} (${m.unit})`}
                stroke={m.color}
                strokeWidth={2}
                strokeDasharray={m.key === 'kcal' ? '5 3' : undefined}
                dot={nutritionDays.length <= 31 ? { r: 2 } : false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </Chart>
      )}

      {show('training') && weeks.length > 0 && (
        <Chart title="Training pro Woche (min)">
          <BarChart data={weeks}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={36} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {sportsUsed.map((s) => (
              <Bar key={s} dataKey={s} name={SPORT_LABEL[s]} stackId="a" fill={SPORT_COLORS[s]} />
            ))}
          </BarChart>
        </Chart>
      )}

      {show('plan') && planWeeks.length > 0 && (
        <Chart title="Plan erfüllt pro Woche" hint="Geplante Einheiten bis heute. Grün = erledigt, grau = nicht erledigt.">
          <BarChart data={planWeeks}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={28} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="done" name="erledigt" stackId="p" fill="#ADFF2F" />
            <Bar dataKey="open" name="nicht erledigt" stackId="p" fill="#334155" radius={[4, 4, 0, 0]} />
          </BarChart>
        </Chart>
      )}

      {show('sleep') && (has('sleepH') || has('hrv')) && (
        <Chart title="Schlaf und HRV" hint="Daten aus Apple Health">
          <ComposedChart data={days}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis yAxisId="h" {...axis} width={28} />
            <YAxis yAxisId="ms" orientation="right" {...axis} width={32} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="h" dataKey="sleepH" name="Schlaf (h)" fill="#4C1D95" />
            <Line yAxisId="ms" dataKey="hrv" name="HRV (ms)" stroke="#00F0FF" dot={false} connectNulls />
          </ComposedChart>
        </Chart>
      )}

      {show('steps') && has('steps') && (
        <Chart title="Schritte pro Tag" hint={`Ø ${average(days, 'steps')?.toLocaleString('de-DE') ?? '–'} pro Tag im Zeitraum. Linie = 7-Tage-Schnitt.`}>
          <ComposedChart data={days.map((d, i, arr) => ({ ...d, stepsAvg: movingAverage(arr.map((x) => x.steps))[i] }))}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis {...axis} width={40} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="steps" name="Schritte" fill="#334155" radius={[3, 3, 0, 0]} />
            <Line dataKey="stepsAvg" name="7-Tage-Schnitt" stroke="#ADFF2F" dot={false} strokeWidth={2} connectNulls />
          </ComposedChart>
        </Chart>
      )}

      {show('vo2') && (has('vo2max') || has('spo2')) && (
        <Chart title="VO2max und Blutsauerstoff" hint="VO2max (Cardiofitness) ist einer der stärksten Langlebigkeits-Marker. Blutsauerstoff misst die Watch nachts.">
          <ComposedChart data={days}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis yAxisId="vo2" {...axis} domain={['dataMin - 2', 'dataMax + 2']} width={32} allowDecimals={false} />
            <YAxis yAxisId="spo2" orientation="right" {...axis} domain={[90, 100]} width={32} unit="%" />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="vo2" dataKey="vo2max" name="VO2max (ml/kg/min)" stroke="#ADFF2F" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line yAxisId="spo2" dataKey="spo2" name="Blutsauerstoff %" stroke="#F472B6" dot={false} connectNulls />
          </ComposedChart>
        </Chart>
      )}

      {show('rhr') && has('restingHr') && (
        <Chart title="Ruhepuls (bpm)">
          <ComposedChart data={days}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis {...axis} domain={['dataMin - 3', 'dataMax + 3']} width={36} />
            <Tooltip {...tooltipStyle} />
            <Line dataKey="restingHr" name="Ruhepuls" stroke="#F472B6" dot={false} connectNulls />
          </ComposedChart>
        </Chart>
      )}
    </div>
  );
};

export default Trends;

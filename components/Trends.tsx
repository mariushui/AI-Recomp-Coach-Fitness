import React, { useEffect, useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SPORTS, SPORT_LABEL, type Entry, type Sport } from '../supabase/functions/_shared/domain';
import { listEntries } from '../lib/entries';
import { average, bmi, dailyStats, movingAverage } from '../lib/stats';
import { BALANCE_BAND, BASELINE_DAYS, balanceLabel, balanceSeries, dailyRecovery, dailyStrain, recoveryLabel, sleepScore, strainColor, strainLabel, strainTarget } from '../lib/recovery';
import RingCalendar, { type RingDay } from './RingCalendar';
import { SLOTS, SLOT_COLOR, SLOT_LABEL, macroSplitSeries, mealBreakdown, splitBySlot, targetSplit } from '../lib/meals';
import { MACRO_COLOR as MACRO_COLORS } from '../lib/today';
import { matchPlans } from '../lib/plans';
import { listSlotOverrideIds, listSlots } from '../lib/planSlotsApi';
import { expandSlots, visiblePlans } from '../lib/planTemplate';
import { loadProfile } from '../lib/profile';
import { CHART_LABEL, loadCharts, loadOrder, normalizeOrder, saveOrder, type ChartKey } from '../lib/chartPrefs';
import SortableList from './SortableList';
import { addDays, dayKey, startOfDay, weekKey } from '../lib/time';
const weekOf = (day: string) => weekKey(new Date(day + 'T12:00:00'));
import { aggregate, buckets, granularityFor, trainingRows } from './trendData';
import { Card, ErrorBox } from './ui';

const RANGES = [7, 30, 90, 365] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Record<Range, string> = { 7: '7 Tage', 30: '30 Tage', 90: '90 Tage', 365: 'Jahr' };

const RANGE_KEY = 'recomp_trend_range';
const loadRange = (): Range => {
  try {
    const r = Number(localStorage.getItem(RANGE_KEY));
    if ((RANGES as readonly number[]).includes(r)) return r as Range;
  } catch {
    /* ignorieren */
  }
  return 30;
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

type Series = { key: string; label: string; color: string };
const BODY: Series[] = [
  { key: 'weight', label: 'Gewicht', color: '#ADFF2F' },
  { key: 'fatMass', label: 'Fett kg', color: '#FF6B00' },
  { key: 'leanMass', label: 'Fettfrei kg', color: '#00F0FF' },
  { key: 'muscle', label: 'Muskeln kg (Waage)', color: '#34D399' },
  { key: 'bodyFat', label: 'Körperfett %', color: '#FBBF24' },
  { key: 'bmi', label: 'BMI', color: '#F472B6' },
];
const MACROS: (Series & { unit: string })[] = [
  { key: 'protein', label: 'Protein', color: '#ADFF2F', unit: 'g' },
  { key: 'carbs', label: 'Kohlenhydrate', color: '#FBBF24', unit: 'g' },
  { key: 'fat', label: 'Fett', color: '#FF375F', unit: 'g' },
  { key: 'kcal', label: 'Kalorien', color: '#8B5CF6', unit: 'kcal' },
];
const ACTIVITY: Series[] = [
  { key: 'steps', label: 'Schritte', color: '#64748b' },
  { key: 'activeKcal', label: 'Bewegen kcal', color: '#FF375F' },
  { key: 'exerciseMin', label: 'Trainieren min', color: '#ADFF2F' },
];
const HEART: Series[] = [
  { key: 'restingHr', label: 'Ruhepuls bpm', color: '#F472B6' },
  { key: 'hrv', label: 'HRV ms', color: '#00F0FF' },
  { key: 'hrRecovery', label: 'Cardio-Erholung bpm', color: '#ADFF2F' },
  { key: 'vo2max', label: 'VO2max', color: '#FBBF24' },
  { key: 'spo2', label: 'Blutsauerstoff %', color: '#8B5CF6' },
];

/** Punkt der Erholungslinie in der Ampelfarbe des Werts */
const RecoveryDot: React.FC<any> = ({ cx, cy, value }) => {
  if (typeof cx !== 'number' || typeof cy !== 'number' || value === undefined || value === null) return null;
  return <circle cx={cx} cy={cy} r={3.5} fill={recoveryLabel(value).color} stroke="#0a0a0b" strokeWidth={1} />;
};

const axis = { stroke: '#475569', fontSize: 11 };
const tooltipStyle = { contentStyle: { background: '#121214', border: '1px solid #333', borderRadius: 12, fontSize: 12 } };

/** An- und abklickbare Auswahl */
const Chips: React.FC<{ items: Series[]; on: Set<string>; toggle: (k: string) => void }> = ({ items, on, toggle }) => (
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

const Chart: React.FC<{ title: string; summary?: string; hint?: string; controls?: React.ReactNode; plain?: boolean; children: React.ReactElement }> = ({ title, summary, hint, controls, plain, children }) => {
  const [open, setOpen] = useState(false);
  return (
  <Card>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
        {summary && <p className="text-xs text-slate-500 mt-0.5">{summary}</p>}
      </div>
      {hint && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="Erklärung"
          aria-expanded={open}
          className={`shrink-0 h-6 w-6 rounded-full border text-[11px] font-bold ${open ? 'border-cyber-purple text-cyber-purple' : 'border-white/15 text-slate-500'}`}
        >
          i
        </button>
      )}
    </div>
    {hint && open && <p className="text-xs text-slate-400 mt-2 rounded-lg bg-cyber-black/60 px-3 py-2">{hint}</p>}
    {controls && <div className="mt-2">{controls}</div>}
    {plain ? (
      <div className="mt-3">{children}</div>
    ) : (
      <div className="h-52 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    )}
  </Card>
  );
};

const has = (rows: Record<string, any>[], k: string) => rows.some((r) => typeof r[k] === 'number' && r[k] !== 0);

const Trends: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [range, setRangeState] = useState<Range>(loadRange);
  const [ringMode, setRingMode] = useState<'recovery' | 'strain' | 'sleep'>('recovery');
  const [mealSlots, toggleMealSlot] = useToggleSet([...SLOTS]);
  const setRange = (r: Range) => {
    setRangeState(r);
    try {
      localStorage.setItem(RANGE_KEY, String(r));
    } catch {
      /* ignorieren */
    }
  };
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pre, setPre] = useState<Entry[]>([]); // 30 Tage vor dem Zeitraum, nur als Vergleichsbasis für die Erholung
  const [error, setError] = useState<string | null>(null);
  const charts = useMemo(loadCharts, [refreshKey]);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [goals, setGoals] = useState<{ protein?: number | null; kcal?: number | null; carbs?: number | null; fat?: number | null }>({});
  const [bodyOn, toggleBody] = useToggleSet(['weight', 'fatMass', 'muscle', 'bmi']);
  const [macroOn, toggleMacro] = useToggleSet(['protein', 'carbs', 'fat']);
  const [sportOn, toggleSport] = useToggleSet([...SPORTS]);
  const [activityOn, toggleActivity] = useToggleSet(['steps', 'activeKcal', 'exerciseMin']);
  const [heartOn, toggleHeart] = useToggleSet(['restingHr', 'hrv', 'hrRecovery', 'vo2max']);

  // Immer die letzten N Tage bis heute. Die Zukunft zeigt kein Diagramm, auch nicht bei 7 Tagen.
  const today0 = startOfDay(new Date());
  const to = addDays(today0, 1);
  const from = addDays(to, -range);
  const g = granularityFor(range);

  useEffect(() => {
    loadProfile()
      .then((p) => {
        setHeightCm(p.height_cm ?? null);
        setGoals({ protein: p.protein_goal_g, kcal: p.kcal_goal, carbs: p.carbs_goal_g, fat: p.fat_goal_g });
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    Promise.all([listEntries(from, to), listSlots(), listSlotOverrideIds(), listEntries(addDays(from, -BASELINE_DAYS), from)])
      .then(([list, slots, overrides, before]) => {
        setEntries(visiblePlans([...list, ...expandSlots(slots, list, from, to, overrides)]));
        setPre(before);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, refreshKey]);

  const show = (k: string) => charts.has(k);
  const [order, setOrder] = useState<ChartKey[]>(loadOrder);
  const [sortMode, setSortMode] = useState(false);
  // Langes Drücken (0,5 s) auf ein Diagramm öffnet die Sortierliste. Bewegt sich der Finger vorher, ist es Scrollen.
  const press = React.useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.t);
    press.current = null;
  };
  const longPress = {
    onPointerDown: (e: React.PointerEvent) => {
      cancelPress();
      press.current = {
        x: e.clientX,
        y: e.clientY,
        t: setTimeout(() => {
          press.current = null;
          try {
            navigator.vibrate?.(15);
          } catch {
            /* nicht überall verfügbar */
          }
          setSortMode(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 500),
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const data = useMemo(() => {
    const days = dailyStats(entries, from, to).map((d) => ({ ...d, bmi: bmi(d.weight, heightCm) }));
    // Erholung braucht 30 Tage Vorlauf als Vergleich, deshalb über den erweiterten Zeitraum rechnen
    const extFrom = addDays(from, -BASELINE_DAYS);
    const ext = dailyStats([...pre, ...entries], extFrom, to);
    const recovery = dailyRecovery(ext);
    const strain = dailyStrain([...pre, ...entries], ext);
    const recByDay = new Map(ext.map((d, i) => [d.day, recovery[i]]));
    const balance = balanceSeries(ext.map((d, i) => ({ recovery: recovery[i], strain: strain.get(d.day) })));
    const balByDay = new Map(ext.map((d, i) => [d.day, balance[i]]));
    days.forEach((d) => {
      const r = recByDay.get(d.day);
      (d as any).recovery = r;
      (d as any).strain = strain.get(d.day);
      const t = strainTarget(r);
      (d as any).strainLo = t?.lo;
      (d as any).strainHi = t?.hi;
      (d as any).balance = balByDay.get(d.day);
    });
    const bs = buckets(from, to, g, range);
    const rows = aggregate(days as any, bs, [
      'weight', 'fatMass', 'leanMass', 'muscle', 'bodyFat', 'bmi' as any, 'waist', 'chest', 'hip', 'arm', 'skinfoldSum', 'recovery' as any, 'strain' as any, 'strainLo' as any, 'strainHi' as any, 'balance' as any,
      'protein', 'carbs', 'fat', 'kcal',
      'steps', 'activeKcal', 'exerciseMin',
      'restingHr', 'hrv', 'hrRecovery', 'sleepH', 'vo2max', 'spo2',
    ]);
    // Körperlinien: bei Tagen 7-Tage-Schnitt, bei Wochen der Wochenmittelwert
    if (g === 'day') {
      for (const s of BODY) {
        const avg = movingAverage(days.map((d) => (d as any)[s.key]));
        rows.forEach((r, i) => (r[`${s.key}Line`] = avg[i]));
      }
    } else {
      rows.forEach((r) => BODY.forEach((s) => (r[`${s.key}Line`] = r[s.key])));
    }
    rows.forEach((r) => {
      r.strainBand = r.strainLo !== undefined && r.strainHi !== undefined ? [r.strainLo, r.strainHi] : undefined;
      r.balOver = typeof r.balance === 'number' && r.balance > BALANCE_BAND ? [BALANCE_BAND, r.balance] : undefined;
      r.balUnder = typeof r.balance === 'number' && r.balance < -BALANCE_BAND ? [r.balance, -BALANCE_BAND] : undefined;
    });
    const states = matchPlans(entries);
    const training = trainingRows(entries, states, bs, g);
    const today = dayKey(new Date());
    const pastPlans = states.filter((s) => dayKey(s.plan.occurred_at) <= today);
    return { days, rows, training, planDone: pastPlans.filter((s) => s.status === 'erledigt').length, planTotal: pastPlans.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, pre, heightCm, range]);

  const { days, rows, training } = data;
  const sportsUsed = SPORTS.filter((s) => training.some((r) => r[s] || r[`${s}_plan`]));
  const dots = g === 'day' && range <= 30;
  const avgText = (items: { key: string; label: string; unit?: string }[]) =>
    items
      .map((m) => {
        const v = average(days, m.key as any);
        return v !== undefined ? `${m.label} ${v.toLocaleString('de-DE')}${m.unit ? ' ' + m.unit : ''}` : null;
      })
      .filter(Boolean)
      .join(' · ');
  const todayKey = dayKey(new Date());
  // Makros je Mahlzeit: Verteilung nach kcal je Tag oder Woche, nur gewählte Mahlzeiten, immer auf 100 %
  const mealSplit = macroSplitSeries(entries, mealSlots as Set<any>, (iso) => (g === 'day' ? dayKey(iso) : weekOf(dayKey(iso))));
  const mealRows = rows.map((r) => ({ key: r.key, label: r.label, ...(mealSplit.get(r.key as string) ?? {}) }));
  const slotSplit = splitBySlot(entries);
  // Schlaf: Schnitt der letzten 7 Nächte bis heute, als Linie im Diagramm
  const last7 = (days as any[]).filter((d) => d.day <= todayKey && d.day > dayKey(addDays(new Date(), -7)) && typeof d.sleepH === 'number').map((d) => d.sleepH as number);
  const sleep7n = last7.length;
  const sleep7 = sleep7n ? Math.round((last7.reduce((a, b) => a + b, 0) / sleep7n) * 10) / 10 : undefined;
  const target = targetSplit(goals);
  const mealTable = mealBreakdown(entries);
  const ringDays: RingDay[] = days.map((d: any) => {
    if (ringMode === 'recovery') return { day: d.day, value: d.recovery, max: 100, color: recoveryLabel(d.recovery).color };
    if (ringMode === 'strain') {
      return { day: d.day, value: d.strain, max: 10, color: strainColor(d.strain) };
    }
    const pct = sleepScore(d.sleepH);
    return { day: d.day, value: pct, max: 100, color: '#8B5CF6' };
  });
  const lastBalance = [...days].reverse().map((d: any) => d.balance).find((b) => typeof b === 'number');
  const strainAvg = (n: number) => {
    const v = days.slice(-n).map((d: any) => d.strain ?? 0);
    return v.length ? Math.round((v.reduce((a: number, b: number) => a + b, 0) / v.length) * 10) / 10 : undefined;
  };
  const xAxis = <XAxis dataKey="label" {...axis} minTickGap={range <= 7 ? 0 : 20} interval={range <= 7 ? 0 : 'preserveStartEnd'} />;

  const sections: Partial<Record<ChartKey, React.ReactNode>> = {
    rings: show('rings') && range <= 30 && (
        <Chart
          plain
          title={CHART_LABEL.rings}
          summary={ringMode === 'recovery' ? 'Erholung je Tag, 0 bis 100' : ringMode === 'strain' ? 'Belastung je Tag, 0 bis 10' : 'Schlaf je Nacht in Prozent von 9 h'}
          controls={
            <div className="flex gap-1.5">
              {([['recovery', 'Erholung'], ['strain', 'Belastung'], ['sleep', 'Schlaf']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setRingMode(k)} aria-pressed={ringMode === k} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${ringMode === k ? 'text-slate-100 border-white/20 bg-white/5' : 'text-slate-500 border-white/5'}`}>
                  {l}
                </button>
              ))}
            </div>
          }
        >
          <RingCalendar days={ringDays} today={todayKey} />
        </Chart>
      ),
    body: show('body') && has(rows, 'weight') && (
        <Chart
          title={CHART_LABEL.body}
          hint={`${g === 'day' ? 'Linien = 7-Tage-Schnitt, Punkte = Tageswert. ' : ''}Jede kg-Linie ist für sich skaliert, damit Trends sichtbar werden. Genaue Werte beim Antippen. Linke Achse: Gewicht, rechte Achse: % und BMI.${heightCm ? '' : ' Für den BMI unter Einstellungen die Körpergröße eintragen.'}`}
          controls={<Chips items={BODY} on={bodyOn} toggle={toggleBody} />}
        >
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis yAxisId="weight" {...axis} domain={['dataMin - 1', 'dataMax + 1']} width={36} allowDecimals={false} hide={!bodyOn.has('weight')} />
            <YAxis yAxisId="fatMass" domain={['dataMin - 1', 'dataMax + 1']} hide />
            <YAxis yAxisId="leanMass" domain={['dataMin - 1', 'dataMax + 1']} hide />
            <YAxis yAxisId="muscle" domain={['dataMin - 1', 'dataMax + 1']} hide />
            <YAxis yAxisId="pct" orientation="right" {...axis} domain={['dataMin - 2', 'dataMax + 2']} width={30} allowDecimals={false} hide={!bodyOn.has('bodyFat') && !bodyOn.has('bmi')} />
            <Tooltip {...tooltipStyle} />
            {dots && bodyOn.has('weight') && (
              <Line yAxisId="weight" dataKey="weight" name="Gewicht (Tag)" stroke="none" dot={{ r: range <= 7 ? 3 : 1.5, fill: range <= 7 ? '#ADFF2F' : '#64748b', stroke: 'none' }} activeDot={false} isAnimationActive={false}>
                {range <= 7 && <LabelList dataKey="weight" position="top" offset={8} fontSize={11} fontWeight={700} fill="#e2e8f0" formatter={(v: any) => (typeof v === 'number' ? v.toFixed(1) : '')} />}
              </Line>
            )}
            {BODY.filter((s) => bodyOn.has(s.key)).map((s) => (
              <Line
                key={s.key}
                yAxisId={s.key === 'bodyFat' || s.key === 'bmi' ? 'pct' : s.key}
                dataKey={`${s.key}Line`}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.key === 'bodyFat' ? '5 3' : s.key === 'bmi' ? '2 3' : undefined}
                dot={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </Chart>
      ),
    nutrition: show('nutrition') && MACROS.some((m) => has(rows, m.key)) && (
        <Chart title={CHART_LABEL.nutrition} summary={`Ø pro Tag: ${avgText(MACROS)}`} controls={<Chips items={MACROS} on={macroOn} toggle={toggleMacro} />}>
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis yAxisId="g" {...axis} width={36} />
            <YAxis yAxisId="kcal" orientation="right" {...axis} width={40} hide={!macroOn.has('kcal')} />
            <Tooltip {...tooltipStyle} />
            {goals.protein && macroOn.has('protein') && <ReferenceLine yAxisId="g" y={goals.protein} ifOverflow="extendDomain" stroke="#ADFF2F" strokeDasharray="4 4" label={{ value: `Ziel ${goals.protein} g`, fill: '#ADFF2F', fontSize: 10, position: 'insideTopLeft' }} />}
            {goals.carbs && macroOn.has('carbs') && <ReferenceLine yAxisId="g" y={goals.carbs} ifOverflow="extendDomain" stroke="#FBBF24" strokeDasharray="4 4" />}
            {goals.fat && macroOn.has('fat') && <ReferenceLine yAxisId="g" y={goals.fat} ifOverflow="extendDomain" stroke="#FF375F" strokeDasharray="4 4" />}
            {goals.kcal && macroOn.has('kcal') && <ReferenceLine yAxisId="kcal" y={goals.kcal} ifOverflow="extendDomain" stroke="#8B5CF6" strokeDasharray="4 4" label={{ value: `Ziel ${goals.kcal} kcal`, fill: '#8B5CF6', fontSize: 10, position: 'insideTopRight' }} />}
            {MACROS.filter((m) => macroOn.has(m.key)).map((m) => (
              <Line
                key={m.key}
                yAxisId={m.key === 'kcal' ? 'kcal' : 'g'}
                dataKey={m.key}
                name={`${m.label} (${m.unit})`}
                stroke={m.color}
                strokeWidth={2}
                strokeDasharray={m.key === 'kcal' ? '5 3' : undefined}
                dot={dots ? { r: 2 } : false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </Chart>
      ),
    measures: show('measures') && ['waist', 'chest', 'hip', 'arm', 'skinfoldSum'].some((k) => has(rows, k)) && (
        <Chart
          title={CHART_LABEL.measures}
          summary={(() => {
            const first = (k: string) => (days as any[]).find((d) => typeof d[k] === 'number')?.[k];
            const last = (k: string) => [...(days as any[])].reverse().find((d) => typeof d[k] === 'number')?.[k];
            const diff = (k: string, label: string, unit: string) => {
              const a = first(k), b = last(k);
              if (a === undefined || b === undefined) return null;
              const d = Math.round((b - a) * 10) / 10;
              return `${label} ${b.toLocaleString('de-DE')} ${unit} (${d > 0 ? '+' : ''}${d.toLocaleString('de-DE')})`;
            };
            return [diff('waist', 'Taille', 'cm'), diff('arm', 'Arm', 'cm'), diff('skinfoldSum', 'Hautfalten', 'mm')].filter(Boolean).join(' · ') || undefined;
          })()}
          hint="Für die Recomposition zählt die Richtung: Taille und Hautfalten runter, Oberarm und Brust gleich oder rauf. Messung alle 14 Tage, morgens nüchtern, immer an denselben Stellen. Linke Achse cm, rechte Achse mm (Summe der 7 Hautfalten)."
        >
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis yAxisId="cm" {...axis} domain={['dataMin - 2', 'dataMax + 2']} width={36} allowDecimals={false} />
            <YAxis yAxisId="mm" orientation="right" {...axis} domain={['dataMin - 5', 'dataMax + 5']} width={34} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Line yAxisId="cm" dataKey="waist" name="Taille cm" stroke="#FF6B00" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line yAxisId="cm" dataKey="chest" name="Brust cm" stroke="#38BDF8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line yAxisId="cm" dataKey="hip" name="Hüfte cm" stroke="#A78BFA" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line yAxisId="cm" dataKey="arm" name="Oberarm cm" stroke="#ADFF2F" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line yAxisId="mm" dataKey="skinfoldSum" name="Hautfalten mm" stroke="#F472B6" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </Chart>
      ),
    meals: show('meals') && mealTable.days > 0 && (
        <Chart
          plain
          title={CHART_LABEL.meals}
          summary={target ? `Ziel: Protein ${target.protein} %, Kohlenhydrate ${target.carbs} %, Fett ${target.fat} % der kcal` : 'Ziele für Protein und Kalorien in den Einstellungen setzen, dann erscheinen die Ziellinien'}
          hint="Jeder Balken ist auf 100 % gestreckt und zeigt, wie sich die Kalorien der gewählten Mahlzeiten auf Protein, Kohlenhydrate und Fett verteilen (Protein und KH 4 kcal je g, Fett 9). Mahlzeiten oben an- und abklicken, Standard ist alles. Gestrichelte Linien: deine Zielverteilung aus den Einstellungen, untere Linie = Ende Protein, obere Linie = Beginn Fett. Liegt Grün unter der unteren Linie, fehlt Protein in dieser Mahlzeit. Tabelle: Verteilung je Mahlzeit über den ganzen Zeitraum."
          controls={
            <Chips
              items={SLOTS.map((sl) => ({ key: sl, label: SLOT_LABEL[sl], color: SLOT_COLOR[sl] }))}
              on={mealSlots}
              toggle={toggleMealSlot}
            />
          }
        >
          <div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mealRows} stackOffset="expand">
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  {xAxis}
                  <YAxis {...axis} width={36} tickFormatter={(v: number) => `${Math.round(v * 100)} %`} ticks={[0, 0.25, 0.5, 0.75, 1]} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: any, n: any) => [`${v} %`, n]} />
                  <Bar dataKey="protein" name="Protein" stackId="p" fill={MACRO_COLORS.protein} isAnimationActive={false} />
                  <Bar dataKey="carbs" name="Kohlenhydrate" stackId="p" fill={MACRO_COLORS.carbs} isAnimationActive={false} />
                  <Bar dataKey="fat" name="Fett" stackId="p" fill={MACRO_COLORS.fat} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  {target && <ReferenceLine y={target.protein / 100} stroke="#f8fafc" strokeDasharray="5 4" strokeWidth={1.5} />}
                  {target && <ReferenceLine y={(target.protein + target.carbs) / 100} stroke="#f8fafc" strokeDasharray="5 4" strokeWidth={1.5} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {(['protein', 'carbs', 'fat'] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="h-2 w-2 rounded-sm" style={{ background: MACRO_COLORS[k] }} />
                  {{ protein: 'Protein', carbs: 'Kohlenhydrate', fat: 'Fett' }[k]}
                </span>
              ))}
              {target && <span className="text-[11px] text-slate-400">- - Ziel</span>}
            </div>
            <table className="w-full mt-3 text-xs tabular-nums">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-bold py-1">Ø pro Tag</th>
                  <th className="text-right font-bold" style={{ color: MACRO_COLORS.protein }}>Protein</th>
                  <th className="text-right font-bold" style={{ color: MACRO_COLORS.carbs }}>KH</th>
                  <th className="text-right font-bold" style={{ color: MACRO_COLORS.fat }}>Fett</th>
                  <th className="text-right font-bold" style={{ color: '#8B5CF6' }}>kcal</th>
                </tr>
              </thead>
              <tbody>
                {SLOTS.filter((sl) => slotSplit[sl]).map((sl) => {
                  const sp = slotSplit[sl]!;
                  const row = mealTable.rows.find((r) => r.slot === sl);
                  // Abweichung vom Ziel ab 5 Prozentpunkten markieren: Protein zu wenig, Fett oder KH zu viel
                  const off = (k: 'protein' | 'carbs' | 'fat') => (target ? (k === 'protein' ? sp.protein < target.protein - 5 : sp[k] > target[k] + 5) : false);
                  return (
                    <tr key={sl} className="border-t border-white/5 text-slate-200">
                      <td className="py-1.5">
                        <span className="inline-block h-2 w-2 rounded-sm mr-1.5" style={{ background: SLOT_COLOR[sl] }} />
                        {SLOT_LABEL[sl]}
                      </td>
                      {(['protein', 'carbs', 'fat'] as const).map((k) => (
                        <td key={k} className={`text-right ${off(k) ? 'font-bold text-[#FF6B00]' : ''}`} title={`${sp[k]} % der kcal`}>
                          {row?.avg[k] ?? '–'} g
                        </td>
                      ))}
                      <td className="text-right">{row?.avg.kcal ?? '–'}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-white/10 font-bold text-slate-100">
                  <td className="py-1.5">Summe</td>
                  {(['protein', 'carbs', 'fat'] as const).map((k) => (
                    <td key={k} className="text-right">{mealTable.rows.reduce((a, r) => a + r.avg[k], 0)} g</td>
                  ))}
                  <td className="text-right">{mealTable.rows.reduce((a, r) => a + r.avg.kcal, 0)}</td>
                </tr>
              </tbody>
            </table>
            {target && (
              <p className="text-[11px] text-slate-500 mt-2">
                Orange = Anteil an den kcal dieser Mahlzeit mehr als 5 Prozentpunkte vom Ziel ({target.protein} % Protein, {target.carbs} % KH, {target.fat} % Fett) weg: zu wenig Protein, zu viel KH oder Fett.
              </p>
            )}
          </div>
        </Chart>
      ),
    heart: show('heart') && HEART.some((h) => has(rows, h.key)) && (
        <Chart title={CHART_LABEL.heart} summary={`Ø: ${avgText([{ key: 'restingHr', label: 'Ruhepuls', unit: 'bpm' }, { key: 'hrv', label: 'HRV', unit: 'ms' }, { key: 'hrRecovery', label: 'Cardio-Erholung', unit: 'bpm' }, { key: 'vo2max', label: 'VO2max' }, { key: 'spo2', label: 'SpO2', unit: '%' }])}`} hint="Steigende HRV, Cardio-Erholung und VO2max sowie ein sinkender Ruhepuls zeigen bessere Fitness. Cardio-Erholung = Pulsabfall in der ersten Minute nach dem Training. VO2max (Cardiofitness) ist einer der stärksten Marker für ein langes Leben. Blutsauerstoff misst die Watch nachts, standardmäßig ausgeblendet, weil er kaum schwankt." controls={<Chips items={HEART} on={heartOn} toggle={toggleHeart} />}>
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis {...axis} width={32} domain={['dataMin - 5', 'dataMax + 5']} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            {HEART.filter((h) => heartOn.has(h.key)).map((h) => (
              <Line key={h.key} dataKey={h.key} name={h.label} stroke={h.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            ))}
          </ComposedChart>
        </Chart>
      ),
    sleep: show('sleep') && has(rows, 'sleepH') && (
        <Chart title={CHART_LABEL.sleep} summary={`Ø 7 Tage ${sleep7?.toLocaleString('de-DE') ?? '–'} h aus ${sleep7n} Nächten · Ø Zeitraum ${average(days, 'sleepH' as any)?.toLocaleString('de-DE') ?? '–'} h`}>
          <BarChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis {...axis} width={28} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="sleepH" name="Schlaf (h)" fill="#4C1D95" radius={[3, 3, 0, 0]} />
            {sleep7 !== undefined && (
              <ReferenceLine y={sleep7} stroke="#C4B5FD" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `Ø 7 Tage ${sleep7.toLocaleString('de-DE')} h`, position: 'insideTopRight', fill: '#C4B5FD', fontSize: 11 }} />
            )}
          </BarChart>
        </Chart>
      ),
    recovery: show('recovery') && (has(rows, 'recovery') || has(rows, 'strain')) && (
        <Chart
          title={CHART_LABEL.recovery}
          summary={`Ø Erholung ${average(days, 'recovery' as any) ?? '–'} · Ø Belastung ${average(days, 'strain' as any) ?? '–'} pro Tag`}
          hint="Erholung (0 bis 100, 50 = dein Schnitt) aus HRV, Ruhepuls und Schlaf der Nacht, verglichen mit deinen letzten 30 Tagen. Punkte: grün ab 67, gelb ab 34, rot darunter. Belastung (0 bis 10, Marathon = 10) aus Trainingsminuten mal RPE, ohne RPE gilt ein Wert je Sportart. Das graue Band ist der Zielbereich der Belastung, er steigt mit der Erholung. Belastung im Band = passend trainiert, darüber bei roter Erholung ist das Muster, das du vermeiden willst."
        >
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis yAxisId="strain" {...axis} domain={[0, 10]} width={30} ticks={[0, 3.3, 6.6, 10]} tickFormatter={(v: number) => v.toFixed(1)} />
            <YAxis yAxisId="rec" orientation="right" {...axis} domain={[0, 100]} width={34} ticks={[0, 33, 66, 100]} unit="%" />
            <Tooltip {...tooltipStyle} formatter={(v: any, name: string) => (Array.isArray(v) ? [`${v[0]} bis ${v[1]}`, name] : [v, name])} />
            <Area yAxisId="strain" dataKey="strainBand" name="Zielbereich Belastung" stroke="none" fill="#94a3b8" fillOpacity={0.18} connectNulls isAnimationActive={false} />
            <Line yAxisId="rec" dataKey="recovery" name="Erholung %" stroke="#94a3b8" strokeWidth={2} dot={<RecoveryDot />} connectNulls />
            <Line yAxisId="strain" dataKey="strain" name="Belastung" stroke="#38BDF8" strokeWidth={2} dot={{ r: 2.5, fill: '#38BDF8', stroke: 'none' }} connectNulls />
          </ComposedChart>
        </Chart>
      ),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-slate-100">Verlauf</h2>
        <span className="text-[11px] text-slate-500">Lange drücken zum Umsortieren</span>
      </div>
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
      {g !== 'day' && <p className="text-[11px] text-slate-500 -mt-2">Ein Wert pro Woche: Mittelwert, Training als Summe.</p>}
      {error && <ErrorBox>{error}</ErrorBox>}

      {sortMode ? (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Reihenfolge</p>
            <button type="button" onClick={() => setSortMode(false)} className="rounded-lg bg-cyber-green px-3 py-1.5 text-xs font-bold text-cyber-black">
              Fertig
            </button>
          </div>
          <p className="text-xs text-slate-500">Am Griff ☰ ziehen oder Pfeile nutzen. Gilt auch für die Einstellungen.</p>
          <SortableList
            items={order.map((k) => ({ key: k, label: CHART_LABEL[k], muted: !show(k) }))}
            onChange={(keys) => {
              const next = normalizeOrder(keys);
              setOrder(next);
              saveOrder(next);
            }}
          />
        </Card>
      ) : (
        order.map((k) =>
          sections[k] ? (
            <div key={k} {...longPress} className="select-none" style={{ WebkitTouchCallout: 'none' }}>
              {sections[k]}
            </div>
          ) : null,
        )
      )}

      {entries.length === 0 && !error && (
        <Card>
          <p className="text-sm text-slate-400">Noch keine Daten im Zeitraum.</p>
        </Card>
      )}
    </div>
  );
};

export default Trends;

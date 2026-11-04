import React, { useEffect, useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SPORTS, SPORT_LABEL, type Entry, type Sport } from '../supabase/functions/_shared/domain';
import { listEntries } from '../lib/entries';
import { average, bmi, dailyStats, movingAverage } from '../lib/stats';
import { BALANCE_BAND, BASELINE_DAYS, balanceLabel, balanceSeries, dailyRecovery, dailyStrain, recoveryLabel, sleepScore, strainLabel, strainTarget } from '../lib/recovery';
import RingCalendar, { type RingDay } from './RingCalendar';
import { SLOTS, SLOT_COLOR, SLOT_LABEL, mealBreakdown, slotSeries, type Macro } from '../lib/meals';
import { matchPlans } from '../lib/plans';
import { listSlotOverrideIds, listSlots } from '../lib/planSlotsApi';
import { expandSlots, visiblePlans } from '../lib/planTemplate';
import { loadProfile } from '../lib/profile';
import { loadCharts } from '../lib/chartPrefs';
import { addDays, dayKey, startOfDay, weekKey } from '../lib/time';
const weekOf = (day: string) => weekKey(new Date(day + 'T12:00:00'));
import { aggregate, buckets, granularityFor, trainingRows } from './trendData';
import { Card, ErrorBox } from './ui';

const RANGES = [7, 30, 90, 365] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Record<Range, string> = { 7: 'Woche', 30: '30 Tage', 90: '90 Tage', 365: 'Jahr' };

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
  const [mealMacro, setMealMacro] = useState<Macro>('protein');
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
  const [heartOn, toggleHeart] = useToggleSet(['restingHr', 'hrv', 'hrRecovery']);

  // Woche = Kalenderwoche Montag bis Sonntag, inklusive kommender Tage (für den Plan-Schatten)
  const today0 = startOfDay(new Date());
  const monday = addDays(today0, -((today0.getDay() + 6) % 7));
  const to = range === 7 ? addDays(monday, 7) : addDays(today0, 1);
  const from = range === 7 ? monday : addDays(to, -range);
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
  // Ernährung nach Mahlzeit: Tageswerte je Zeitfenster, bei Wochen Mittel über Tage mit Essen
  const mealDaily = slotSeries(entries, mealMacro, (iso) => dayKey(iso));
  const mealRows = rows.map((r) => {
    const keys = g === 'day' ? [r.key as string] : (days as any[]).filter((d) => weekOf(d.day) === r.key).map((d) => d.day);
    const withFood = keys.map((k) => mealDaily.get(k)).filter(Boolean) as Record<string, number>[];
    const out: Record<string, any> = { key: r.key, label: r.label };
    if (withFood.length) for (const s of SLOTS) out[s] = Math.round(withFood.reduce((a, x) => a + x[s], 0) / withFood.length);
    return out;
  });
  const mealTable = mealBreakdown(entries);
  const ringDays: RingDay[] = days.map((d: any) => {
    if (ringMode === 'recovery') return { day: d.day, value: d.recovery, max: 100, color: recoveryLabel(d.recovery).color };
    if (ringMode === 'strain') {
      const l = strainLabel(d.strain);
      const color = l === 'leicht' ? '#38BDF8' : l === 'moderat' ? '#FBBF24' : l === 'hoch' ? '#FF6B00' : l === 'sehr hoch' ? '#FF375F' : '#475569';
      return { day: d.day, value: d.strain, max: 10, color };
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-slate-100">Verlauf</h2>
        <span className="text-[11px] text-slate-500">Diagramme wählst du unter Einstellungen</span>
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

      {show('rings') && range <= 30 && (
        <Chart
          plain
          title="Ring-Kalender"
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
      )}

      {show('body') && has(rows, 'weight') && (
        <Chart
          title="Gewicht und Körper"
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
      )}

      {show('nutrition') && MACROS.some((m) => has(rows, m.key)) && (
        <Chart title="Ernährung" summary={`Ø pro Tag: ${avgText(MACROS)}`} controls={<Chips items={MACROS} on={macroOn} toggle={toggleMacro} />}>
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
      )}

      {show('measures') && ['waist', 'chest', 'hip', 'arm', 'skinfoldSum'].some((k) => has(rows, k)) && (
        <Chart
          title="Umfänge und Hautfalten"
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
      )}

      {show('meals') && mealTable.days > 0 && (
        <Chart
          plain
          title="Ernährung nach Mahlzeit"
          summary={`${mealTable.proteinMealsPerDay.toLocaleString('de-DE')} proteinreiche Mahlzeiten pro Tag (ab 30 g)`}
          hint="Balken: wie sich der gewählte Nährwert auf Frühstück, Mittag, Abend und Snacks verteilt. Ohne Angabe der Mahlzeit entscheidet die Uhrzeit, Shakes und Ergänzungen zählen zu Snacks. Tabelle: Mittel pro Tag mit Essen im Zeitraum. Für die Recomposition zählen Protein über den Tag verteilt und ein Kaloriendefizit, Kohlenhydrate eher dort, wo du Konzentration oder Training brauchst."
          controls={
            <div className="flex gap-1.5 flex-wrap">
              {MACROS.map((mm) => (
                <button key={mm.key} type="button" onClick={() => setMealMacro(mm.key as Macro)} aria-pressed={mealMacro === mm.key} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${mealMacro === mm.key ? 'text-slate-100 border-white/20 bg-white/5' : 'text-slate-500 border-white/5'}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: mm.color }} />
                  {mm.label}
                </button>
              ))}
            </div>
          }
        >
          <div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mealRows}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  {xAxis}
                  <YAxis {...axis} width={36} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  {SLOTS.map((s, i) => (
                    <Bar key={s} dataKey={s} name={SLOT_LABEL[s]} stackId="m" fill={SLOT_COLOR[s]} radius={i === SLOTS.length - 1 ? [3, 3, 0, 0] : undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {SLOTS.map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="h-2 w-2 rounded-sm" style={{ background: SLOT_COLOR[s] }} />
                  {SLOT_LABEL[s]}
                </span>
              ))}
            </div>
            <table className="w-full mt-3 text-xs tabular-nums">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-bold py-1">Ø pro Tag</th>
                  <th className="text-right font-bold" style={{ color: '#ADFF2F' }}>Protein</th>
                  <th className="text-right font-bold" style={{ color: '#FBBF24' }}>KH</th>
                  <th className="text-right font-bold" style={{ color: '#FF375F' }}>Fett</th>
                  <th className="text-right font-bold" style={{ color: '#8B5CF6' }}>kcal</th>
                  <th className="text-right font-bold">Anteil</th>
                </tr>
              </thead>
              <tbody>
                {mealTable.rows.map((r) => (
                  <tr key={r.slot} className="border-t border-white/5 text-slate-200">
                    <td className="py-1.5">
                      <span className="inline-block h-2 w-2 rounded-sm mr-1.5" style={{ background: SLOT_COLOR[r.slot] }} />
                      {SLOT_LABEL[r.slot]}
                    </td>
                    <td className="text-right">{r.avg.protein} g</td>
                    <td className="text-right">{r.avg.carbs} g</td>
                    <td className="text-right">{r.avg.fat} g</td>
                    <td className="text-right">{r.avg.kcal}</td>
                    <td className="text-right text-slate-400">{Math.round(r.share * 100)} %</td>
                  </tr>
                ))}
                <tr className="border-t border-white/10 font-bold text-slate-100">
                  <td className="py-1.5">Summe</td>
                  {(['protein', 'carbs', 'fat'] as const).map((k) => (
                    <td key={k} className="text-right">{mealTable.rows.reduce((a, r) => a + r.avg[k], 0)} g</td>
                  ))}
                  <td className="text-right">{mealTable.rows.reduce((a, r) => a + r.avg.kcal, 0)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </Chart>
      )}

      {show('training') && sportsUsed.length > 0 && (
        <Chart
          title={g === 'day' ? 'Training pro Tag (min)' : 'Training pro Woche (min)'}
          hint={`Volle Farbe = trainiert, Schatten = geplant, aber nicht trainiert.${data.planTotal ? ` Plan bis heute: ${data.planDone} von ${data.planTotal} Einheiten erledigt.` : ''}`}
          controls={<Chips items={sportsUsed.map((s) => ({ key: s, label: SPORT_LABEL[s], color: SPORT_COLORS[s] }))} on={sportOn} toggle={toggleSport} />}
        >
          <BarChart data={training}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis {...axis} width={36} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {sportsUsed
              .filter((s) => sportOn.has(s))
              .flatMap((s: Sport) => [
                <Bar key={s} dataKey={s} name={SPORT_LABEL[s]} stackId="t" fill={SPORT_COLORS[s]} />,
                <Bar key={`${s}_plan`} dataKey={`${s}_plan`} name={`${SPORT_LABEL[s]} geplant, offen`} stackId="t" fill={SPORT_COLORS[s]} fillOpacity={0.18} stroke={SPORT_COLORS[s]} strokeOpacity={0.45} strokeDasharray="3 2" />,
              ])}
          </BarChart>
        </Chart>
      )}

      {show('activity') && ACTIVITY.some((a) => has(rows, a.key)) && (
        <Chart title="Aktivität" summary={`Ø pro Tag: ${avgText([{ key: 'steps', label: 'Schritte' }, { key: 'activeKcal', label: 'Bewegen', unit: 'kcal' }, { key: 'exerciseMin', label: 'Trainieren', unit: 'min' }])}`} controls={<Chips items={ACTIVITY} on={activityOn} toggle={toggleActivity} />}>
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis yAxisId="steps" {...axis} width={40} hide={!activityOn.has('steps')} />
            <YAxis yAxisId="kcal" orientation="right" {...axis} width={36} hide={!activityOn.has('activeKcal')} />
            <YAxis yAxisId="min" hide />
            <Tooltip {...tooltipStyle} />
            {activityOn.has('steps') && <Bar yAxisId="steps" dataKey="steps" name="Schritte" fill="#334155" radius={[3, 3, 0, 0]} />}
            {activityOn.has('activeKcal') && <Line yAxisId="kcal" dataKey="activeKcal" name="Bewegen (aktive kcal)" stroke="#FF375F" strokeWidth={2} dot={{ r: 2 }} connectNulls />}
            {activityOn.has('exerciseMin') && <Line yAxisId="min" dataKey="exerciseMin" name="Trainieren (min)" stroke="#ADFF2F" strokeWidth={2} dot={{ r: 2 }} connectNulls />}
          </ComposedChart>
        </Chart>
      )}

      {show('heart') && HEART.some((h) => has(rows, h.key)) && (
        <Chart title="Herz" summary={`Ø: ${avgText([{ key: 'restingHr', label: 'Ruhepuls', unit: 'bpm' }, { key: 'hrv', label: 'HRV', unit: 'ms' }, { key: 'hrRecovery', label: 'Cardio-Erholung', unit: 'bpm' }])}`} hint="Steigende HRV und Cardio-Erholung sowie ein sinkender Ruhepuls zeigen bessere Fitness. Cardio-Erholung = Pulsabfall in der ersten Minute nach dem Training." controls={<Chips items={HEART} on={heartOn} toggle={toggleHeart} />}>
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
      )}

      {show('sleep') && has(rows, 'sleepH') && (
        <Chart title="Schlaf (h)" summary={`Ø ${average(days, 'sleepH' as any) ?? '–'} h pro Nacht`}>
          <BarChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis {...axis} width={28} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="sleepH" name="Schlaf (h)" fill="#4C1D95" radius={[3, 3, 0, 0]} />
          </BarChart>
        </Chart>
      )}

      {show('vo2') && (has(rows, 'vo2max') || has(rows, 'spo2')) && (
        <Chart title="VO2max und Blutsauerstoff" hint="VO2max (Cardiofitness) ist einer der stärksten Langlebigkeits-Marker. Blutsauerstoff misst die Watch nachts.">
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis yAxisId="vo2" {...axis} domain={['dataMin - 2', 'dataMax + 2']} width={32} allowDecimals={false} />
            <YAxis yAxisId="spo2" orientation="right" {...axis} domain={[90, 100]} width={32} unit="%" />
            <Tooltip {...tooltipStyle} />
            <Line yAxisId="vo2" dataKey="vo2max" name="VO2max (ml/kg/min)" stroke="#ADFF2F" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line yAxisId="spo2" dataKey="spo2" name="Blutsauerstoff %" stroke="#F472B6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </ComposedChart>
        </Chart>
      )}

      {show('recovery') && (has(rows, 'recovery') || has(rows, 'strain')) && (
        <Chart
          title="Erholung und Belastung"
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
      )}

      {show('balance') && has(rows, 'balance') && (
        <Chart
          title="Balance: Belastung zu Erholung"
          summary={`${balanceLabel(lastBalance).text} · Ø Belastung 7 Tage ${strainAvg(7)?.toLocaleString('de-DE') ?? '–'}, 28 Tage ${strainAvg(28)?.toLocaleString('de-DE') ?? '–'}`}
          hint="7-Tage-Mittel von Belastung minus Mitte deines Zielbereichs. Im grauen Band trainierst du passend zur Erholung. Rot darüber = Überlastung, blau darunter = erholsam mit Luft nach oben. Die Zahlen rechts: mittlere Belastung der letzten 7 und 28 Tage, kurzfristig deutlich über langfristig heißt steiler Anstieg."
        >
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            {xAxis}
            <YAxis {...axis} domain={[(min: number) => Math.min(-3, Math.floor(min)), (max: number) => Math.max(3, Math.ceil(max))]} width={30} tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))} />
            <Tooltip {...tooltipStyle} formatter={(v: any, name: string) => (Array.isArray(v) ? [`${v[0]} bis ${v[1]}`, name] : [v, name])} />
            <ReferenceArea y1={-BALANCE_BAND} y2={BALANCE_BAND} shape={(p: any) => <rect x={p.x} y={p.y} width={p.width} height={p.height} fill="#94a3b8" fillOpacity={0.15} />} />
            <ReferenceLine y={0} stroke="#334155" />
            <Area dataKey="balOver" name="Überlastung" stroke="none" fill="#FF375F" fillOpacity={0.55} connectNulls={false} isAnimationActive={false} />
            <Area dataKey="balUnder" name="Erholsam" stroke="none" fill="#38BDF8" fillOpacity={0.5} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="balance" name="Balance" stroke="#cbd5e1" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </Chart>
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

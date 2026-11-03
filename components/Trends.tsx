import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SPORTS, SPORT_LABEL, type Entry } from '../supabase/functions/_shared/domain';
import { listEntries } from '../lib/entries';
import { dailyStats, movingAverage, weeklySportMinutes } from '../lib/stats';
import { matchPlans, weeklyPlanStats } from '../lib/plans';
import { listSlots } from '../lib/planSlotsApi';
import { expandSlots, visiblePlans } from '../lib/planTemplate';
import { addDays, startOfDay } from '../lib/time';
import { Card, ErrorBox } from './ui';

const RANGES = [30, 90, 365] as const;
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

const Chart: React.FC<{ title: string; hint?: string; children: React.ReactElement }> = ({ title, hint, children }) => (
  <Card>
    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
    {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
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

  const days = useMemo(() => {
    const s = dailyStats(entries, from, to);
    const avg = movingAverage(s.map((d) => d.weight));
    return s.map((d, i) => ({ ...d, weightAvg: avg[i], label: shortDay(d.day) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);
  const weeks = useMemo(() => weeklySportMinutes(entries).map((w) => ({ ...w, label: shortDay(w.week) })), [entries]);
  const planWeeks = useMemo(
    () => weeklyPlanStats(matchPlans(entries)).map((w) => ({ ...w, label: shortDay(w.week), open: w.planned - w.done })),
    [entries],
  );
  const sportsUsed = SPORTS.filter((s) => weeks.some((w) => w[s]));
  const has = (k: keyof (typeof days)[number]) => days.some((d) => d[k] !== undefined);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-xl py-2 text-sm font-bold ${range === r ? 'bg-cyber-purple text-white' : 'bg-white/5 text-slate-400'}`}
          >
            {r === 365 ? '1 Jahr' : `${r} Tage`}
          </button>
        ))}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {entries.length === 0 && !error && (
        <Card>
          <p className="text-sm text-slate-400">Noch keine Daten im Zeitraum.</p>
        </Card>
      )}

      {has('weight') && (
        <Chart title="Gewicht" hint="Punkte = Tageswert, Linie = 7-Tage-Schnitt. Nur der Schnitt ist aussagekräftig.">
          <ComposedChart data={days}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis {...axis} domain={['dataMin - 1', 'dataMax + 1']} width={36} />
            <Tooltip {...tooltipStyle} />
            <Scatter dataKey="weight" name="Tageswert" fill="#64748b" />
            <Line dataKey="weightAvg" name="7-Tage-Schnitt" stroke="#ADFF2F" dot={false} strokeWidth={2} connectNulls />
          </ComposedChart>
        </Chart>
      )}

      {has('bodyFat') && (
        <Chart title="Körperfett %" hint="Waagen-Werte schwanken stark. Auf den Trend über Wochen achten.">
          <ComposedChart data={days}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis {...axis} domain={['dataMin - 1', 'dataMax + 1']} width={36} />
            <Tooltip {...tooltipStyle} />
            <Line dataKey="bodyFat" name="KFA" stroke="#FF6B00" dot={{ r: 2 }} connectNulls />
          </ComposedChart>
        </Chart>
      )}

      {has('protein') && (
        <Chart title="Protein pro Tag (g)">
          <BarChart data={days}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" {...axis} minTickGap={24} />
            <YAxis {...axis} width={36} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="protein" name="Protein" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </Chart>
      )}

      {weeks.length > 0 && (
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

      {planWeeks.length > 0 && (
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

      {(has('sleepH') || has('hrv')) && (
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

      {has('restingHr') && (
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

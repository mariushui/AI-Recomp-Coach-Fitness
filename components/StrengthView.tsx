// Kraft: Training starten, Wochenvolumen je Einheitstyp, harte Sätze je Muskelgruppe, Verlauf je Übung, Trainingshistorie.
import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SESSION_KINDS, SESSION_KIND_LABEL, type Entry, type SessionKind, type WorkoutData } from '../supabase/functions/_shared/domain';
import { insertEntries, listStrengthHistory } from '../lib/entries';
import { MUSCLES, MUSCLE_LABEL, allExercises } from '../lib/exercises';
import { bodyweightAt, exerciseHistory, isStrength, sessionKindOf, sessionSets, sessionVolume, setsOf, setsZone, summarizeSets, usedExercises, weeklyStrength } from '../lib/strength';
import { cacheHistory, cachedHistory, loadDraft, loadTemplates } from '../lib/strengthTemplates';
import { flush, queuedCount } from '../lib/offlineQueue';
import { addDays, weekKey } from '../lib/time';
import StrengthLogger, { draftFromTemplate, type StrengthDraft } from './StrengthLogger';
import { Card } from './ui';

const KIND_COLOR: Record<SessionKind, string> = {
  push: '#8B5CF6',
  pull: '#00F0FF',
  beine: '#ADFF2F',
  oberkoerper: '#F472B6',
  ganzkoerper: '#FBBF24',
  arme: '#FF6B00',
  rumpf: '#38BDF8',
  einzel: '#94A3B8',
};
const axis = { stroke: '#475569', fontSize: 11 };
const tooltipStyle = { contentStyle: { background: '#121214', border: '1px solid #333', borderRadius: 12, fontSize: 12 } };
const kg = (n: number) => `${Math.round(n).toLocaleString('de-DE')} kg`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
const weekLabel = (wk: string) => new Date(wk + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });

const Title: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <div>
    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{children}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
);

const StrengthView: React.FC<{ refreshKey: number; onSaved: () => void }> = ({ refreshKey, onSaved }) => {
  const [entries, setEntries] = useState<Entry[]>(() => cachedHistory());
  const [offline, setOffline] = useState(false);
  const [logger, setLogger] = useState<StrengthDraft | null>(null);
  const [hasDraft, setHasDraft] = useState(() => !!loadDraft());
  const [note, setNote] = useState<string | null>(null);
  const [kindsOn, setKindsOn] = useState<Set<SessionKind> | null>(null);
  const [exKey, setExKey] = useState<string | null>(null);
  const templates = useMemo(loadTemplates, [logger]);
  const exercises = useMemo(() => allExercises(), [logger]);

  useEffect(() => {
    // Erst Wartendes aus dem Keller senden, dann neu laden, sonst fehlt es im lokalen Zwischenspeicher
    flush(insertEntries)
      .then(() => listStrengthHistory())
      .then((list) => {
        cacheHistory(list);
        setEntries(cachedHistory());
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }, [refreshKey]);

  const strength = useMemo(() => entries.filter(isStrength).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), [entries]);
  const weeks = useMemo(() => {
    const rows = weeklyStrength(entries, exercises);
    // Letzte 12 Wochen lückenlos, auch Wochen ohne Training
    const out = [];
    const thisWeek = new Date(weekKey(new Date()) + 'T12:00:00');
    for (let i = 11; i >= 0; i--) {
      const wk = weekKey(addDays(thisWeek, -7 * i));
      out.push(rows.find((r) => r.week === wk) ?? { week: wk, volume: Object.fromEntries(SESSION_KINDS.map((k) => [k, 0])), sessions: 0, sets: 0, muscleSets: Object.fromEntries(MUSCLES.map((m) => [m, 0])) });
    }
    return out as ReturnType<typeof weeklyStrength>;
  }, [entries, exercises]);
  const kindsUsed = SESSION_KINDS.filter((k) => weeks.some((w) => w.volume[k] > 0));
  const activeKinds = kindsOn ?? new Set(kindsUsed);
  const used = useMemo(() => usedExercises(entries, exercises), [entries, exercises]);
  const selected = exKey ?? used[0]?.key ?? null;
  const history = useMemo(() => (selected ? exerciseHistory(entries, selected, exercises) : []), [entries, selected, exercises]);

  const thisWeek = weeks[weeks.length - 1];
  const lastWeeks = weeks.slice(-5, -1); // die 4 abgeschlossenen Wochen vor dieser
  const avgMuscle = (m: (typeof MUSCLES)[number]) => Math.round((lastWeeks.reduce((a, w) => a + w.muscleSets[m], 0) / lastWeeks.length) * 10) / 10;

  const start = (t: (typeof templates)[number] | null) => setLogger(draftFromTemplate(t, entries));
  const resume = () => {
    const d = loadDraft<StrengthDraft>();
    if (d) setLogger(d);
  };

  const toggleKind = (k: SessionKind) =>
    setKindsOn(() => {
      const n = new Set(activeKinds);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Tabelle: jede Einheit mit Volumen und Veränderung zur letzten Einheit derselben Art
  const table = strength.slice(0, 30).map((e, i) => {
    const w = e.data as WorkoutData;
    const kind = sessionKindOf(w, exercises);
    const vol = sessionVolume(w, bodyweightAt(entries, e.occurred_at), exercises);
    const prev = strength.slice(i + 1).find((x) => sessionKindOf(x.data as WorkoutData, exercises) === kind);
    const prevVol = prev ? sessionVolume(prev.data as WorkoutData, bodyweightAt(entries, prev.occurred_at), exercises) : undefined;
    return { e, w, kind, vol, sets: sessionSets(w), delta: prevVol ? Math.round(((vol - prevVol) / prevVol) * 100) : undefined };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-slate-100">Kraft</h2>
        {offline && <span className="text-[11px] text-amber-300">ohne Netz, Werte vom Gerät</span>}
      </div>
      {note && <p className="rounded-xl bg-cyber-green/10 border border-cyber-green/30 px-3 py-2 text-xs text-slate-200">{note}</p>}

      <Card className="space-y-3">
        {hasDraft ? (
          <button type="button" onClick={resume} className="w-full rounded-xl bg-cyber-green text-cyber-black py-3 font-bold">
            Training fortsetzen
          </button>
        ) : (
          <Title sub="Vorlage wählen. Werte der letzten Einheit stehen grau im Feld.">Training starten</Title>
        )}
        <div className="grid grid-cols-2 gap-2">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => start(t)} className="rounded-xl bg-cyber-black border border-white/10 px-3 py-3 text-left">
              <span className="block text-sm font-bold text-slate-100 leading-tight">{t.name}</span>
              <span className="block text-[11px] mt-0.5" style={{ color: KIND_COLOR[t.kind] }}>
                {SESSION_KIND_LABEL[t.kind]} · {t.exercises.length} Übungen
              </span>
            </button>
          ))}
          <button type="button" onClick={() => start(null)} className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-left">
            <span className="block text-sm font-bold text-slate-300">Freies Training</span>
            <span className="block text-[11px] text-slate-500 mt-0.5">Übungen selbst wählen</span>
          </button>
        </div>
      </Card>

      {strength.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Volumen', kg(SESSION_KINDS.reduce((a, k) => a + thisWeek.volume[k], 0))],
              ['Einheiten', String(thisWeek.sessions)],
              ['Arbeitssätze', String(thisWeek.sets)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-cyber-gray border border-white/5 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{l}</p>
                <p className="font-display text-lg font-bold text-slate-100 mt-0.5">{v}</p>
                <p className="text-[10px] text-slate-500">diese Woche</p>
              </div>
            ))}
          </div>

          <Card>
            <Title sub="Last x Wdh. aller Arbeitssätze, Aufwärmen zählt nicht. 12 Wochen.">Wochenvolumen je Einheit</Title>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {kindsUsed.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKind(k)}
                  aria-pressed={activeKinds.has(k)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${activeKinds.has(k) ? 'text-slate-100 border-white/20 bg-white/5' : 'text-slate-500 border-white/5'}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: activeKinds.has(k) ? KIND_COLOR[k] : 'transparent', border: `1.5px solid ${KIND_COLOR[k]}` }} />
                  {SESSION_KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <div className="h-52 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeks.map((w) => ({ label: weekLabel(w.week), ...w.volume }))} margin={{ left: -8, right: 4 }}>
                  <CartesianGrid stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis {...axis} width={44} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}t` : String(v))} />
                  <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => [kg(Number(v)), SESSION_KIND_LABEL[n as SessionKind] ?? n]} />
                  {kindsUsed
                    .filter((k) => activeKinds.has(k))
                    .map((k) => (
                      <Bar key={k} dataKey={k} stackId="v" fill={KIND_COLOR[k]} radius={[0, 0, 0, 0]} />
                    ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <Title sub="Hauptmuskel 1 Satz, mitarbeitender Muskel 0,5. Ziel nach Galpin 10 bis 20 pro Woche.">Harte Sätze je Muskelgruppe</Title>
            <table className="w-full mt-3 text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-bold pb-1">Muskel</th>
                  <th className="text-right font-bold pb-1">Woche</th>
                  <th className="text-right font-bold pb-1">Ø 4 Wo.</th>
                  <th className="pb-1 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {MUSCLES.map((m) => {
                  const avg = avgMuscle(m);
                  const z = setsZone(avg);
                  return (
                    <tr key={m} className="border-t border-white/5">
                      <td className="py-1.5 text-slate-200">{MUSCLE_LABEL[m]}</td>
                      <td className="py-1.5 text-right text-slate-300 tabular-nums">{thisWeek.muscleSets[m].toLocaleString('de-DE')}</td>
                      <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: z.color }}>
                        {avg.toLocaleString('de-DE')}
                      </td>
                      <td className="py-1.5 pl-2">
                        <div className="h-1.5 rounded-full bg-white/5 relative overflow-hidden">
                          <div className="absolute inset-y-0 left-[33.3%] w-[33.3%] bg-white/10" />
                          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (avg / 30) * 100)}%`, background: z.color }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {used.length > 0 && selected && (
            <Card>
              <Title sub="Balken = Volumen der Übung je Einheit, Linie = geschätztes 1RM (Epley, bester Satz bis 12 Wdh.).">Verlauf je Übung</Title>
              <select
                value={selected}
                onChange={(e) => setExKey(e.target.value)}
                className="mt-2 w-full rounded-xl bg-cyber-black border border-white/10 px-3 py-2.5 text-base text-slate-100"
                aria-label="Übung wählen"
              >
                {used.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.name} ({u.count})
                  </option>
                ))}
              </select>
              <div className="h-52 mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={history.map((h) => ({ label: weekLabel(h.day), volume: h.volume, e1rm: h.e1rm }))} margin={{ left: -8, right: -8 }}>
                    <CartesianGrid stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis yAxisId="v" {...axis} width={44} />
                    <YAxis yAxisId="r" orientation="right" {...axis} width={40} domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => [`${Number(v).toLocaleString('de-DE')} kg`, n === 'volume' ? 'Volumen' : 'e1RM']} />
                    <Bar yAxisId="v" dataKey="volume" fill="#8B5CF6" fillOpacity={0.5} radius={[4, 4, 0, 0]} />
                    <Line yAxisId="r" dataKey="e1rm" stroke="#ADFF2F" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1">
                {[...history].reverse().slice(0, 6).map((h) => (
                  <div key={h.at} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-slate-500 w-20 shrink-0">{shortDate(h.at)}</span>
                    <span className="flex-1 text-slate-200 truncate">{summarizeSets(h.sets)}</span>
                    <span className="text-slate-400 tabular-nums">{kg(h.volume)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <Title sub="Veränderung im Volumen zur letzten Einheit derselben Art.">Trainingshistorie</Title>
            <div className="mt-3 space-y-0">
              {table.map(({ e, w, kind, vol, sets, delta }) => (
                <details key={e.id} className="border-t border-white/5 py-2">
                  <summary className="flex items-center gap-2 cursor-pointer list-none">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: KIND_COLOR[kind] }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-100 truncate">{w.template ?? SESSION_KIND_LABEL[kind]}</span>
                      <span className="block text-[11px] text-slate-500">
                        {shortDate(e.occurred_at)} · {w.exercises?.length ?? 0} Übungen · {sets} Sätze
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-bold text-slate-100 tabular-nums">{kg(vol)}</span>
                      {delta !== undefined && (
                        <span className={`block text-[11px] tabular-nums ${delta >= 0 ? 'text-cyber-green' : 'text-amber-300'}`}>
                          {delta >= 0 ? '+' : ''}
                          {delta} %
                        </span>
                      )}
                    </span>
                  </summary>
                  <div className="mt-2 pl-4 space-y-0.5">
                    {(w.exercises ?? []).map((x, i) => (
                      <div key={i} className="flex justify-between gap-2 text-xs">
                        <span className="text-slate-300 truncate">{x.exercise}</span>
                        <span className="text-slate-500 shrink-0">{summarizeSets(setsOf(x))}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </Card>
        </>
      )}

      {logger && (
        <StrengthLogger
          history={entries}
          initial={logger}
          onClose={() => {
            setLogger(null);
            setHasDraft(!!loadDraft());
          }}
          onSaved={(queued) => {
            setLogger(null);
            setHasDraft(false);
            setEntries(cachedHistory());
            setNote(queued ? `Gespeichert auf dem Gerät. Geht raus, sobald wieder Netz da ist (${queuedCount()} wartend).` : 'Training gespeichert.');
            onSaved();
          }}
        />
      )}
    </div>
  );
};

export default StrengthView;

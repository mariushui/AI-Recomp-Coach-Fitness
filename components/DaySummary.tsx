// Ein Tag im Kalender: Ernährung mit Mikronährstoffen, Training mit Zeit, Volumen und Intensität, Körperwerte.
// Blöcke ohne Inhalt bleiben kurz, Körperwerte erscheinen nur, wenn welche da sind.
import React from 'react';
import type { Micros } from '../supabase/functions/_shared/domain';
import type { MicroDay } from '../lib/micros';
import type { BodyValue, DayWorkout } from '../lib/calendarDay';
import type { DayStats } from '../lib/stats';
import { strainColor, strainLabel } from '../lib/recovery';
import { MACRO_COLOR } from '../lib/today';
import { formatTime } from '../lib/time';
import { HR_ZONES } from '../lib/profile';
import { MacroRow } from './TodayBar';
import MicroTable from './MicroTable';
import { Card } from './ui';

const fmt = (n: number, digits = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });

const Head: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-2">
    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{children}</p>
    {right}
  </div>
);

export interface DaySummaryProps {
  isToday: boolean;
  stats?: DayStats;
  goals: { protein?: number | null; carbs?: number | null; fat?: number | null; kcal?: number };
  micro?: MicroDay;
  week: { micros: Micros; days: number };
  workouts: DayWorkout[];
  strain?: number;
  body: BodyValue[];
}

const DaySummary: React.FC<DaySummaryProps> = ({ isToday, stats, goals, micro, week, workouts, strain, body }) => {
  const hasMeals = stats?.kcal !== undefined || stats?.protein !== undefined;
  const totalMin = workouts.reduce((a, w) => a + (w.minutes ?? 0), 0);
  const volume = workouts.reduce((a, w) => a + (w.volumeKg ?? 0), 0);
  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <Head>Ernährung</Head>
        {hasMeals ? (
          <div className="space-y-2">
            <MacroRow label="Protein" value={stats?.protein} goal={goals.protein ?? undefined} unit="g" mode="more" color={MACRO_COLOR.protein} />
            <MacroRow label="Kohlenhydr." value={stats?.carbs} goal={goals.carbs ?? undefined} unit="g" mode="less" color={MACRO_COLOR.carbs} />
            <MacroRow label="Fett" value={stats?.fat} goal={goals.fat ?? undefined} unit="g" mode="less" color={MACRO_COLOR.fat} />
            <MacroRow label="Kalorien" value={stats?.kcal} goal={goals.kcal} unit="kcal" mode="less" color={MACRO_COLOR.kcal} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">Keine Mahlzeiten erfasst.</p>
        )}
      </Card>

      <Card className="space-y-2">
        <Head
          right={
            strain !== undefined ? (
              <span className="text-xs font-bold tabular-nums" style={{ color: strainColor(strain) }}>
                Belastung {fmt(strain, 1)} von 10, {strainLabel(strain)}
              </span>
            ) : undefined
          }
        >
          Training
        </Head>
        {workouts.length === 0 ? (
          <p className="text-sm text-slate-500">Kein Training erfasst.</p>
        ) : (
          <>
            <p className="text-xs text-slate-400">
              {fmt(totalMin)} min{volume > 0 ? ` · ${fmt(volume)} kg Volumen` : ''}
            </p>
            <div className="space-y-1.5">
              {workouts.map((w) => {
                const intensity = [
                  w.rpe !== undefined && `RPE ${fmt(w.rpe)}`,
                  w.avgHr !== undefined && `Ø ${fmt(w.avgHr)} bpm${w.zone ? `, Zone ${w.zone} (${HR_ZONES[w.zone - 1].name})` : ''}`,
                  w.kcal !== undefined && `${fmt(w.kcal)} kcal`,
                  w.distanceKm !== undefined && `${fmt(w.distanceKm, 2)} km`,
                ].filter(Boolean);
                return (
                  <div key={w.id} className="rounded-xl bg-cyber-black/60 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-slate-100">
                        {w.name}
                        {w.template ? ` · ${w.template}` : ''}
                      </span>
                      <span className="text-[11px] text-slate-500 shrink-0">{formatTime(w.at)}</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5 tabular-nums">
                      {[
                        w.minutes !== undefined && `${fmt(w.minutes)} min`,
                        w.volumeKg !== undefined && `${fmt(w.volumeKg)} kg Volumen`,
                        w.sets !== undefined && `${w.sets} Sätze in ${w.exercises} Übungen`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'ohne Dauer'}
                    </p>
                    {intensity.length > 0 && <p className="text-xs text-slate-400 mt-0.5">{intensity.join(' · ')}</p>}
                    {w.focus && <p className="text-[11px] text-slate-500 mt-0.5">Fokus: {w.focus}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {body.length > 0 && (
        <Card className="space-y-2">
          <Head>Körperwerte</Head>
          <div className="grid grid-cols-3 gap-2">
            {body.map((b) => (
              <div key={b.label} className="rounded-xl bg-cyber-black/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{b.label}</div>
                <div className="text-lg font-bold text-slate-100 tabular-nums">
                  {fmt(b.value, 1)}
                  <span className="text-xs text-slate-400 ml-1">{b.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Die lange Tabelle zuletzt, damit Training und Körperwerte ohne langes Scrollen sichtbar sind */}
      {(micro || week.days > 0) && <MicroTable micro={micro} week={week} dayHeader={isToday ? 'Heute' : 'Tag'} />}
    </div>
  );
};

export default DaySummary;

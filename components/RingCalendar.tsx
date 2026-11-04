// Ring-Kalender wie bei Athlytic: je Tag ein Ring mit Zahl, Farbe nach Stufe. 7 Spalten Montag bis Sonntag.
import React from 'react';

export interface RingDay {
  day: string; // YYYY-MM-DD
  value?: number;
  max: number; // voller Ring
  color: string;
  text?: string; // Anzeige in der Mitte, sonst der Wert
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Montag = 0 … Sonntag = 6 */
const weekdayIndex = (day: string) => (new Date(day + 'T12:00:00').getDay() + 6) % 7;

const Ring: React.FC<{ d: RingDay; today: boolean }> = ({ d, today }) => {
  const r = 17;
  const c = 2 * Math.PI * r;
  const ratio = d.value === undefined ? 0 : Math.min(1, Math.max(0, d.value / d.max));
  const label = d.text ?? (d.value === undefined ? '' : d.value.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-[10px] ${today ? 'text-cyber-green font-bold' : 'text-slate-500'}`}>{Number(d.day.slice(8, 10))}</span>
      <svg width="42" height="42" viewBox="0 0 42 42" aria-label={`${d.day}: ${label || 'kein Wert'}`}>
        <circle cx="21" cy="21" r={r} fill="none" stroke="#27272a" strokeWidth="4" />
        {ratio > 0 && (
          <circle
            cx="21"
            cy="21"
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${c * ratio} ${c}`}
            transform="rotate(-90 21 21)"
          />
        )}
        <text x="21" y="21" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill={d.value === undefined ? '#475569' : '#f1f5f9'}>
          {label}
        </text>
      </svg>
    </div>
  );
};

/** days: aufsteigend sortiert, lückenlos. Die erste Woche wird links mit Leerfeldern aufgefüllt. */
const RingCalendar: React.FC<{ days: RingDay[]; today: string }> = ({ days, today }) => {
  if (days.length === 0) return null;
  const pad = weekdayIndex(days[0].day);
  const cells: (RingDay | null)[] = [...Array(pad).fill(null), ...days];
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => (d ? <Ring key={d.day} d={d} today={d.day === today} /> : <div key={`pad-${i}`} />))}
      </div>
    </div>
  );
};

export default RingCalendar;

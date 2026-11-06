// Ring-Kalender wie bei Athlytic: je Tag ein Ring mit Zahl, Farbe nach Stufe. 7 Spalten Montag bis Sonntag.
import React from 'react';

export interface RingDay {
  day: string; // YYYY-MM-DD
  value?: number;
  max: number; // voller Ring
  color: string;
  text?: string; // Anzeige in der Mitte, sonst der Wert
  dots?: RingDot[]; // kleine Punkte unter dem Ring, z. B. geplante Einheiten
}

export interface RingDot {
  color: string;
  filled: boolean; // gefüllt = erledigt
  alert?: boolean; // roter Rand = nicht erfasst
  faded?: boolean; // ausgefallen
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Montag = 0 … Sonntag = 6 */
const weekdayIndex = (day: string) => (new Date(day + 'T12:00:00').getDay() + 6) % 7;

const Ring: React.FC<{ d: RingDay; today: boolean; selected?: boolean; onSelect?: (day: string) => void }> = ({ d, today, selected, onSelect }) => {
  const r = 17;
  const c = 2 * Math.PI * r;
  const ratio = d.value === undefined ? 0 : Math.min(1, Math.max(0, d.value / d.max));
  const label = d.text ?? (d.value === undefined ? '' : d.value.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
  const body = (
    <>
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
      {d.dots && (
        <span className="flex flex-wrap justify-center gap-0.5 min-h-[8px]">
          {d.dots.map((x, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${x.faded ? 'opacity-30' : ''}`}
              style={{ background: x.filled ? x.color : 'transparent', border: `1.5px solid ${x.alert ? '#F87171' : x.color}` }}
            />
          ))}
        </span>
      )}
    </>
  );
  if (!onSelect) return <div className="flex flex-col items-center gap-0.5">{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onSelect(d.day)}
      aria-pressed={selected}
      className={`flex flex-col items-center gap-0.5 rounded-xl py-0.5 border ${selected ? 'border-cyber-purple bg-cyber-purple/15' : 'border-transparent'}`}
    >
      {body}
    </button>
  );
};

/**
 * days: aufsteigend sortiert, lückenlos. Standard: Wochenraster Mo bis So, erste Woche links aufgefüllt.
 * row: eine Reihe, neuester Tag rechts, Wochentag steht über jedem Ring und wandert mit.
 */
const RingCalendar: React.FC<{ days: RingDay[]; today: string; selected?: string; onSelect?: (day: string) => void; row?: boolean }> = ({ days, today, selected, onSelect, row }) => {
  if (days.length === 0) return null;
  if (row) {
    const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
    return (
      <div>
        <div className="grid gap-1 mb-1" style={cols}>
          {days.map((d) => (
            <span key={d.day} className={`text-center text-[10px] font-bold uppercase tracking-wider ${d.day === today ? 'text-cyber-green' : 'text-slate-500'}`}>
              {WEEKDAYS[weekdayIndex(d.day)]}
            </span>
          ))}
        </div>
        <div className="grid gap-1" style={cols}>
          {days.map((d) => (
            <Ring key={d.day} d={d} today={d.day === today} selected={d.day === selected} onSelect={onSelect} />
          ))}
        </div>
      </div>
    );
  }
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
        {cells.map((d, i) => (d ? <Ring key={d.day} d={d} today={d.day === today} selected={d.day === selected} onSelect={onSelect} /> : <div key={`pad-${i}`} />))}
      </div>
    </div>
  );
};

export default RingCalendar;

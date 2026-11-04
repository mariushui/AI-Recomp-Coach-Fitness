// Mikronährstoffe eines Tages gegen den Tageswert, mit Ø 7 Tage. Gleich auf der Ernährungsseite und im Kalender.
// Speicher-Nährstoffe (Vitamin D, B12, Folat, Eisen, Zink, Omega-3) werden im Wochenschnitt bewertet, die übrigen am Tag.
import React from 'react';
import { MICROS, type Micros } from '../supabase/functions/_shared/domain';
import { fmtMicro, microZone, type MicroDay } from '../lib/micros';
import { Card } from './ui';

const MicroTable: React.FC<{ micro?: MicroDay; week: { micros: Micros; days: number }; dayHeader?: string }> = ({ micro, week, dayHeader = 'Tag' }) => {
  const withMicros = micro?.withMicros ?? 0;
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Mikronährstoffe</p>
      <p className="text-xs text-slate-500 mt-0.5">
        {withMicros
          ? `KI-Schätzung aus ${withMicros} von ${micro?.meals ?? 0} Mahlzeiten. Grob, vor allem bei Vitaminen. Tageswert für Männer um 45 nach DGE. Vitamin D, B12, Folat, Eisen, Zink und Omega-3 speichert der Körper, sie zählen im Wochenschnitt.`
          : 'Für diesen Tag gibt es noch keine Schätzung. Neue Mahlzeiten bekommen sie automatisch. Ältere: Mahlzeit antippen, „Nährwerte neu berechnen“.'}
      </p>
      {(withMicros > 0 || week.days > 0) && (
        <table className="w-full mt-3 text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-bold pb-1">Nährstoff</th>
              <th className="text-right font-bold pb-1">{dayHeader}</th>
              <th className="pb-1 w-20"></th>
              <th className="text-right font-bold pb-1 whitespace-nowrap">Ø 7 Tage</th>
            </tr>
          </thead>
          <tbody>
            {MICROS.map((m) => {
              const v = micro?.micros[m.key];
              const z = microZone(m.key, v);
              const w = week.micros[m.key];
              const wz = microZone(m.key, w);
              const weekly = 'basis' in m && m.basis === 'woche';
              const main = weekly ? wz : z;
              return (
                <tr key={m.key} className="border-t border-white/5">
                  <td className="py-1.5 text-slate-200">
                    {m.label}
                    <span className="block text-[10px] text-slate-500">
                      {weekly ? 'Ziel Ø Woche' : m.dir === 'max' ? 'höchstens' : 'Ziel'} {m.ref.toLocaleString('de-DE')} {m.unit}
                    </span>
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${weekly ? 'text-xs' : 'font-bold'}`} style={{ color: weekly ? '#94a3b8' : z?.color ?? '#475569' }}>
                    {v !== undefined ? fmtMicro(m.key, v) : '–'}
                  </td>
                  <td className="py-1.5 pl-2">
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      {main && <div className="h-full rounded-full" style={{ width: `${Math.min(100, main.pct)}%`, background: main.color }} />}
                    </div>
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${weekly ? 'font-bold' : 'text-xs'}`} style={{ color: wz?.color ?? '#475569' }}>
                    {w !== undefined ? fmtMicro(m.key, w) : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
};

export default MicroTable;

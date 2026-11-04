// Kleine Erinnerung an Körpermaße und Hautfalten, alle 14 Tage. Wegklickbar für einen Tag oder dauerhaft.
import React, { useEffect, useState } from 'react';
import { listEntries } from '../lib/entries';
import { MEASURE_INTERVAL_DAYS, daysSinceMeasurement } from '../lib/bodyfat';
import { addDays } from '../lib/time';

const SNOOZE_KEY = 'recomp_measure_snooze_until';
export const MEASURE_OFF_KEY = 'recomp_measure_reminder_off';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* egal */
  }
};

const MeasureReminder: React.FC<{ refreshKey: number; onMeasure: () => void }> = ({ refreshKey, onMeasure }) => {
  const [days, setDays] = useState<number | null | undefined>(undefined); // null = noch nie gemessen
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (read(MEASURE_OFF_KEY) === '1') return setHidden(true);
    const until = read(SNOOZE_KEY);
    if (until && new Date(until).getTime() > Date.now()) return setHidden(true);
    const now = new Date();
    listEntries(addDays(now, -120), addDays(now, 1))
      .then((list) => setDays(daysSinceMeasurement(list, now) ?? null))
      .catch(() => setDays(undefined));
  }, [refreshKey]);

  if (hidden || days === undefined || (days !== null && days < MEASURE_INTERVAL_DAYS)) return null;

  const tomorrow = () => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(4, 0, 0, 0);
    write(SNOOZE_KEY, t.toISOString());
    setHidden(true);
  };
  const off = () => {
    write(MEASURE_OFF_KEY, '1');
    setHidden(true);
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-cyber-purple/30 bg-cyber-purple/10 px-3 py-2" role="status">
      <button type="button" onClick={onMeasure} className="flex-1 min-w-0 text-left">
        <span className="block text-xs font-bold text-slate-100">Messtag: Umfänge und Hautfalten</span>
        <span className="block text-[11px] text-slate-400 truncate">{days === null ? 'Noch keine Messung. Tippen zum Eintragen.' : `Letzte Messung vor ${days} Tagen. Tippen zum Eintragen.`}</span>
      </button>
      <button type="button" onClick={tomorrow} className="shrink-0 text-[11px] font-bold text-cyber-purple px-1.5 py-1">
        Morgen
      </button>
      <button type="button" onClick={off} className="shrink-0 text-[11px] text-slate-500 px-1.5 py-1" aria-label="Nicht mehr erinnern">
        Aus
      </button>
    </div>
  );
};

export default MeasureReminder;

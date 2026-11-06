// Hinweis auf der Startseite, wenn der Abgleich mit Apple Health älter als 12 Stunden ist.
import React, { useEffect, useState } from 'react';
import { SHORTCUT_URL, ageText, isStale, lastSync } from '../lib/syncStatus';

const SyncHint: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [last, setLast] = useState<Date | undefined | null>(null); // null = lädt
  useEffect(() => {
    let alive = true;
    lastSync()
      .then((d) => alive && setLast(d))
      .catch(() => alive && setLast(null));
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  if (last === null || !isStale(last)) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2">
      <p className="text-xs text-amber-200">Letzter Abgleich mit Apple Health: {ageText(last)}</p>
      <a href={SHORTCUT_URL} className="shrink-0 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-bold text-black">
        Jetzt syncen
      </a>
    </div>
  );
};

export default SyncHint;

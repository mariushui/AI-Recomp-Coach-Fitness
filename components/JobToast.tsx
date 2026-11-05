// Kleiner Hinweis unten: läuft etwas im Hintergrund, ist es fertig, ging es schief.
import React, { useEffect, useState } from 'react';
import { pendingJobs, runJobs, subscribeJobs } from '../lib/backgroundJobs';

const JobToast: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [count, setCount] = useState(() => pendingJobs().length);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (text: string, ok: boolean) => {
      setFlash({ text, ok });
      clearTimeout(timer);
      timer = setTimeout(() => setFlash(null), ok ? 3000 : 6000);
    };
    const off = subscribeJobs((e) => {
      setCount(pendingJobs().length);
      if (e.type === 'done') {
        onDone();
        if (e.summary) show(e.summary, true);
        else if (!pendingJobs().length) show('Nährwerte aktualisiert', true);
      }
      if (e.type === 'error') show(e.job.type === 'parse' ? 'Erkennen hat nicht geklappt, Text steht wieder im Feld' : `${e.job.label}: ${e.message}`, false);
    });
    // Offenes vom letzten Mal weitermachen, und wieder, sobald Netz da ist
    void runJobs();
    const online = () => void runJobs();
    // iOS pausiert die App im Hintergrund. Kommt sie zurück, geht es dort weiter, wo es stehen blieb.
    const visible = () => document.visibilityState === 'visible' && void runJobs();
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      off();
      clearTimeout(timer);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [onDone]);

  if (!count && !flash) return null;
  const busy = count > 0;
  return (
    <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 flex justify-center pointer-events-none" role="status" aria-live="polite">
      <div className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold shadow-lg backdrop-blur ${busy ? 'border-cyber-purple/40 bg-cyber-gray/95 text-slate-200' : flash?.ok ? 'border-cyber-green/40 bg-cyber-gray/95 text-cyber-green' : 'border-[#FF375F]/40 bg-cyber-gray/95 text-[#FF375F]'}`}>
        {busy ? (
          <>
            <span className="h-3.5 w-3.5 rounded-full border-2 border-cyber-purple border-t-transparent animate-spin" aria-hidden />
            {pendingJobs()[0]?.type === 'parse' ? 'Wird erkannt und gespeichert' : 'Nährwerte werden berechnet'}
            {count > 1 ? ` (${count})` : ''} …
          </>
        ) : (
          <>{flash?.ok ? '✓ ' : ''}{flash?.text}</>
        )}
      </div>
    </div>
  );
};

export default JobToast;

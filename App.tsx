import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './lib/supabase';
import AuthScreen from './components/AuthScreen';
import QuickLog from './components/QuickLog';
import CalendarView from './components/CalendarView';
import Settings from './components/Settings';
import { Card } from './components/ui';
import { Icons } from './components/icons';
import JobToast from './components/JobToast';
import { insertEntries, listStrengthHistory } from './lib/entries';
import { cacheHistory } from './lib/strengthTemplates';
import { flush, queuedCount } from './lib/offlineQueue';
import { dayKey } from './lib/time';

const loadTrends = () => import('./components/Trends');
const loadStrength = () => import('./components/TrainingView');
const Trends = lazy(loadTrends);
const TrainingView = lazy(loadStrength);
const loadNutrition = () => import('./components/NutritionView');
const NutritionView = lazy(loadNutrition);

type Tab = 'log' | 'nutrition' | 'training' | 'calendar' | 'trends' | 'settings';

// Einstellungen sitzen als Zahnrad oben rechts, sonst passen die Tabs nicht auf die iPhone-Breite
const TABS: { id: Tab; label: string; icon: (typeof Icons)['Plus'] }[] = [
  { id: 'log', label: 'Erfassen', icon: Icons.Plus },
  { id: 'nutrition', label: 'Ernährung', icon: Icons.Fork },
  { id: 'training', label: 'Training', icon: Icons.Barbell },
  { id: 'calendar', label: 'Kalender', icon: Icons.Calendar },
  { id: 'trends', label: 'Verlauf', icon: Icons.Chart },
];

/** Zuletzt gespeicherte Sitzung aus dem Browser, für den Start ohne Netz. */
function storedSession(): Session | null {
  try {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const raw = key ? localStorage.getItem(key) : null;
    const s = raw ? JSON.parse(raw) : null;
    return s?.user ? (s as Session) : null;
  } catch {
    return null;
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('log');
  const [refreshKey, setRefreshKey] = useState(0);
  const [waiting, setWaiting] = useState(() => queuedCount());
  // Tag der Anzeige. Wechselt er (App lag über Nacht im Speicher), startet die Ansicht neu und zeigt wieder heute.
  const [dayStamp, setDayStamp] = useState(() => dayKey(new Date()));
  const bump = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setWaiting(queuedCount());
  }, []);

  // Offline gespeicherte Einträge senden: beim Start und sobald wieder Netz da ist
  useEffect(() => {
    if (!session) return;
    const send = () =>
      flush(insertEntries)
        .then((n) => {
          setWaiting(queuedCount());
          if (n > 0) setRefreshKey((k) => k + 1);
        })
        // Schattenwerte fürs Krafttraining auf dem Gerät auffrischen, falls es später in den Keller geht
        .then(() => listStrengthHistory())
        .then(cacheHistory)
        .catch(() => undefined);
    send();
    window.addEventListener('online', send);
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      void send();
      // Zurück im Vordergrund: neuen Tag übernehmen und alle Anzeigen neu laden. iOS hält die App oft stundenlang im Speicher.
      setDayStamp(dayKey(new Date()));
      setRefreshKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', visible);
    // Seiten mit Diagrammen vorab laden, damit sie der Service Worker auch für den Keller im Speicher hat
    const t = setTimeout(() => {
      loadStrength().catch(() => undefined);
      loadNutrition().catch(() => undefined);
      loadTrends().catch(() => undefined);
    }, 3000);
    return () => {
      window.removeEventListener('online', send);
      document.removeEventListener('visibilitychange', visible);
      clearTimeout(t);
    };
  }, [session]);

  useEffect(() => {
    if (!isConfigured) return setReady(true);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        // Ohne Netz kann das Token nicht erneuert werden. Dann mit der gespeicherten Sitzung weiterarbeiten,
        // Einträge landen in der Warteschlange und gehen später raus.
        setSession(data.session ?? storedSession());
        setReady(true);
      })
      .catch(() => {
        setSession(storedSession());
        setReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((e, s) => setSession(s ?? (e === 'SIGNED_OUT' ? null : storedSession())));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5">
        <Card className="max-w-md space-y-2">
          <h1 className="font-display text-xl font-bold">Supabase fehlt</h1>
          <p className="text-sm text-slate-400">
            Setze <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>. Anleitung in <code>docs/SETUP.md</code>.
          </p>
        </Card>
      </div>
    );
  }
  if (!ready) return null;
  if (!session) return <AuthScreen />;


  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-10 bg-cyber-black/90 backdrop-blur px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 border-b border-white/5">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <h1 className="font-display text-lg font-bold">
            Recomp <span className="text-cyber-green">Coach</span>
          </h1>
          <button
            type="button"
            onClick={() => setTab('settings')}
            aria-label="Einstellungen"
            aria-pressed={tab === 'settings'}
            className={`p-1.5 -mr-1.5 ${tab === 'settings' ? 'text-cyber-green' : 'text-slate-400'}`}
          >
            <Icons.Gear size={22} />
          </button>
        </div>
        {waiting > 0 && <p className="text-[11px] text-amber-300 mt-0.5">{waiting} {waiting === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Netz</p>}
      </header>

      <main key={dayStamp} className="max-w-xl mx-auto px-4 pt-4">
        {tab === 'log' && <QuickLog onSaved={bump} refreshKey={refreshKey} />}
        {tab === 'nutrition' && (
          <Suspense fallback={<p className="text-sm text-slate-500">Lade …</p>}>
            <NutritionView refreshKey={refreshKey} onChanged={bump} />
          </Suspense>
        )}
        {tab === 'training' && (
          <Suspense fallback={<p className="text-sm text-slate-500">Lade …</p>}>
            <TrainingView refreshKey={refreshKey} onSaved={bump} />
          </Suspense>
        )}
        {tab === 'calendar' && <CalendarView refreshKey={refreshKey} onChanged={bump} />}
        {tab === 'trends' && (
          <Suspense fallback={<p className="text-sm text-slate-500">Lade …</p>}>
            <Trends refreshKey={refreshKey} />
          </Suspense>
        )}
        {tab === 'settings' && <Settings session={session} onDataChanged={bump} />}
      </main>

      <JobToast onDone={bump} />

      <nav className="fixed bottom-0 inset-x-0 z-10 bg-cyber-gray/95 backdrop-blur border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-xl mx-auto grid grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 text-[11px] font-bold ${tab === t.id ? 'text-cyber-green' : 'text-slate-500'}`}
            >
              <t.icon size={24} weight="regular" className="mx-auto mb-1" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default App;

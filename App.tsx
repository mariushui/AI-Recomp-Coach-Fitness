import React, { Suspense, lazy, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './lib/supabase';
import AuthScreen from './components/AuthScreen';
import QuickLog from './components/QuickLog';
import CalendarView from './components/CalendarView';
import Settings from './components/Settings';
import { Card } from './components/ui';
import { Icons } from './components/icons';

const Trends = lazy(() => import('./components/Trends'));

type Tab = 'log' | 'calendar' | 'trends' | 'settings';

const TABS: { id: Tab; label: string; icon: (typeof Icons)['Plus'] }[] = [
  { id: 'log', label: 'Erfassen', icon: Icons.Plus },
  { id: 'calendar', label: 'Kalender', icon: Icons.Calendar },
  { id: 'trends', label: 'Verlauf', icon: Icons.Chart },
  { id: 'settings', label: 'Einstellungen', icon: Icons.Gear },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('log');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isConfigured) return setReady(true);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-10 bg-cyber-black/90 backdrop-blur px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 border-b border-white/5">
        <h1 className="font-display text-lg font-bold">
          Recomp <span className="text-cyber-green">Coach</span>
        </h1>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4">
        {tab === 'log' && <QuickLog onSaved={bump} />}
        {tab === 'calendar' && <CalendarView refreshKey={refreshKey} onChanged={bump} />}
        {tab === 'trends' && (
          <Suspense fallback={<p className="text-sm text-slate-500">Lade …</p>}>
            <Trends refreshKey={refreshKey} />
          </Suspense>
        )}
        {tab === 'settings' && <Settings session={session} onDataChanged={bump} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-10 bg-cyber-gray/95 backdrop-blur border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-xl mx-auto grid grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 text-xs font-bold ${tab === t.id ? 'text-cyber-green' : 'text-slate-500'}`}
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

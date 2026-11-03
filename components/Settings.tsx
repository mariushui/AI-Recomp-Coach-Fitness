import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, functionsUrl } from '../lib/supabase';
import { loadProfile, saveProfile } from '../lib/profile';
import { insertEntries, listAllEntries } from '../lib/entries';
import { LEGACY_HISTORY_KEY, convertLegacyHistory } from '../lib/legacy';
import { Button, Card, ErrorBox, NumberField, TextField } from './ui';

const GUIDE_URL = 'https://github.com/mariushui/AI-Recomp-Coach-Fitness/blob/main/docs/KURZBEFEHL.md';
export const SHORTCUT_NAME = 'Recomp Health';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card className="space-y-3">
    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
    {children}
  </Card>
);

const Settings: React.FC<{ session: Session; onDataChanged: () => void }> = ({ session, onDataChanged }) => {
  const [name, setName] = useState<string | undefined>();
  const [height, setHeight] = useState<number | undefined>();
  const [token, setToken] = useState<string | null>(null);
  const [lastUsed, setLastUsed] = useState<string | null | undefined>();
  const [legacyJson, setLegacyJson] = useState<string | undefined>();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadProfile(session.user.id)
      .then((p) => {
        setName(p.display_name ?? undefined);
        setHeight(p.height_cm ?? undefined);
      })
      .catch(() => undefined);
    supabase
      .from('ingest_tokens')
      .select('last_used_at')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setLastUsed(data ? data.last_used_at : undefined));
    try {
      const local = localStorage.getItem(LEGACY_HISTORY_KEY);
      if (local && local !== '[]') setLegacyJson(local);
    } catch {
      /* egal */
    }
  }, [session.user.id]);

  const run = async (fn: () => Promise<void>) => {
    setMsg(null);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Kopieren nicht möglich. Bitte manuell markieren.');
    }
  };

  const saveName = () =>
    run(async () => {
      await saveProfile(session.user.id, { display_name: name ?? null, height_cm: height ?? null });
      setMsg('Profil gespeichert.');
    });

  const createToken = () =>
    run(async () => {
      if (lastUsed !== undefined && !confirm('Neuer Token macht den alten ungültig. Den Kurzbefehl musst du dann anpassen. Weiter?')) return;
      const { data, error } = await supabase.rpc('create_ingest_token');
      if (error) throw error;
      setToken(data as string);
      setLastUsed(null);
    });

  const importLegacy = () =>
    run(async () => {
      if (!legacyJson) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(legacyJson);
      } catch {
        throw new Error('Das ist kein gültiges JSON.');
      }
      const rows = convertLegacyHistory(parsed);
      if (rows.length === 0) throw new Error('Keine übernehmbaren Einträge gefunden.');
      await insertEntries(rows);
      setMsg(`${rows.length} Einträge übernommen. Doppelte werden übersprungen, du kannst den Import also gefahrlos wiederholen.`);
      onDataChanged();
    });

  const exportAll = () =>
    run(async () => {
      const all = await listAllEntries();
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), entries: all }, null, 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `recomp-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg(`${all.length} Einträge exportiert.`);
    });

  const deleteAll = () =>
    run(async () => {
      const answer = prompt('Alle deine Einträge endgültig löschen? Tippe LÖSCHEN zur Bestätigung.');
      if (answer !== 'LÖSCHEN') return;
      const { error } = await supabase.rpc('delete_my_data');
      if (error) throw error;
      setMsg('Alle Daten gelöscht.');
      setLastUsed(undefined);
      onDataChanged();
    });

  const endpoint = `${functionsUrl}/health-ingest`;
  const exportEndpoint = `${functionsUrl}/health-export`;

  return (
    <div className="space-y-4">
      {error && <ErrorBox>{error}</ErrorBox>}
      {msg && <div className="rounded-xl bg-cyber-green/10 border border-cyber-green/30 text-cyber-green text-sm px-3 py-2">{msg}</div>}

      <Section title="Profil">
        <p className="text-sm text-slate-400">{session.user.email}</p>
        <TextField label="Name" value={name} onChange={setName} />
        <NumberField label="Körpergröße" unit="cm" value={height} onChange={setHeight} />
        <p className="text-xs text-slate-500">Wird nur für den BMI im Verlauf gebraucht.</p>
        <Button variant="ghost" onClick={saveName}>
          Speichern
        </Button>
      </Section>

      <Section title="Apple Health">
        <p className="text-sm text-slate-300">
          Ein iOS-Kurzbefehl schickt Gewicht, Körperfett, Schlaf, HRV, Ruhepuls, VO2max, Blutsauerstoff und Schritte an die App. Er sendet immer die letzten 3 Tage. Fällt ein Lauf aus, holt der nächste die Werte nach.
        </p>
        <p className="text-sm text-slate-300">
          Zurück nach Apple Health gehen Kalorien, Protein, Kohlenhydrate und Fett deiner Mahlzeiten sowie Blutzucker-Laborwerte. Jeder Wert nur einmal.
        </p>
        <p className="text-sm text-slate-400">
          Status:{' '}
          {lastUsed === undefined
            ? 'noch kein Token'
            : lastUsed === null
              ? 'Token erstellt, noch keine Daten empfangen'
              : `zuletzt empfangen ${new Date(lastUsed).toLocaleString('de-DE')}`}
        </p>
        {token ? (
          <div className="rounded-xl bg-cyber-black border border-cyber-green/40 p-3 space-y-2">
            <p className="text-xs text-cyber-green font-bold">Dein Token. Er wird nur jetzt angezeigt.</p>
            <code className="block text-xs break-all text-slate-200">{token}</code>
            <Button variant="green" className="w-full" onClick={() => copy(token, 'token')}>
              {copied === 'token' ? 'Kopiert' : 'Token kopieren'}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={createToken}>
            {lastUsed === undefined ? 'Token erstellen' : 'Neuen Token erstellen'}
          </Button>
        )}
        <div className="rounded-xl bg-cyber-black p-3 space-y-2">
          <p className="text-xs text-slate-500">Adresse für den Kurzbefehl</p>
          <code className="block text-xs break-all text-slate-300">{endpoint}</code>
          <Button variant="ghost" className="w-full" onClick={() => copy(endpoint, 'url')}>
            {copied === 'url' ? 'Kopiert' : 'Adresse kopieren'}
          </Button>
          <p className="text-xs text-slate-500 pt-2">Adresse für den Rückweg nach Apple Health</p>
          <code className="block text-xs break-all text-slate-300">{exportEndpoint}</code>
          <Button variant="ghost" className="w-full" onClick={() => copy(exportEndpoint, 'export')}>
            {copied === 'export' ? 'Kopiert' : 'Adresse kopieren'}
          </Button>
        </div>
        <div className="flex gap-2">
          <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="flex-1">
            <Button variant="ghost" className="w-full">
              Anleitung
            </Button>
          </a>
          <a href={`shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`} className="flex-1">
            <Button className="w-full">Jetzt syncen</Button>
          </a>
        </div>
      </Section>

      <Section title="Alte Daten übernehmen">
        <p className="text-sm text-slate-400">
          Einträge aus der alten Version (Tagesformular). Liegen sie in diesem Browser, sind sie unten schon eingefügt. Sonst den JSON-Text einfügen.
        </p>
        <TextField label="JSON" multiline value={legacyJson} onChange={setLegacyJson} placeholder='[{"date": "1.11.2026", ...}]' />
        <Button variant="ghost" onClick={importLegacy} disabled={!legacyJson}>
          Übernehmen
        </Button>
      </Section>

      <Section title="Deine Daten">
        <Button variant="ghost" className="w-full" onClick={exportAll}>
          Alles als JSON exportieren
        </Button>
        <Button variant="danger" className="w-full" onClick={deleteAll}>
          Alle Einträge löschen
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => supabase.auth.signOut()}>
          Abmelden
        </Button>
      </Section>
    </div>
  );
};

export default Settings;

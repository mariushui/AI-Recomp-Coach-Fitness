import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, functionsUrl } from '../lib/supabase';
import { ageFrom, loadProfile, proteinBasis, saveProfile, suggestedKcalGoal, suggestedProteinGoal } from '../lib/profile';
import { listEntries } from '../lib/entries';
import { average, dailyStats } from '../lib/stats';
import { addDays } from '../lib/time';
import { insertEntries, listAllEntries } from '../lib/entries';
import { LEGACY_HISTORY_KEY, convertLegacyHistory } from '../lib/legacy';
import { Button, Card, ErrorBox, Label, NumberField, TextField } from './ui';

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
  const [proteinGoal, setProteinGoal] = useState<number | undefined>();
  const [kcalGoal, setKcalGoal] = useState<number | undefined>();
  const [leanMass, setLeanMass] = useState<number | undefined>();
  const [muscle, setMuscle] = useState<number | undefined>(); // Muskelmasse laut Waage
  const [activeKcal, setActiveKcal] = useState<number | undefined>();
  const [birthDate, setBirthDate] = useState<string | undefined>();
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
        setProteinGoal(p.protein_goal_g ?? undefined);
        setKcalGoal(p.kcal_goal ?? undefined);
        setBirthDate(p.birth_date ?? undefined);
      })
      .catch(() => undefined);
    const now = new Date();
    listEntries(addDays(now, -30), addDays(now, 1))
      .then((list) => {
        const days = dailyStats(list, addDays(now, -30), addDays(now, 1));
        const lm = days.map((d) => d.leanMass).filter((x): x is number => typeof x === 'number');
        setLeanMass(lm.length ? lm[lm.length - 1] : undefined);
        const mm = days.map((d) => d.muscle).filter((x): x is number => typeof x === 'number');
        setMuscle(mm.length ? mm[mm.length - 1] : undefined);
        setActiveKcal(average(days.slice(-14), 'activeKcal'));
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
      const p = proteinGoal === undefined ? null : Math.round(proteinGoal);
      const k = kcalGoal === undefined ? null : Math.round(kcalGoal);
      if (p !== null && (p < 30 || p > 400)) throw new Error('Protein-Ziel bitte zwischen 30 und 400 g.');
      if (k !== null && (k < 800 || k > 6000)) throw new Error('Kalorien-Ziel bitte zwischen 800 und 6.000 kcal.');
      if (height !== undefined && (height < 100 || height > 250)) throw new Error('Körpergröße bitte zwischen 100 und 250 cm.');
      if (birthDate && (birthDate < '1900-01-01' || ageFrom(birthDate) === undefined || ageFrom(birthDate)! > 120)) throw new Error('Geburtsdatum bitte prüfen.');
      await saveProfile(session.user.id, {
        display_name: name ?? null,
        height_cm: height ?? null,
        protein_goal_g: p,
        kcal_goal: k,
        birth_date: birthDate ?? null,
      });
      setProteinGoal(p ?? undefined);
      setKcalGoal(k ?? undefined);
      onDataChanged();
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
        <label className="block">
          <Label>Geburtsdatum</Label>
          <input
            type="date"
            className="w-full rounded-xl bg-cyber-black border border-white/10 px-3 py-2.5 text-base text-slate-100"
            value={birthDate ?? ''}
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthDate(e.target.value || undefined)}
          />
          {ageFrom(birthDate) !== undefined && <span className="block text-xs text-slate-500 mt-1">{ageFrom(birthDate)} Jahre. Für Maximalpuls und Belastungszonen.</span>}
        </label>
        <p className="text-xs text-slate-500">Größe für den BMI, Geburtsdatum für Alter und Maximalpuls. Beides bleibt privat in deinem Profil.</p>
        <Button variant="ghost" onClick={saveName}>
          Speichern
        </Button>
      </Section>

      <Section title="Tagesziele">
        <p className="text-sm text-slate-400">Erscheinen im Verlauf als Linie und auf der Startseite als Fortschritt. Leer lassen, wenn du kein Ziel willst.</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Protein" unit="g" value={proteinGoal} onChange={setProteinGoal} />
          <NumberField label="Kalorien" unit="kcal" value={kcalGoal} onChange={setKcalGoal} />
        </div>
        {leanMass === undefined && muscle === undefined ? (
          <p className="text-xs text-slate-500">Vorschläge gibt es, sobald Gewicht und Körperfett erfasst sind (Waage oder Apple Health).</p>
        ) : (
          <div className="space-y-1">
            {proteinBasis(muscle, leanMass) && proteinGoal !== suggestedProteinGoal(proteinBasis(muscle, leanMass)!.value) && (
              <button type="button" className="block text-xs text-cyber-purple underline text-left" onClick={() => setProteinGoal(suggestedProteinGoal(proteinBasis(muscle, leanMass)!.value))}>
                Vorschlag Protein: {suggestedProteinGoal(proteinBasis(muscle, leanMass)!.value)} g (2 g je kg {proteinBasis(muscle, leanMass)!.label}, {proteinBasis(muscle, leanMass)!.value} kg)
              </button>
            )}
            {leanMass !== undefined && kcalGoal !== suggestedKcalGoal(leanMass, activeKcal) && (
              <button type="button" className="block text-xs text-cyber-purple underline text-left" onClick={() => setKcalGoal(suggestedKcalGoal(leanMass, activeKcal))}>
                Vorschlag Kalorien: {suggestedKcalGoal(leanMass, activeKcal)} kcal (Verbrauch: Grundumsatz{activeKcal ? ` + Ø ${activeKcal} kcal aktiv` : ''})
              </button>
            )}
          </div>
        )}
        <Button variant="ghost" onClick={saveName}>
          Speichern
        </Button>
      </Section>

      <Section title="Apple Health">
        <p className="text-sm text-slate-300">
          Ein iOS-Kurzbefehl schickt Gewicht, Körperfett, Schlaf, HRV, Ruhepuls, VO2max, Blutsauerstoff und Schritte an die App. Er sendet immer die letzten 3 Tage. Fällt ein Lauf aus, holt der nächste die Werte nach.
        </p>
        <p className="text-sm text-slate-300">
          Zurück nach Apple Health gehen Kalorien, Protein, Kohlenhydrate und Fett deiner Mahlzeiten sowie Blutzucker aus den Blutwerten. Jeder Wert nur einmal.
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

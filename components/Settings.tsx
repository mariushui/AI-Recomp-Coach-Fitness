import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, functionsUrl } from '../lib/supabase';
import { ENERGY_MODES, ageFrom, hrZoneRanges, loadProfile, maxHeartRate, modeGoals, proteinBasis, saveProfile, suggestedKcalGoal, type EnergyMode } from '../lib/profile';
import { listEntries } from '../lib/entries';
import { average, dailyStats } from '../lib/stats';
import { addDays } from '../lib/time';
import { insertEntries, listAllEntries } from '../lib/entries';
import { LEGACY_HISTORY_KEY, convertLegacyHistory } from '../lib/legacy';
import { CHART_LABEL, loadCharts, loadOrder, normalizeOrder, saveCharts, saveOrder } from '../lib/chartPrefs';
import SortableList from './SortableList';
import VaultExport from './VaultExport';
import { MEASURE_OFF_KEY } from './MeasureReminder';
import { Button, Card, ErrorBox, Label, NumberField, TextField } from './ui';

const inputCls = 'w-full rounded-xl bg-cyber-black border border-white/10 px-3 py-2.5 text-base text-slate-100 focus:outline-none focus:border-cyber-purple';
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
  const [carbsGoal, setCarbsGoal] = useState<number | undefined>();
  const [fatGoal, setFatGoal] = useState<number | undefined>();
  const [leanMass, setLeanMass] = useState<number | undefined>();
  const [muscle, setMuscle] = useState<number | undefined>(); // Muskelmasse laut Waage
  const [activeKcal, setActiveKcal] = useState<number | undefined>();
  const [birthDate, setBirthDate] = useState<string | undefined>();
  const [maxHr, setMaxHr] = useState<number | undefined>();
  const [mode, setMode] = useState<EnergyMode | undefined>();
  const [pct, setPct] = useState<number | undefined>();
  const [charts, setCharts] = useState<Set<string>>(loadCharts);
  const [order, setOrder] = useState(loadOrder);
  const [measureReminder, setMeasureReminder] = useState(() => {
    try {
      return localStorage.getItem(MEASURE_OFF_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
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
        setMaxHr(p.max_hr ?? undefined);
        setMode(p.energy_mode ?? undefined);
        setPct(p.kcal_adjust_pct ?? undefined);
        setProteinGoal(p.protein_goal_g ?? undefined);
        setKcalGoal(p.kcal_goal ?? undefined);
        setCarbsGoal(p.carbs_goal_g ?? undefined);
        setFatGoal(p.fat_goal_g ?? undefined);
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
      const c = carbsGoal === undefined ? null : Math.round(carbsGoal);
      const f = fatGoal === undefined ? null : Math.round(fatGoal);
      if (c !== null && (c < 20 || c > 800)) throw new Error('Kohlenhydrat-Ziel bitte zwischen 20 und 800 g.');
      if (f !== null && (f < 20 || f > 300)) throw new Error('Fett-Ziel bitte zwischen 20 und 300 g.');
      if (maxHr !== undefined && (maxHr < 120 || maxHr > 230)) throw new Error('Maximalpuls bitte zwischen 120 und 230 bpm.');
      if (pct !== undefined && (pct < -30 || pct > 25)) throw new Error('Kalorien-Anpassung bitte zwischen −30 und +25 %.');
      if (height !== undefined && (height < 100 || height > 250)) throw new Error('Körpergröße bitte zwischen 100 und 250 cm.');
      if (birthDate && (birthDate < '1900-01-01' || ageFrom(birthDate) === undefined || ageFrom(birthDate)! > 120)) throw new Error('Geburtsdatum bitte prüfen.');
      await saveProfile(session.user.id, {
        display_name: name ?? null,
        height_cm: height ?? null,
        protein_goal_g: p,
        kcal_goal: k,
        birth_date: birthDate ?? null,
        carbs_goal_g: c,
        fat_goal_g: f,
        energy_mode: mode ?? null,
        kcal_adjust_pct: pct === undefined ? null : Math.round(pct),
        max_hr: maxHr === undefined ? null : Math.round(maxHr),
      });
      setCarbsGoal(c ?? undefined);
      setFatGoal(f ?? undefined);
      setProteinGoal(p ?? undefined);
      setKcalGoal(k ?? undefined);
      onDataChanged();
      setMsg('Profil gespeichert.');
    });

  const savePassword = () =>
    run(async () => {
      if (pw1.length < 8) throw new Error('Mindestens 8 Zeichen.');
      if (pw1 !== pw2) throw new Error('Die beiden Passwörter sind nicht gleich.');
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      try {
        localStorage.setItem('recomp_login_mode', 'password');
      } catch {
        /* egal */
      }
      setPw1('');
      setPw2('');
      setMsg('Passwort gespeichert. Beim nächsten Anmelden E-Mail und Passwort eingeben.');
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

  // Empfehlung für die Tagesziele, folgt dem gewählten Ziel (Protein, Fett, Kohlenhydrate, Kalorien)
  const basis = proteinBasis(muscle, leanMass);
  const burn = leanMass !== undefined ? suggestedKcalGoal(leanMass, activeKcal) : undefined;
  const rec = modeGoals({ energy_mode: mode, kcal_adjust_pct: pct }, basis?.value, burn);
  const recAll = rec.protein !== undefined && rec.kcal !== undefined && rec.carbs !== undefined && rec.fat !== undefined;
  const recSame = recAll && proteinGoal === rec.protein && kcalGoal === rec.kcal && carbsGoal === rec.carbs && fatGoal === rec.fat;
  const hr = maxHeartRate(maxHr, ageFrom(birthDate));
  const modeName = mode ? ENERGY_MODES[mode].label : 'ohne gewähltes Ziel';

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
          {ageFrom(birthDate) !== undefined && <span className="block text-xs text-slate-500 mt-1">{ageFrom(birthDate)} Jahre.</span>}
        </label>
        <NumberField label="Maximalpuls" unit="bpm" value={maxHr} onChange={setMaxHr} />
        {hr && (
          <div className="rounded-xl bg-cyber-black/60 px-3 py-2.5 space-y-1.5">
            <p className="text-xs text-slate-400">
              {hr.estimated
                ? `Leer: Schätzung aus dem Alter, ${hr.value} bpm (208 − 0,7 × Alter, Tanaka 2001). Ein gemessener Wert aus einem harten Lauf oder Test ist genauer, trag ihn oben ein.`
                : `Eingetragener Wert, ${hr.value} bpm.`}
            </p>
            {hr.estimated && (
              <button type="button" className="block text-xs text-cyber-purple underline text-left" onClick={() => setMaxHr(hr.value)}>
                Schätzung übernehmen und danach ändern
              </button>
            )}
            <table className="w-full text-xs tabular-nums">
              <tbody>
                {hrZoneRanges(hr.value).map((z) => (
                  <tr key={z.zone} className="border-t border-white/5 text-slate-300">
                    <td className="py-1 w-14 font-bold">Zone {z.zone}</td>
                    <td>{z.name}</td>
                    <td className="text-right">
                      {z.lo} bis {z.hi} bpm
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500">Zonen als Anteil am Maximalpuls (50 bis 100 %). Im Kalender steht bei Trainings mit Puls die Zone dazu.</p>
          </div>
        )}
        <p className="text-xs text-slate-500">Größe für den BMI, Geburtsdatum für das Alter (Körperfett-Formel, Maximalpuls-Schätzung). Alles bleibt privat in deinem Profil.</p>
        <Button variant="ghost" onClick={saveName}>
          Speichern
        </Button>
      </Section>

      <Section title="Verlauf">
        <p className="text-sm text-slate-400">Welche Diagramme der Verlauf zeigt und in welcher Reihenfolge. Häkchen = sichtbar, ☰ ziehen = verschieben. Gilt für dieses Gerät.</p>
        <SortableList
          items={order.map((k) => ({ key: k, label: CHART_LABEL[k], muted: !charts.has(k) }))}
          onChange={(keys) => {
            const next = normalizeOrder(keys);
            setOrder(next);
            saveOrder(next);
            onDataChanged();
          }}
          right={(it) => (
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-[#8B5CF6]"
              aria-label={`${it.label} anzeigen`}
              checked={charts.has(it.key)}
              onChange={() => {
                const n = new Set<string>(charts);
                if (n.has(it.key)) n.delete(it.key);
                else n.add(it.key);
                saveCharts(n);
                setCharts(n);
                onDataChanged();
              }}
            />
          )}
        />
        <label className="flex items-center gap-3 py-1 text-sm text-slate-200 border-t border-white/5 pt-3">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#8B5CF6]"
            checked={measureReminder}
            onChange={() => {
              const on = !measureReminder;
              try {
                if (on) localStorage.removeItem(MEASURE_OFF_KEY);
                else localStorage.setItem(MEASURE_OFF_KEY, '1');
              } catch {
                /* egal */
              }
              setMeasureReminder(on);
              onDataChanged();
            }}
          />
          Erinnerung an Umfänge und Hautfalten alle 14 Tage
        </label>
      </Section>

      <Section title="Anmeldung">
        <p className="text-sm text-slate-400">Mit Passwort geht das Anmelden ohne Mail. Die App bleibt angemeldet, bis du dich abmeldest.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <Label>Neues Passwort</Label>
            <input type="password" autoComplete="new-password" className={inputCls} value={pw1} onChange={(e) => setPw1(e.target.value)} />
          </label>
          <label className="block">
            <Label>Wiederholen</Label>
            <input type="password" autoComplete="new-password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
        </div>
        <Button variant="ghost" onClick={savePassword} disabled={pw1.length < 8}>
          Passwort speichern
        </Button>
      </Section>

      <Section title="Ziel">
        <p className="text-sm text-slate-400">Wählt, wie weit dein Kalorienziel unter oder über deinem Tagesverbrauch liegt. Der Verbrauch kommt aus Grundumsatz und Bewegung des Tages. Protein bleibt bei 2 g je kg Magermasse.</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(ENERGY_MODES) as EnergyMode[]).map((k) => {
            const m = ENERGY_MODES[k];
            const on = mode === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setMode(k);
                  setPct(m.pct);
                }}
                aria-pressed={on}
                className={`rounded-xl border px-3 py-2.5 text-left ${on ? 'border-cyber-green bg-cyber-green/10' : 'border-white/10 bg-cyber-black'}`}
              >
                <span className={`block text-sm font-bold ${on ? 'text-cyber-green' : 'text-slate-100'}`}>{m.label}</span>
                <span className="block text-[11px] text-slate-500">
                  {m.pct > 0 ? '+' : m.pct < 0 ? '−' : '±'}
                  {Math.abs(m.pct)} % kcal
                </span>
              </button>
            );
          })}
        </div>
        {mode && (
          <div className="rounded-xl bg-cyber-black/60 px-3 py-2.5 space-y-2">
            <p className="text-xs text-slate-300">{ENERGY_MODES[mode].text}</p>
            <p className="text-xs text-slate-400">Richtwert: {ENERGY_MODES[mode].rate}.</p>
            <label className="flex items-center gap-3">
              <span className="flex-1 text-sm text-slate-200">Kalorien zum Verbrauch</span>
              <input
                type="range"
                min={ENERGY_MODES[mode].min}
                max={ENERGY_MODES[mode].max}
                step={1}
                value={pct ?? ENERGY_MODES[mode].pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="w-32 accent-[#ADFF2F]"
                aria-label="Kalorien-Anpassung in Prozent"
              />
              <span className="w-14 text-right text-sm font-bold tabular-nums text-slate-100">
                {(pct ?? ENERGY_MODES[mode].pct) > 0 ? '+' : ''}
                {pct ?? ENERGY_MODES[mode].pct} %
              </span>
            </label>
            {leanMass !== undefined && (
              <p className="text-[11px] text-slate-500">
                Bei Ø Verbrauch von {suggestedKcalGoal(leanMass, activeKcal)?.toLocaleString('de-DE')} kcal heißt das etwa{' '}
                {(Math.round(((suggestedKcalGoal(leanMass, activeKcal) ?? 0) * (1 + (pct ?? ENERGY_MODES[mode].pct) / 100)) / 50) * 50).toLocaleString('de-DE')} kcal am Tag. Quellen: Helms 2014, Iraki 2019 (docs/literatur).
              </p>
            )}
          </div>
        )}
        <Button variant="ghost" onClick={saveName}>
          Speichern
        </Button>
      </Section>

      <Section title="Tagesziele">
        <p className="text-sm text-slate-400">Erscheinen im Verlauf als Linie und auf der Startseite als Fortschritt. Leer lassen, wenn du kein Ziel willst. Kalorien: Sind Gewicht und Körperfett bekannt, rechnet die Startseite das Tagesziel täglich neu aus Verbrauch plus Anpassung des Ziels. Der Wert hier gilt dann nur für den Verlauf.</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Protein" unit="g" value={proteinGoal} onChange={setProteinGoal} />
          <NumberField label="Kalorien" unit="kcal" value={kcalGoal} onChange={setKcalGoal} />
          <NumberField label="Kohlenhydrate" unit="g" value={carbsGoal} onChange={setCarbsGoal} />
          <NumberField label="Fett" unit="g" value={fatGoal} onChange={setFatGoal} />
        </div>
        {leanMass === undefined && muscle === undefined ? (
          <p className="text-xs text-slate-500">Empfehlungen gibt es, sobald Gewicht und Körperfett erfasst sind (Waage oder Apple Health).</p>
        ) : (
          <div className="rounded-xl bg-cyber-black/60 px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Empfehlung für: {modeName}</p>
            <ul className="text-xs text-slate-300 space-y-0.5">
              <li>
                Protein {rec.protein !== undefined ? `${rec.protein} g` : '–'}: {rec.proteinPerKg.toLocaleString('de-DE')} g je kg {basis?.label ?? 'Magermasse'}
                {basis ? ` (${basis.value} kg)` : ''}
              </li>
              <li>
                Kalorien {rec.kcal !== undefined ? `${rec.kcal.toLocaleString('de-DE')} kcal` : '–'}: Verbrauch {burn?.toLocaleString('de-DE') ?? '–'} kcal {rec.pct > 0 ? '+' : rec.pct < 0 ? '−' : '±'}
                {Math.abs(rec.pct)} %
              </li>
              <li>
                Fett {rec.fat !== undefined ? `${rec.fat} g` : '–'}: {rec.fatPct} % der Kalorien
              </li>
              <li>Kohlenhydrate {rec.carbs !== undefined ? `${rec.carbs} g` : '–'}: der Rest</li>
            </ul>
            {recAll && !recSame && (
              <button
                type="button"
                className="block text-xs font-bold text-cyber-purple underline text-left"
                onClick={() => {
                  setProteinGoal(rec.protein);
                  setKcalGoal(rec.kcal);
                  setCarbsGoal(rec.carbs);
                  setFatGoal(rec.fat);
                }}
              >
                Alle Empfehlungen übernehmen, danach speichern
              </button>
            )}
            {recSame && <p className="text-[11px] text-cyber-green">Deine Ziele entsprechen der Empfehlung.</p>}
            <p className="text-[11px] text-slate-500">Je größer das Defizit, desto mehr Protein. Spannen nach Helms 2014 und Iraki 2019 (docs/literatur), die Werte je Ziel sind daraus abgeleitet. Wechselst du das Ziel oben, ändert sich die Empfehlung.</p>
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

      <Section title="Obsidian-Vault">
        <VaultExport />
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

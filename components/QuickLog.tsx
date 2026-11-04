import React, { useEffect, useRef, useState } from 'react';
import type { EntryKind, EntrySource, NewEntry } from '../supabase/functions/_shared/domain';
import { normalizeData } from '../supabase/functions/_shared/domain';
import { insertEntries, parseText } from '../lib/entries';
import { prepareImage, type PreparedImage } from '../lib/image';
import { insertSlots } from '../lib/planSlotsApi';
import { slotsFromDrafts } from '../lib/planTemplate';
import type { PlanData } from '../supabase/functions/_shared/domain';
import { EntryIcon, Icons } from './icons';
import { dayKey, localIso } from '../lib/time';
import EntryEditor, { type Draft } from './EntryEditor';
import SwipeToDelete from './SwipeToDelete';
import { Button, Card, ErrorBox } from './ui';
import TodayBar from './TodayBar';

const DRAFT_KEY = 'recomp_quicklog_text';

// Nur die drei häufigsten Arten als Kachel. Alles andere (Plan, Körperwerte, Ergänzungen, Blutwerte) geht per Text oder Kalender.
const QUICK_ADD: { kind: EntryKind; label: string; data: any }[] = [
  { kind: 'meal', label: 'Ernährung', data: {} },
  { kind: 'workout', label: 'Training', data: { sport: 'tennis' } },
  { kind: 'wellbeing', label: 'Befinden', data: {} },
];

const EXAMPLES = [
  'Plan für die Woche: Dienstag 18 Uhr Tennisstunde, Fokus Rückhand. Donnerstag 8 km locker laufen. Samstag Capoeira',
  'Frühstück: 3 Eier, 80 g Haferflocken mit Heidelbeeren, 30 g Whey',
  'Tennis 90 Minuten Training, Fokus Aufschlag. High: Kick-Aufschlag kam stabil. Low: Rückhand-Slice zu kurz. Belastung 7',
  'Gut geschlafen, Energie hoch, leichter Muskelkater in den Waden, rechter Ellbogen zwickt etwas',
];

function useSpeech(onText: (t: string) => void) {
  const SR: any = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const recRef = useRef<any>(null);
  const [listening, setListening] = useState(false);

  const start = () => {
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      let t = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) t += ev.results[i][0].transcript;
      if (t.trim()) onText(t.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };
  const stop = () => recRef.current?.stop();
  useEffect(() => () => recRef.current?.abort?.(), []);
  return { supported: Boolean(SR), listening, start, stop };
}

const QuickLog: React.FC<{ onSaved: () => void; refreshKey?: number }> = ({ onSaved, refreshKey = 0 }) => {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [usedVoice, setUsedVoice] = useState(false);
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [asTemplate, setAsTemplate] = useState(false);
  const [busy, setBusy] = useState<'parse' | 'save' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, text);
    } catch {
      /* egal */
    }
  }, [text]);

  const speech = useSpeech((t) => {
    setUsedVoice(true);
    setText((prev) => (prev ? `${prev} ${t}` : t));
  });

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // dasselbe Foto erneut wählbar
    if (!file) return;
    setError(null);
    setSaved(null);
    setBusy('photo');
    try {
      setPhoto(await prepareImage(file));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const analyse = async () => {
    setError(null);
    setSaved(null);
    setBusy('parse');
    try {
      const r = await parseText(text, photo?.image);
      if (r.entries.length === 0) {
        setError(photo ? 'Kein Essen erkannt. Schreib dazu, was auf dem Teller ist.' : 'Nichts erkannt. Du kannst den Text als Notiz speichern.');
      }
      const source: EntrySource = photo ? 'photo' : usedVoice ? 'voice' : 'text';
      setDrafts((prev) => [...prev, ...r.entries.map((e) => ({ ...e, source, raw_text: text || null }))]);
      setUsedVoice(false);
      setQuestions(r.questions);
      if (photo && r.entries.length > 0) setPhoto(null);
      // Übernommen: Eingabefeld leeren, der Originaltext steckt in den Entwürfen (raw_text)
      if (r.entries.length > 0) setText('');
      if (/(jede[nr]? |immer|trainingsplan|wochenplan|regelmäßig)/i.test(text)) setAsTemplate(true);
    } catch (e: any) {
      setError(`KI nicht erreichbar: ${e.message}. Der Text bleibt erhalten, du kannst ihn als Notiz speichern.`);
    } finally {
      setBusy(null);
    }
  };

  const saveAsNote = () => {
    setDrafts((prev) => [...prev, { kind: 'note', occurred_at: localIso(), data: { text }, source: usedVoice ? 'voice' : 'text', raw_text: text }]);
    setText('');
  };

  const saveAll = async () => {
    setError(null);
    setBusy('save');
    try {
      const rows: NewEntry[] = [];
      const templatePlans: { occurred_at: string; data: PlanData }[] = [];
      for (const d of drafts) {
        if (asTemplate && d.kind === 'plan') {
          const data = normalizeData('plan', d.data);
          if (data) templatePlans.push({ occurred_at: d.occurred_at, data });
          continue;
        }
        const data = normalizeData(d.kind, d.data);
        if (!data) continue;
        rows.push({
          kind: d.kind,
          occurred_at: d.occurred_at,
          data,
          source: d.manual ? 'manual' : (d.source ?? 'text'),
          raw_text: d.manual ? null : (d.raw_text ?? null),
        });
      }
      if (rows.length === 0 && templatePlans.length === 0) {
        setError('Keine vollständigen Einträge. Bitte Werte ergänzen.');
        return;
      }
      await insertEntries(rows);
      await insertSlots(slotsFromDrafts(templatePlans, dayKey(new Date())));
      setSaved(
        [
          rows.length && `${rows.length} ${rows.length === 1 ? 'Eintrag' : 'Einträge'} gespeichert.`,
          templatePlans.length && `${templatePlans.length} Einheiten im Trainingsplan. Bearbeiten unter Kalender > Trainingsplan.`,
        ]
          .filter(Boolean)
          .join(' '),
      );
      setAsTemplate(false);
      setDrafts([]);
      setQuestions([]);
      setText('');
      setUsedVoice(false);
      onSaved();
    } catch (e: any) {
      setError(`Speichern fehlgeschlagen: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <TodayBar refreshKey={refreshKey} />
      <Card>
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Sprich oder schreib einfach los, z. B.\n„${EXAMPLES[Math.floor(Date.now() / 86400000) % EXAMPLES.length]}“`}
            className="w-full min-h-[140px] rounded-xl bg-cyber-black border border-white/10 p-3 pr-14 text-base text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-purple"
          />
          {speech.supported && (
            <button
              type="button"
              onClick={speech.listening ? speech.stop : speech.start}
              aria-label={speech.listening ? 'Aufnahme stoppen' : 'Spracheingabe'}
              className={`absolute right-2 top-2 h-11 w-11 rounded-full text-lg ${
                speech.listening ? 'bg-red-500 animate-pulse' : 'bg-cyber-purple'
              }`}
            >
              {speech.listening ? <Icons.Stop size={20} weight="fill" className="mx-auto" /> : <Icons.Mic size={22} className="mx-auto" />}
            </button>
          )}
        </div>
        {photo && (
          <div className="relative mt-3 inline-block">
            <img src={photo.previewUrl} alt="Essensfoto" className="h-28 rounded-xl border border-white/10 object-cover" />
            <button
              type="button"
              onClick={() => setPhoto(null)}
              aria-label="Foto entfernen"
              className="absolute -right-2 -top-2 h-8 w-8 rounded-full bg-cyber-black border border-white/20 text-sm"
            >
              <Icons.Close size={14} className="mx-auto" />
            </button>
          </div>
        )}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} />
        <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="ghost" onClick={() => cameraRef.current?.click()} disabled={busy !== null}>
            <span className="inline-flex items-center gap-2"><Icons.Camera size={18} /> Foto machen</span>
          </Button>
          <Button variant="ghost" onClick={() => libraryRef.current?.click()} disabled={busy !== null}>
            <span className="inline-flex items-center gap-2"><Icons.Image size={18} /> Mediathek</span>
          </Button>
        </div>
        {photo && <p className="text-xs text-slate-500 mt-2">Optional dazuschreiben, was die KI nicht sehen kann, z. B. „250 g Reis, mit Olivenöl“.</p>}
        {!speech.supported && (
          <p className="text-xs text-slate-500 mt-2">Tipp: Auf dem iPhone die Mikrofon-Taste der Tastatur zum Diktieren nutzen.</p>
        )}
        <div className="flex gap-2 mt-3">
          <Button className="flex-1" onClick={analyse} disabled={(!text.trim() && !photo) || busy !== null}>
            {busy === 'parse' ? 'Erkenne …' : busy === 'photo' ? 'Lade Foto …' : photo ? 'Foto auswerten' : 'Erkennen'}
          </Button>
          {text.trim() && (
            <Button variant="ghost" onClick={saveAsNote} disabled={busy !== null}>
              Als Notiz
            </Button>
          )}
        </div>
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      {saved && <div className="rounded-xl bg-cyber-green/10 border border-cyber-green/30 text-cyber-green text-sm px-3 py-2">{saved}</div>}

      {questions.length > 0 && (
        <Card className="border-cyber-orange/30">
          <p className="text-xs font-bold uppercase tracking-wider text-cyber-orange mb-1">Fehlt noch</p>
          <ul className="text-sm text-slate-300 list-disc pl-5">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 mt-2">Ergänze es in der Karte oder sprich es oben nach und tippe nochmal auf Erkennen.</p>
        </Card>
      )}

      {drafts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Prüfen und speichern</p>
          {drafts.map((d, i) => (
            <SwipeToDelete key={i} onDelete={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}>
              <EntryEditor
                draft={d}
                defaultOpen={d.manual}
                onChange={(nd) => setDrafts((prev) => prev.map((x, j) => (j === i ? nd : x)))}
                onRemove={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
              />
            </SwipeToDelete>
          ))}
          {drafts.some((d) => d.kind === 'plan') && (
            <label className="flex items-start gap-3 rounded-xl bg-cyber-purple/10 border border-cyber-purple/30 px-3 py-3">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#8B5CF6]" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} />
              <span className="text-sm text-slate-200">
                Geplante Einheiten als festen Trainingsplan speichern
                <span className="block text-xs text-slate-400">Dann erscheinen sie jede Woche. Sonst nur einmal an diesem Datum.</span>
              </span>
            </label>
          )}
          <Button variant="green" className="w-full" onClick={saveAll} disabled={busy !== null}>
            {busy === 'save' ? 'Speichere …' : `${drafts.length} speichern`}
          </Button>
        </div>
      )}

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Oder direkt eintragen</p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_ADD.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setDrafts((prev) => [...prev, { kind: q.kind, occurred_at: localIso(), data: { ...q.data }, manual: true }])}
              className="rounded-xl bg-cyber-gray border border-white/5 py-3 text-sm text-slate-200"
            >
              <EntryIcon kind={q.kind} size={24} className="mx-auto mb-1 text-slate-300" />
              {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuickLog;

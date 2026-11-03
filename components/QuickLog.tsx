import React, { useEffect, useRef, useState } from 'react';
import type { EntryKind, NewEntry } from '../supabase/functions/_shared/domain';
import { normalizeData } from '../supabase/functions/_shared/domain';
import { insertEntries, parseText } from '../lib/entries';
import { KIND_ICON } from '../lib/format';
import { localIso } from '../lib/time';
import EntryEditor, { type Draft } from './EntryEditor';
import { Button, Card, ErrorBox } from './ui';

const DRAFT_KEY = 'recomp_quicklog_text';

const QUICK_ADD: { kind: EntryKind; label: string; data: any }[] = [
  { kind: 'meal', label: 'Mahlzeit', data: {} },
  { kind: 'workout', label: 'Training', data: { sport: 'tennis' } },
  { kind: 'plan', label: 'Plan', data: { sport: 'tennis' } },
  { kind: 'body', label: 'Gewicht', data: {} },
  { kind: 'wellbeing', label: 'Befinden', data: {} },
  { kind: 'lab', label: 'Laborwert', data: {} },
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

const QuickLog: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [rawText, setRawText] = useState<string | null>(null);
  const [usedVoice, setUsedVoice] = useState(false);
  const [busy, setBusy] = useState<'parse' | 'save' | null>(null);
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

  const analyse = async () => {
    setError(null);
    setSaved(null);
    setBusy('parse');
    try {
      const r = await parseText(text);
      if (r.entries.length === 0) {
        setError('Nichts erkannt. Du kannst den Text als Notiz speichern.');
      }
      setDrafts((prev) => [...prev, ...r.entries.map((e) => ({ ...e }))]);
      setQuestions(r.questions);
      setRawText(text);
    } catch (e: any) {
      setError(`KI nicht erreichbar: ${e.message}. Der Text bleibt erhalten, du kannst ihn als Notiz speichern.`);
    } finally {
      setBusy(null);
    }
  };

  const saveAsNote = () => {
    setDrafts((prev) => [...prev, { kind: 'note', occurred_at: localIso(), data: { text } }]);
    setRawText(text);
  };

  const saveAll = async () => {
    setError(null);
    setBusy('save');
    try {
      const rows: NewEntry[] = [];
      for (const d of drafts) {
        const data = normalizeData(d.kind, d.data);
        if (!data) continue;
        rows.push({
          kind: d.kind,
          occurred_at: d.occurred_at,
          data,
          source: d.manual || !rawText ? 'manual' : usedVoice ? 'voice' : 'text',
          raw_text: d.manual ? null : rawText,
        });
      }
      if (rows.length === 0) {
        setError('Keine vollständigen Einträge. Bitte Werte ergänzen.');
        return;
      }
      await insertEntries(rows);
      setSaved(`${rows.length} ${rows.length === 1 ? 'Eintrag' : 'Einträge'} gespeichert.`);
      setDrafts([]);
      setQuestions([]);
      setText('');
      setRawText(null);
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
              {speech.listening ? '■' : '🎙'}
            </button>
          )}
        </div>
        {!speech.supported && (
          <p className="text-xs text-slate-500 mt-2">Tipp: Auf dem iPhone die Mikrofon-Taste der Tastatur zum Diktieren nutzen.</p>
        )}
        <div className="flex gap-2 mt-3">
          <Button className="flex-1" onClick={analyse} disabled={!text.trim() || busy !== null}>
            {busy === 'parse' ? 'Erkenne …' : 'Erkennen'}
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
            <EntryEditor
              key={i}
              draft={d}
              defaultOpen={d.manual}
              onChange={(nd) => setDrafts((prev) => prev.map((x, j) => (j === i ? nd : x)))}
              onRemove={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
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
              key={q.kind}
              type="button"
              onClick={() => setDrafts((prev) => [...prev, { kind: q.kind, occurred_at: localIso(), data: { ...q.data }, manual: true }])}
              className="rounded-xl bg-cyber-gray border border-white/5 py-3 text-sm text-slate-200"
            >
              <span className="block text-lg">{KIND_ICON[q.kind]}</span>
              {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuickLog;

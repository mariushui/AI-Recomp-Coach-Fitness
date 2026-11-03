import React, { useCallback, useEffect, useState } from 'react';
import type { Entry } from '../supabase/functions/_shared/domain';
import { normalizeData } from '../supabase/functions/_shared/domain';
import { deleteEntry, listEntries, updateEntry } from '../lib/entries';
import { dailyStats } from '../lib/stats';
import { addDays, formatDay, formatTime, startOfDay } from '../lib/time';
import { KIND_ICON, entryTitle, summarize } from '../lib/format';
import EntryEditor, { type Draft } from './EntryEditor';
import { Button, Card, ErrorBox } from './ui';

const Stat: React.FC<{ label: string; value?: number; unit: string }> = ({ label, value, unit }) => (
  <div className="rounded-xl bg-cyber-black/60 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="text-lg font-bold text-slate-100">
      {value === undefined ? <span className="text-slate-600">–</span> : value}
      {value !== undefined && <span className="text-xs text-slate-400 ml-1">{unit}</span>}
    </div>
  </div>
);

const DayView: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listEntries(day, addDays(day, 1)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const stats = dailyStats(entries, day, addDays(day, 1))[0];
  const isToday = startOfDay(new Date()).getTime() === day.getTime();

  const startEdit = (e: Entry) => {
    setEditId(e.id);
    setEditDraft({ kind: e.kind, occurred_at: e.occurred_at, data: e.data });
  };

  const saveEdit = async () => {
    if (!editId || !editDraft) return;
    const data = normalizeData(editDraft.kind, editDraft.data);
    if (!data) return setError('Eintrag ist leer.');
    try {
      await updateEntry(editId, { occurred_at: editDraft.occurred_at, data });
      setEditId(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Eintrag löschen?')) return;
    try {
      await deleteEntry(id);
      setEditId(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button className="h-10 w-10 rounded-full bg-white/5" onClick={() => setDay(addDays(day, -1))} aria-label="Vortag">
          ‹
        </button>
        <button className="text-center" onClick={() => setDay(startOfDay(new Date()))}>
          <div className="font-display font-bold text-slate-100">{isToday ? 'Heute' : formatDay(day)}</div>
          {isToday && <div className="text-xs text-slate-500">{formatDay(day)}</div>}
        </button>
        <button
          className="h-10 w-10 rounded-full bg-white/5 disabled:opacity-30"
          disabled={isToday}
          onClick={() => setDay(addDays(day, 1))}
          aria-label="Folgetag"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Gewicht" value={stats?.weight} unit="kg" />
        <Stat label="Protein" value={stats?.protein} unit="g" />
        <Stat label="kcal" value={stats?.kcal} unit="" />
        <Stat label="Training" value={stats?.trainingMin} unit="min" />
        <Stat label="Schlaf" value={stats?.sleepH} unit="h" />
        <Stat label="HRV" value={stats?.hrv} unit="ms" />
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && <p className="text-sm text-slate-500">Lade …</p>}
      {!loading && entries.length === 0 && (
        <Card>
          <p className="text-sm text-slate-400">Noch keine Einträge an diesem Tag.</p>
        </Card>
      )}

      <div className="space-y-2">
        {entries.map((e) =>
          editId === e.id && editDraft ? (
            <div key={e.id} className="space-y-2">
              <EntryEditor draft={editDraft} onChange={setEditDraft} defaultOpen />
              <div className="flex gap-2">
                <Button variant="green" className="flex-1" onClick={saveEdit}>
                  Speichern
                </Button>
                <Button variant="ghost" onClick={() => setEditId(null)}>
                  Abbrechen
                </Button>
                <Button variant="danger" onClick={() => remove(e.id)}>
                  Löschen
                </Button>
              </div>
            </div>
          ) : (
            <button key={e.id} onClick={() => startEdit(e)} className="w-full text-left">
              <Card className="flex gap-3 items-start">
                <span className="text-xl leading-none">{KIND_ICON[e.kind]}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex justify-between text-xs">
                    <span className="font-bold text-cyber-purple uppercase tracking-wider">{entryTitle(e)}</span>
                    <span className="text-slate-500">{formatTime(e.occurred_at)}</span>
                  </span>
                  <span className="block text-sm text-slate-200 mt-0.5 break-words">{summarize(e.kind, e.data)}</span>
                </span>
              </Card>
            </button>
          ),
        )}
      </div>
    </div>
  );
};

export default DayView;

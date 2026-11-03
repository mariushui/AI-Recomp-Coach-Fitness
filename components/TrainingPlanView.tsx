import React, { useCallback, useEffect, useState } from 'react';
import { WEEKDAY_LABEL, normalizeData, type PlanData, type PlanSlot } from '../supabase/functions/_shared/domain';
import { parseText } from '../lib/entries';
import { endSlots, insertSlots, listSlots, updateSlot } from '../lib/planSlotsApi';
import { activeSlots, slotsFromDrafts } from '../lib/planTemplate';
import { summarize } from '../lib/format';
import { dayKey, localIso } from '../lib/time';
import EntryEditor from './EntryEditor';
import { Button, Card, ErrorBox, Label } from './ui';

type SlotDraft = Omit<PlanSlot, 'id'> & { id?: string; key: string };

const inputCls = 'w-full rounded-xl bg-cyber-black border border-white/10 px-3 py-2.5 text-base text-slate-100';

const SlotCard: React.FC<{
  slot: SlotDraft;
  onChange?: (s: SlotDraft) => void; // Entwurf: Änderungen gehen direkt in den Entwurf
  onSave?: (s: SlotDraft) => Promise<void>; // gespeicherte Einheit: erst bei Speichern übernehmen
  onRemove: () => void;
  removeLabel: string;
  defaultOpen?: boolean;
}> = ({ slot, onChange, onSave, onRemove, removeLabel, defaultOpen }) => {
  const [local, setLocal] = useState(slot);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setLocal(slot);
    setDirty(false);
  }, [slot]);
  const update = (s: SlotDraft) => {
    if (onChange) onChange(s);
    else {
      setLocal(s);
      setDirty(true);
    }
  };
  const cur = onChange ? slot : local;
  return (
    <div className="space-y-2">
      <EntryEditor
        draft={{ kind: 'plan', occurred_at: localIso(), data: cur.data }}
        onChange={(d) => update({ ...cur, data: d.data })}
        onRemove={onRemove}
        hideTime
        defaultOpen={defaultOpen}
        extra={
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <Label>Wochentag</Label>
          <select className={inputCls} value={cur.weekday} onChange={(e) => update({ ...cur, weekday: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label>Uhrzeit</Label>
          <input type="time" className={inputCls} value={cur.time} onChange={(e) => e.target.value && update({ ...cur, time: e.target.value })} />
        </label>
      </div>
        }
        header={
          <>
            {WEEKDAY_LABEL[cur.weekday]} · {cur.time} Uhr
          </>
        }
      />
      {onSave && dirty && (
        <div className="flex gap-2 px-1">
          <Button variant="green" className="flex-1 !py-2" onClick={() => onSave(local).then(() => setDirty(false))}>
            Änderung speichern
          </Button>
          <Button
            variant="ghost"
            className="!py-2"
            onClick={() => {
              setLocal(slot);
              setDirty(false);
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
      {!onChange && !dirty && (
        <button className="text-[11px] text-slate-500 underline px-1" onClick={onRemove}>
          {removeLabel}
        </button>
      )}
    </div>
  );
};

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

const TrainingPlanView: React.FC<{ onClose: () => void; onChanged: () => void }> = ({ onClose, onChanged }) => {
  const [slots, setSlots] = useState<PlanSlot[]>([]);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<SlotDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const today = dayKey(new Date());
  const load = useCallback(async () => {
    try {
      setSlots(activeSlots(await listSlots(), today));
    } catch (e: any) {
      setError(e.message);
    }
  }, [today]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
      await load();
      onChanged();
      if (done) setMsg(done);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const analyse = () =>
    run(async () => {
      const r = await parseText(`Mein fester Trainingsplan, gilt jede Woche:\n${text}`);
      const plans = r.entries.filter((e) => e.kind === 'plan' || e.kind === 'workout');
      if (!plans.length) throw new Error('Keine Einheiten erkannt. Nenne Wochentag und Sport, zum Beispiel „Dienstag 18 Uhr Tennis“.');
      const asPlans = plans.map((e) => ({ occurred_at: e.occurred_at, data: normalizeData('plan', e.data) as PlanData }));
      setDrafts((prev) => [...prev, ...slotsFromDrafts(asPlans, today).map((s) => ({ ...s, key: newKey() }))]);
    });

  const saveDrafts = (replace: boolean) =>
    run(
      async () => {
        if (replace) await endSlots(slots.map((s) => s.id));
        await insertSlots(drafts.map(({ key, id, ...s }) => ({ ...s, data: normalizeData('plan', s.data) as PlanData })));
        setDrafts([]);
        setText('');
      },
      replace ? 'Neuer Trainingsplan gilt ab heute.' : 'Einheiten zum Trainingsplan hinzugefügt.',
    );

  /** Vergangene Wochen behalten ihren alten Plan: alte Einheit endet gestern, neue gilt ab heute. */
  const saveSlot = (orig: PlanSlot, s: SlotDraft) =>
    run(async () => {
      const data = normalizeData('plan', s.data) as PlanData;
      if (orig.valid_from < today) {
        await endSlots([orig.id]);
        await insertSlots([{ weekday: s.weekday, time: s.time, data, valid_from: today, valid_to: null }]);
      } else {
        await updateSlot(orig.id, { weekday: s.weekday, time: s.time, data });
      }
    }, 'Gespeichert. Gilt ab heute.');

  const removeSlot = (s: PlanSlot) => run(() => endSlots([s.id]), 'Einheit aus dem Trainingsplan entfernt.');

  const total = slots.reduce((a, s) => a + (s.data.duration_min ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="h-10 w-10 rounded-full bg-white/5" onClick={onClose} aria-label="Zurück zum Kalender">
          ‹
        </button>
        <div>
          <h2 className="font-display font-bold text-slate-100 text-lg">Trainingsplan</h2>
          <p className="text-xs text-slate-500">Gilt jede Woche. Einzelne Wochen änderst du im Kalender.</p>
        </div>
      </div>

      <Card className="space-y-3">
        <Label>Plan einsprechen oder schreiben</Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'z. B. „Dienstag 18 Uhr Tennisstunde 90 Minuten, Fokus Rückhand. Donnerstag 7 Uhr 8 km laufen. Samstag 10 Uhr Capoeira 75 Minuten. Sonntag Schwimmen 40 Minuten.“'}
          className="w-full min-h-[110px] rounded-xl bg-cyber-black border border-white/10 p-3 text-base text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-purple"
        />
        <Button className="w-full" onClick={analyse} disabled={!text.trim() || busy}>
          {busy && !drafts.length ? 'Erkenne …' : 'Erkennen'}
        </Button>
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      {msg && <div className="rounded-xl bg-cyber-green/10 border border-cyber-green/30 text-cyber-green text-sm px-3 py-2">{msg}</div>}

      {drafts.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Neu erkannt, prüfen</p>
          {drafts.map((d) => (
            <SlotCard
              key={d.key}
              slot={d}
              onChange={(nd) => setDrafts((prev) => prev.map((x) => (x.key === d.key ? nd : x)))}
              onRemove={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
              removeLabel="Entfernen"
            />
          ))}
          <div className="flex gap-2">
            {slots.length > 0 && (
              <Button variant="green" className="flex-1" disabled={busy} onClick={() => saveDrafts(true)}>
                Plan ersetzen
              </Button>
            )}
            <Button variant={slots.length ? 'ghost' : 'green'} className="flex-1" disabled={busy} onClick={() => saveDrafts(false)}>
              {slots.length ? 'Ergänzen' : 'Als Trainingsplan speichern'}
            </Button>
          </div>
          {slots.length > 0 && (
            <p className="text-[11px] text-slate-500">„Ersetzen“ beendet den bisherigen Plan ab heute. Vergangene Wochen bleiben, wie sie waren.</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Aktueller Plan</p>
          {slots.length > 0 && (
            <p className="text-xs text-slate-500">
              {slots.length} Einheiten · {Math.round((total / 60) * 10) / 10} h pro Woche
            </p>
          )}
        </div>
        {slots.length === 0 && !drafts.length && (
          <Card>
            <p className="text-sm text-slate-400">Noch kein Trainingsplan. Sprich oben deine typische Woche ein.</p>
          </Card>
        )}
        {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
          const list = slots.filter((s) => s.weekday === wd);
          if (!list.length) return null;
          return (
            <div key={wd} className="space-y-2">
              <p className="text-sm font-bold text-slate-200">{WEEKDAY_LABEL[wd]}</p>
              {list.map((s) => (
                <SlotCard
                  key={s.id}
                  slot={{ ...s, key: s.id }}
                  onSave={(nd) => saveSlot(s, nd)}
                  onRemove={() => removeSlot(s)}
                  removeLabel={`${summarize('plan', s.data).split(' · ')[0]} am ${WEEKDAY_LABEL[s.weekday]} aus dem Plan löschen`}
                />
              ))}
            </div>
          );
        })}
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setDrafts((prev) => [...prev, { key: newKey(), weekday: 1, time: '18:00', data: { sport: 'tennis' }, valid_from: today, valid_to: null }])}
        >
          + Einheit hinzufügen
        </Button>
      </div>
    </div>
  );
};

export default TrainingPlanView;

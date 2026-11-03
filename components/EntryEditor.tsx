import React, { useState } from 'react';
import {
  KIND_LABEL,
  SPORTS,
  SPORT_LABEL,
  SPORT_CATEGORY,
  type EntryKind,
  type StrengthSet,
} from '../supabase/functions/_shared/domain';
import { KIND_ICON, summarize } from '../lib/format';
import { fromInputValue, toInputValue } from '../lib/time';
import { Card, NumberField, ScaleField, SelectField, TextField, Label } from './ui';

export interface Draft {
  kind: EntryKind;
  occurred_at: string;
  data: any;
  manual?: boolean; // ohne KI angelegt
}

interface Props {
  draft: Draft;
  onChange: (d: Draft) => void;
  onRemove?: () => void;
  defaultOpen?: boolean;
}

const EntryEditor: React.FC<Props> = ({ draft, onChange, onRemove, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const d = draft.data ?? {};
  const set = (key: string, value: unknown) => {
    const next = { ...d };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange({ ...draft, data: next });
  };
  const listText = (v: string[] | undefined) => (v ?? []).join(', ');
  const toList = (s: string | undefined) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

  return (
    <Card className="!p-0 overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-start gap-3 p-4 text-left">
        <span className="text-xl leading-none mt-0.5">{KIND_ICON[draft.kind]}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-bold uppercase tracking-wider text-cyber-purple">
            {KIND_LABEL[draft.kind]} · {new Date(draft.occurred_at).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="block text-sm text-slate-200 mt-0.5 break-words">
            {summarize(draft.kind, d) || <em className="text-slate-500">leer</em>}
          </span>
        </span>
        <span className="text-slate-500 text-xs mt-1">{open ? 'zu' : 'bearbeiten'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          <label className="block">
            <Label>Zeitpunkt</Label>
            <input
              type="datetime-local"
              className="w-full rounded-xl bg-cyber-black border border-white/10 px-3 py-2.5 text-base text-slate-100"
              value={toInputValue(draft.occurred_at)}
              onChange={(e) => e.target.value && onChange({ ...draft, occurred_at: fromInputValue(e.target.value) })}
            />
          </label>

          {draft.kind === 'meal' && (
            <>
              <TextField label="Was" multiline value={d.description} onChange={(v) => set('description', v)} />
              <SelectField
                label="Mahlzeit"
                value={d.meal_type}
                onChange={(v) => set('meal_type', v)}
                options={[
                  { value: 'fruehstueck', label: 'Frühstück' },
                  { value: 'mittag', label: 'Mittag' },
                  { value: 'abend', label: 'Abend' },
                  { value: 'snack', label: 'Snack' },
                  { value: 'shake', label: 'Shake' },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Protein" unit="g" value={d.protein_g} onChange={(v) => set('protein_g', v)} />
                <NumberField label="Kalorien" unit="kcal" value={d.kcal} onChange={(v) => set('kcal', v)} />
                <NumberField label="Kohlenhydrate" unit="g" value={d.carbs_g} onChange={(v) => set('carbs_g', v)} />
                <NumberField label="Fett" unit="g" value={d.fat_g} onChange={(v) => set('fat_g', v)} />
              </div>
              {d.confidence && (
                <p className="text-xs text-slate-500">
                  KI-Schätzung, Sicherheit: {{ low: 'niedrig', medium: 'mittel', high: 'hoch' }[d.confidence as string]}
                </p>
              )}
            </>
          )}

          {draft.kind === 'workout' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Sport"
                  allowEmpty={false}
                  value={d.sport ?? 'sonstiges'}
                  onChange={(v) => set('sport', v)}
                  options={SPORTS.map((s) => ({ value: s, label: SPORT_LABEL[s] }))}
                />
                <SelectField
                  label="Art"
                  value={d.session_type}
                  onChange={(v) => set('session_type', v)}
                  options={[
                    { value: 'training', label: 'Training' },
                    { value: 'stunde', label: 'Trainerstunde' },
                    { value: 'match', label: 'Match' },
                    { value: 'wettkampf', label: 'Wettkampf' },
                    { value: 'frei', label: 'Frei / locker' },
                  ]}
                />
              </div>
              {d.sport === 'sonstiges' && <TextField label="Welcher Sport" value={d.sport_label} onChange={(v) => set('sport_label', v)} />}
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Dauer" unit="min" value={d.duration_min} onChange={(v) => set('duration_min', v)} />
                <NumberField label="Belastung RPE" unit="1-10" value={d.rpe} onChange={(v) => set('rpe', v)} />
              </div>
              {SPORT_CATEGORY[(d.sport ?? 'sonstiges') as keyof typeof SPORT_CATEGORY] === 'skill' && (
                <>
                  <TextField label="Fokus / woran gearbeitet" value={d.focus} onChange={(v) => set('focus', v)} />
                  <TextField label="High des Tages" value={d.high} onChange={(v) => set('high', v)} />
                  <TextField label="Low des Tages" value={d.low} onChange={(v) => set('low', v)} />
                  {(d.session_type === 'match' || d.session_type === 'wettkampf' || d.result) && (
                    <div className="grid grid-cols-2 gap-3">
                      <TextField label="Ergebnis" value={d.result} onChange={(v) => set('result', v)} placeholder="6:4 3:6 10:8" />
                      <TextField label="Gegner" value={d.opponent} onChange={(v) => set('opponent', v)} />
                    </div>
                  )}
                </>
              )}
              {SPORT_CATEGORY[(d.sport ?? 'sonstiges') as keyof typeof SPORT_CATEGORY] === 'endurance' && (
                <div className="grid grid-cols-3 gap-3">
                  <NumberField label="Distanz" unit="km" step={0.1} value={d.distance_km} onChange={(v) => set('distance_km', v)} />
                  <TextField label="Pace" value={d.avg_pace} onChange={(v) => set('avg_pace', v)} placeholder="5:30" />
                  <NumberField label="Puls Ø" value={d.avg_hr} onChange={(v) => set('avg_hr', v)} />
                </div>
              )}
              {(d.sport === 'kraft' || d.exercises?.length) && (
                <ExerciseList value={d.exercises ?? []} onChange={(v) => set('exercises', v.length ? v : undefined)} />
              )}
              <TextField label="Notizen" multiline value={d.notes} onChange={(v) => set('notes', v)} />
            </>
          )}

          {draft.kind === 'body' && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Gewicht" unit="kg" step={0.1} value={d.weight_kg} onChange={(v) => set('weight_kg', v)} />
              <NumberField label="Körperfett" unit="%" step={0.1} value={d.body_fat_pct} onChange={(v) => set('body_fat_pct', v)} />
              <NumberField label="Taille" unit="cm" step={0.5} value={d.waist_cm} onChange={(v) => set('waist_cm', v)} />
              <div />
              <NumberField label="Blutdruck sys." value={d.bp_systolic} onChange={(v) => set('bp_systolic', v)} />
              <NumberField label="Blutdruck dia." value={d.bp_diastolic} onChange={(v) => set('bp_diastolic', v)} />
            </div>
          )}

          {draft.kind === 'wellbeing' && (
            <>
              <ScaleField label="Energie" value={d.energy} onChange={(v) => set('energy', v)} low="leer" high="voll" />
              <ScaleField label="Stimmung" value={d.mood} onChange={(v) => set('mood', v)} low="mies" high="top" />
              <ScaleField label="Schlafgefühl" value={d.sleep_quality} onChange={(v) => set('sleep_quality', v)} low="schlecht" high="erholt" />
              <ScaleField label="Stress" value={d.stress} onChange={(v) => set('stress', v)} low="ruhig" high="hoch" />
              <ScaleField label="Muskelkater" value={d.soreness} onChange={(v) => set('soreness', v)} low="keiner" high="stark" />
              <TextField label="Wo Muskelkater" value={listText(d.soreness_areas)} onChange={(v) => set('soreness_areas', toList(v))} placeholder="Beine, Schulter" />
              <ScaleField label="Gelenke / Sehnen" value={d.joint_pain} onChange={(v) => set('joint_pain', v)} low="frei" high="Schmerz" />
              <TextField label="Welche Gelenke" value={listText(d.joint_pain_areas)} onChange={(v) => set('joint_pain_areas', toList(v))} placeholder="rechter Ellbogen" />
              <ScaleField label="Konzentration" value={d.focus} onChange={(v) => set('focus', v)} low="zerstreut" high="klar" />
              <ScaleField label="Appetit" value={d.appetite} onChange={(v) => set('appetite', v)} low="kaum" high="Heißhunger" />
              <TextField label="Notiz" multiline value={d.notes} onChange={(v) => set('notes', v)} />
            </>
          )}

          {draft.kind === 'lab' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <TextField label="Wert" value={d.name} onChange={(v) => set('name', v)} placeholder="Vitamin D" />
              </div>
              <div className="col-span-2">
                <NumberField label="Ergebnis" step={0.01} value={d.value} onChange={(v) => set('value', v)} />
              </div>
              <TextField label="Einheit" value={d.unit} onChange={(v) => set('unit', v)} placeholder="ng/ml" />
            </div>
          )}

          {draft.kind === 'note' && <TextField label="Text" multiline value={d.text} onChange={(v) => set('text', v)} />}

          {draft.kind === 'health' && <p className="text-xs text-slate-500">Kommt aus Apple Health und wird beim nächsten Sync überschrieben.</p>}

          {onRemove && (
            <button type="button" onClick={onRemove} className="text-xs text-red-300 underline">
              Entfernen
            </button>
          )}
        </div>
      )}
    </Card>
  );
};

const ExerciseList: React.FC<{ value: StrengthSet[]; onChange: (v: StrengthSet[]) => void }> = ({ value, onChange }) => {
  const upd = (i: number, patch: Partial<StrengthSet>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const n = (s: string) => {
    const v = Number(s.replace(',', '.'));
    return s === '' || !Number.isFinite(v) ? undefined : v;
  };
  const cell = 'rounded-lg bg-cyber-black border border-white/10 px-2 py-2 text-sm w-full';
  return (
    <div>
      <Label>Übungen</Label>
      <div className="space-y-2">
        {value.map((x, i) => (
          <div key={i} className="grid grid-cols-[1fr_44px_44px_56px_24px] gap-1.5 items-center">
            <input className={cell} value={x.exercise} placeholder="Übung" onChange={(e) => upd(i, { exercise: e.target.value })} />
            <input className={cell} inputMode="numeric" value={x.sets ?? ''} placeholder="S" onChange={(e) => upd(i, { sets: n(e.target.value) })} />
            <input className={cell} inputMode="numeric" value={x.reps ?? ''} placeholder="W" onChange={(e) => upd(i, { reps: n(e.target.value) })} />
            <input className={cell} inputMode="decimal" value={x.weight_kg ?? ''} placeholder="kg" onChange={(e) => upd(i, { weight_kg: n(e.target.value) })} />
            <button type="button" className="text-slate-500" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="mt-2 text-xs text-cyber-purple" onClick={() => onChange([...value, { exercise: '' }])}>
        + Übung
      </button>
    </div>
  );
};

export default EntryEditor;

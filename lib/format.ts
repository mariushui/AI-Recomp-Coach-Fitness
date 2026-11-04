import {
  KIND_LABEL,
  SPORT_LABEL,
  type Entry,
  type EntryKind,
  type MealData,
  type WorkoutData,
  type PlanData,
  type BodyData,
  type WellbeingData,
  type LabData,
  type NoteData,
  type HealthData,
} from '../supabase/functions/_shared/domain';

export const KIND_ICON: Record<EntryKind, string> = {
  meal: '🍳',
  workout: '🎾',
  plan: '🗓️',
  body: '⚖️',
  wellbeing: '🙂',
  lab: '🧪',
  note: '📝',
  health: '❤️',
};

const HEALTH_LABEL: Record<string, string> = {
  weight: 'Gewicht',
  body_fat: 'Körperfett',
  resting_hr: 'Ruhepuls',
  hrv: 'HRV',
  vo2max: 'VO2max',
  exercise_min: 'Trainingsminuten',
  spo2: 'Blutsauerstoff',
  hr_recovery: 'Cardio-Erholung',
  sleep: 'Schlaf',
  steps: 'Schritte',
  active_kcal: 'Aktive Kalorien',
  workout: 'Workout',
  distance_walk_run: 'Gehen und Laufen',
  distance_cycling: 'Rad',
  distance_swim: 'Schwimmen',
  swim_strokes: 'Schwimmzüge',
  glucose: 'Blutzucker',
  bmi: 'BMI',
  resp_rate: 'Atemfrequenz',
  wrist_temp: 'Handgelenktemperatur',
  lean_mass: 'Magere Masse',
};

const j = (parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' · ');

export function summarize(kind: EntryKind, data: any): string {
  switch (kind) {
    case 'meal': {
      const m = data as MealData;
      if (m.meal_type === 'ergaenzung') {
        const items = m.items?.map((i) => (i.amount ? `${i.name} ${i.amount}` : i.name)).join(', ');
        return j([items || m.description, m.protein_g !== undefined && `${m.protein_g} g Protein`]);
      }
      return j([m.description, m.protein_g !== undefined && `${m.protein_g} g Protein`, m.kcal !== undefined && `${m.kcal} kcal`]);
    }
    case 'workout': {
      const w = data as WorkoutData;
      return j([
        w.sport === 'sonstiges' ? w.sport_label ?? 'Training' : SPORT_LABEL[w.sport],
        w.duration_min !== undefined && `${w.duration_min} min`,
        w.rpe !== undefined && `RPE ${w.rpe}`,
        w.distance_km !== undefined && `${w.distance_km} km`,
        w.kcal !== undefined && `${w.kcal} kcal`,
        w.avg_hr !== undefined && `Ø ${w.avg_hr} bpm`,
        w.focus && `Fokus: ${w.focus}`,
        w.high && `↑ ${w.high}`,
        w.low && `↓ ${w.low}`,
        w.exercises?.length && `${w.exercises.length} Übungen`,
      ]);
    }
    case 'plan': {
      const p = data as PlanData;
      return j([
        p.sport === 'sonstiges' ? p.sport_label ?? 'Training' : SPORT_LABEL[p.sport],
        p.duration_min !== undefined && `${p.duration_min} min`,
        p.distance_km !== undefined && `${p.distance_km} km`,
        p.focus && `Fokus: ${p.focus}`,
        p.goal && `Ziel: ${p.goal}`,
        p.exercises?.length && `${p.exercises.length} Übungen`,
      ]);
    }
    case 'body': {
      const b = data as BodyData;
      return j([
        b.weight_kg !== undefined && `${b.weight_kg} kg`,
        b.body_fat_pct !== undefined && `${b.body_fat_pct} % KFA`,
        b.waist_cm !== undefined && `Taille ${b.waist_cm} cm`,
        b.muscle_kg !== undefined && `Muskeln ${b.muscle_kg} kg`,
        b.bp_systolic !== undefined && `RR ${b.bp_systolic}/${b.bp_diastolic ?? '?'}`,
      ]);
    }
    case 'wellbeing': {
      const w = data as WellbeingData;
      return j([
        w.energy !== undefined && `Energie ${w.energy}/5`,
        w.mood !== undefined && `Stimmung ${w.mood}/5`,
        w.sleep_quality !== undefined && `Schlaf ${w.sleep_quality}/5`,
        w.soreness !== undefined && `Muskelkater ${w.soreness}/5`,
        w.joint_pain !== undefined && `Gelenke ${w.joint_pain}/5`,
        w.notes,
      ]);
    }
    case 'lab': {
      const l = data as LabData;
      return `${l.name}: ${l.value} ${l.unit ?? ''}`.trim();
    }
    case 'note':
      return (data as NoteData).text;
    case 'health': {
      const h = data as HealthData;
      if (h.metric === 'sleep') {
        const hrs = Math.floor(h.value / 60);
        const min = h.value % 60;
        const st = h.stages;
        return j([`Schlaf ${hrs} h ${min} min`, st?.deep && `Tief ${st.deep} min`, st?.rem && `REM ${st.rem} min`]);
      }
      return `${HEALTH_LABEL[h.metric] ?? h.metric}: ${h.value} ${h.unit}`;
    }
  }
}

export function entryTitle(e: Pick<Entry, 'kind' | 'data'>): string {
  if (e.kind === 'meal' && (e.data as MealData).meal_type === 'ergaenzung') return 'Ergänzung';
  if (e.kind === 'workout' || e.kind === 'plan') {
    const w = e.data as WorkoutData;
    return w.sport === 'sonstiges' ? w.sport_label ?? 'Training' : SPORT_LABEL[w.sport];
  }
  return KIND_LABEL[e.kind];
}

const HEALTH_ORDER = ['sleep', 'hrv', 'resting_hr', 'resp_rate', 'wrist_temp', 'hr_recovery', 'spo2', 'vo2max', 'steps', 'active_kcal', 'exercise_min', 'distance_walk_run', 'distance_cycling', 'distance_swim', 'swim_strokes', 'weight', 'body_fat', 'lean_mass', 'bmi', 'glucose', 'workout'];

/** Alle Apple-Health-Werte eines Tages in einer Zeile: "Schlaf 7 h 32 · HRV 58 ms · Ruhepuls 51 · 9.400 Schritte" */
export function healthLine(entries: Pick<Entry<'health'>, 'data'>[]): string {
  const byMetric = new Map<string, HealthData>();
  for (const e of entries) byMetric.set(e.data.metric, e.data);
  const parts: string[] = [];
  for (const m of HEALTH_ORDER) {
    const h = byMetric.get(m);
    if (!h) continue;
    switch (m) {
      case 'sleep':
        parts.push(`Schlaf ${Math.floor(h.value / 60)} h ${String(h.value % 60).padStart(2, '0')}`);
        break;
      case 'steps':
        parts.push(`${h.value.toLocaleString('de-DE')} Schritte`);
        break;
      case 'active_kcal':
        parts.push(`${h.value} kcal aktiv`);
        break;
      case 'exercise_min':
        parts.push(`${h.value} min Training`);
        break;
      default:
        parts.push(`${HEALTH_LABEL[m] ?? m} ${h.value}${h.unit === '%' ? ' %' : h.unit && m !== 'resting_hr' && m !== 'hr_recovery' ? ' ' + h.unit : ''}`);
    }
  }
  return parts.join(' · ');
}

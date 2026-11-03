// Gemeinsames Datenmodell für App (Vite) und Edge Functions (Deno).
// Nur reines TypeScript, keine Imports von Deno- oder Browser-APIs.
// Beschreibung in docs/DATENMODELL.md. Änderungen dort mitpflegen.

export const ENTRY_KINDS = ['meal', 'workout', 'body', 'wellbeing', 'lab', 'note', 'health'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_SOURCES = ['voice', 'text', 'manual', 'health', 'import'] as const;
export type EntrySource = (typeof ENTRY_SOURCES)[number];

export interface MealData {
  description: string;
  meal_type?: 'fruehstueck' | 'mittag' | 'abend' | 'snack' | 'shake';
  items?: { name: string; amount?: string }[];
  protein_g?: number;
  kcal?: number;
  carbs_g?: number;
  fat_g?: number;
  confidence?: 'low' | 'medium' | 'high';
}

export const SPORTS = ['tennis', 'laufen', 'capoeira', 'kraft', 'rad', 'schwimmen', 'mobility', 'sonstiges'] as const;
export type Sport = (typeof SPORTS)[number];

export const SPORT_CATEGORY: Record<Sport, 'skill' | 'strength' | 'endurance' | 'other'> = {
  tennis: 'skill',
  capoeira: 'skill',
  kraft: 'strength',
  laufen: 'endurance',
  rad: 'endurance',
  schwimmen: 'endurance',
  mobility: 'other',
  sonstiges: 'other',
};

export interface StrengthSet {
  exercise: string;
  sets?: number;
  reps?: number;
  weight_kg?: number;
  rpe?: number;
}

export interface WorkoutData {
  sport: Sport;
  sport_label?: string; // Freitext, wenn sport = sonstiges
  session_type?: 'training' | 'match' | 'stunde' | 'frei' | 'wettkampf';
  duration_min?: number;
  rpe?: number; // 1-10 gefühlte Belastung
  focus?: string; // Technik-Sport: woran gearbeitet
  high?: string; // High des Tages
  low?: string; // Low des Tages
  result?: string; // Match-Ergebnis, z. B. "6:4 3:6 10:8"
  opponent?: string;
  distance_km?: number;
  avg_pace?: string; // "5:30 min/km"
  avg_hr?: number;
  exercises?: StrengthSet[];
  notes?: string;
}

export interface BodyData {
  weight_kg?: number;
  body_fat_pct?: number;
  waist_cm?: number;
  bp_systolic?: number;
  bp_diastolic?: number;
}

export interface WellbeingData {
  // Skalen 1-5. 5 ist immer "gut" außer bei soreness und joint_pain und stress (5 = stark).
  energy?: number;
  mood?: number;
  sleep_quality?: number;
  stress?: number;
  soreness?: number;
  soreness_areas?: string[];
  joint_pain?: number;
  joint_pain_areas?: string[];
  focus?: number;
  appetite?: number;
  notes?: string;
}

export interface LabData {
  name: string; // z. B. "Vitamin D", "HbA1c", "LDL"
  value: number;
  unit?: string;
}

export interface NoteData {
  text: string;
  tags?: string[];
}

export const HEALTH_METRICS = [
  'weight',
  'body_fat',
  'resting_hr',
  'hrv',
  'vo2max',
  'steps',
  'active_kcal',
  'sleep',
  'workout',
] as const;
export type HealthMetric = (typeof HEALTH_METRICS)[number];

export interface HealthData {
  metric: HealthMetric;
  value: number;
  unit: string;
  // nur bei sleep: Minuten je Phase
  stages?: Partial<Record<'core' | 'deep' | 'rem' | 'asleep' | 'awake' | 'in_bed', number>>;
  // nur bei workout
  activity?: string;
  kcal?: number;
}

export type EntryData =
  | MealData
  | WorkoutData
  | BodyData
  | WellbeingData
  | LabData
  | NoteData
  | HealthData;

export interface EntryDataByKind {
  meal: MealData;
  workout: WorkoutData;
  body: BodyData;
  wellbeing: WellbeingData;
  lab: LabData;
  note: NoteData;
  health: HealthData;
}

export interface Entry<K extends EntryKind = EntryKind> {
  id: string;
  user_id: string;
  kind: K;
  occurred_at: string; // ISO
  source: EntrySource;
  data: EntryDataByKind[K];
  raw_text?: string | null;
  external_id?: string | null;
  created_at?: string;
}

export type NewEntry<K extends EntryKind = EntryKind> = Omit<Entry<K>, 'id' | 'user_id' | 'created_at'>;

export const KIND_LABEL: Record<EntryKind, string> = {
  meal: 'Mahlzeit',
  workout: 'Training',
  body: 'Körperwerte',
  wellbeing: 'Befinden',
  lab: 'Laborwert',
  note: 'Notiz',
  health: 'Apple Health',
};

export const SPORT_LABEL: Record<Sport, string> = {
  tennis: 'Tennis',
  laufen: 'Laufen',
  capoeira: 'Capoeira',
  kraft: 'Krafttraining',
  rad: 'Rad',
  schwimmen: 'Schwimmen',
  mobility: 'Mobility',
  sonstiges: 'Sonstiges',
};

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

const scale = (v: unknown): number | undefined => {
  const n = num(v);
  if (n === undefined) return undefined;
  return Math.min(5, Math.max(1, Math.round(n)));
};

const clean = <T extends object>(o: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
};

/** Bringt beliebige (KI- oder Formular-)Daten in die erwartete Form. Gibt null zurück, wenn nichts Brauchbares übrig bleibt. */
export function normalizeData<K extends EntryKind>(kind: K, raw: any): EntryDataByKind[K] | null {
  if (!raw || typeof raw !== 'object') return null;
  switch (kind) {
    case 'meal': {
      const d = clean<MealData>({
        description: str(raw.description) ?? '',
        meal_type: str(raw.meal_type) as MealData['meal_type'],
        items: Array.isArray(raw.items)
          ? raw.items.filter((i: any) => str(i?.name)).map((i: any) => clean({ name: str(i.name)!, amount: str(i.amount) }))
          : undefined,
        protein_g: num(raw.protein_g),
        kcal: num(raw.kcal),
        carbs_g: num(raw.carbs_g),
        fat_g: num(raw.fat_g),
        confidence: (['low', 'medium', 'high'] as const).includes(raw.confidence) ? raw.confidence : undefined,
      });
      return (d.description || d.items?.length ? d : null) as any;
    }
    case 'workout': {
      const sport = (SPORTS as readonly string[]).includes(raw.sport) ? (raw.sport as Sport) : 'sonstiges';
      const d = clean<WorkoutData>({
        sport,
        sport_label: str(raw.sport_label),
        session_type: str(raw.session_type) as WorkoutData['session_type'],
        duration_min: num(raw.duration_min),
        rpe: num(raw.rpe),
        focus: str(raw.focus),
        high: str(raw.high),
        low: str(raw.low),
        result: str(raw.result),
        opponent: str(raw.opponent),
        distance_km: num(raw.distance_km),
        avg_pace: str(raw.avg_pace),
        avg_hr: num(raw.avg_hr),
        exercises: Array.isArray(raw.exercises)
          ? raw.exercises
              .filter((e: any) => str(e?.exercise))
              .map((e: any) =>
                clean<StrengthSet>({
                  exercise: str(e.exercise)!,
                  sets: num(e.sets),
                  reps: num(e.reps),
                  weight_kg: num(e.weight_kg),
                  rpe: num(e.rpe),
                }),
              )
          : undefined,
        notes: str(raw.notes),
      });
      return d as any;
    }
    case 'body': {
      const d = clean<BodyData>({
        weight_kg: num(raw.weight_kg),
        body_fat_pct: num(raw.body_fat_pct),
        waist_cm: num(raw.waist_cm),
        bp_systolic: num(raw.bp_systolic),
        bp_diastolic: num(raw.bp_diastolic),
      });
      return (Object.keys(d).length ? d : null) as any;
    }
    case 'wellbeing': {
      const areas = (v: unknown) =>
        Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : undefined;
      const d = clean<WellbeingData>({
        energy: scale(raw.energy),
        mood: scale(raw.mood),
        sleep_quality: scale(raw.sleep_quality),
        stress: scale(raw.stress),
        soreness: scale(raw.soreness),
        soreness_areas: areas(raw.soreness_areas),
        joint_pain: scale(raw.joint_pain),
        joint_pain_areas: areas(raw.joint_pain_areas),
        focus: scale(raw.focus),
        appetite: scale(raw.appetite),
        notes: str(raw.notes),
      });
      return (Object.keys(d).length ? d : null) as any;
    }
    case 'lab': {
      const name = str(raw.name);
      const value = num(raw.value);
      if (!name || value === undefined) return null;
      return clean<LabData>({ name, value, unit: str(raw.unit) }) as any;
    }
    case 'note': {
      const text = str(raw.text);
      if (!text) return null;
      return clean<NoteData>({
        text,
        tags: Array.isArray(raw.tags) ? raw.tags.map(str).filter(Boolean) : undefined,
      }) as any;
    }
    case 'health': {
      const value = num(raw.value);
      if (!(HEALTH_METRICS as readonly string[]).includes(raw.metric) || value === undefined) return null;
      return clean<HealthData>({
        metric: raw.metric,
        value,
        unit: str(raw.unit) ?? '',
        stages: raw.stages,
        activity: str(raw.activity),
        kcal: num(raw.kcal),
      }) as any;
    }
  }
  return null;
}

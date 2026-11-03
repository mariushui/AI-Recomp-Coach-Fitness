
export interface DietData {
  hydration: string;
  supplements: string;
  breakfast: string;
  lunch: string;
  snacks: string;
  dinner: string;
}

export interface MacroAnalysis {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'low' | 'medium' | 'high';
  notes: string;
}

export interface Exercise {
  name: string;
  type: 'strength' | 'cardio';
  weight: string;
  weightType: string;
  sets: number;
  reps: number;
  duration: string;
  rpe: number;
  notes: string;
}

export interface TrainingData {
  trained: boolean;
  type: string;
  rpe: number;
  exercises: Exercise[];
}

export interface BodyMetrics {
  weight: string;
  bodyFat: string;
}

export interface RecoveryData {
  general: number;
  muscleSoreness: number;
  jointPain: number;
  sleepQuality: number;
  // Added missing fields for AI recomposition analysis
  mood: number;
  concentration: number;
  appetite: number;
  emotion: string;
}

export interface PlanningData {
  activity: string;
  duration: string;
  focus: string;
}

export interface DailyCheckinData {
  metrics: BodyMetrics;
  diet: DietData;
  training: TrainingData;
  recovery: RecoveryData;
  planning: PlanningData;
  remarks: string;
}

export interface UserSettings {
  name: string;
  language: Language;
}

export type Language = 'en' | 'de';

export interface Translations {
  [key: string]: {
    [lang in Language]: string;
  };
}

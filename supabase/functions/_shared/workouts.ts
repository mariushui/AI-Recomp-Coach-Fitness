// Trainings aus Apple Health: Sportart zuordnen und mit diktierten Trainings zusammenführen.
// Reines TypeScript, genutzt von der Edge Function health-ingest und der App. Getestet in tests/workouts.test.ts.

import type { Sport, WorkoutData } from './domain.ts';

/** Apple-Aktivität (deutsch oder englisch) auf unsere Sportarten. Alles andere wird "sonstiges" mit Label. */
export function sportFromActivity(label: string): { sport: Sport; sport_label?: string } {
  const l = label.trim().toLowerCase();
  if (!l) return { sport: 'sonstiges' };
  if (/tisch\s*tennis|table\s*tennis/.test(l)) return { sport: 'sonstiges', sport_label: label.trim() };
  if (/tennis/.test(l)) return { sport: 'tennis' };
  if (/running|laufen|jogging|lauf\b/.test(l)) return { sport: 'laufen' };
  if (/martial|kampfsport|capoeira/.test(l)) return { sport: 'capoeira' };
  if (/strength|kraft|core|rumpf|hiit|high intensity|functional|funktionell/.test(l)) return { sport: 'kraft' };
  if (/cycling|radfahren|\brad\b|bike|hand cycling/.test(l)) return { sport: 'rad' };
  if (/swim|schwimm/.test(l)) return { sport: 'schwimmen' };
  if (/yoga|flexib|dehn|stretch|cooldown|abkühl|pilates|mind and body|mobility|tai chi|beweglich/.test(l)) return { sport: 'mobility' };
  return { sport: 'sonstiges', sport_label: label.trim() };
}

/** Gleiche Sportart? Bei "sonstiges" zählt das Label, fehlt es auf einer Seite, gilt es als gleich. */
export function sameSport(a: WorkoutData, b: WorkoutData): boolean {
  if (a.sport !== b.sport) return false;
  if (a.sport !== 'sonstiges') return true;
  if (!a.sport_label || !b.sport_label) return true;
  return a.sport_label.trim().toLowerCase() === b.sport_label.trim().toLowerCase();
}

/**
 * Diktiertes Training plus Apple-Training am selben Tag: das Diktat bleibt Haupteintrag
 * (RPE, Fokus, High/Low, Übungen), Apple liefert Dauer, Kalorien, Distanz und Puls, wo das Diktat nichts hat.
 */
export function mergeWorkoutData(manual: WorkoutData, apple: WorkoutData): WorkoutData {
  const out: WorkoutData = { ...manual };
  if (out.duration_min === undefined && apple.duration_min !== undefined) out.duration_min = apple.duration_min;
  if (out.kcal === undefined && apple.kcal !== undefined) out.kcal = apple.kcal;
  if (out.distance_km === undefined && apple.distance_km !== undefined) out.distance_km = apple.distance_km;
  if (out.avg_hr === undefined && apple.avg_hr !== undefined) out.avg_hr = apple.avg_hr;
  if (out.sport === 'sonstiges' && !out.sport_label && apple.sport_label) out.sport_label = apple.sport_label;
  return out;
}

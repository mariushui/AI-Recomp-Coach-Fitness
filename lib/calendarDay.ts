// Kalender: Ring-Werte je Tag (Ernährung, Training), Tageskalorien-Ziel und die Zusammenfassung eines Tages.
// Reine Funktionen, getestet in tests/calendarDay.test.ts.

import { SPORT_LABEL, type BodyData, type Entry, type WorkoutData } from '../supabase/functions/_shared/domain';
import type { DayStats } from './stats';
import { average } from './stats';
import { estimateActiveToday } from './energy';
import { adjustPct, dailyKcalTarget, hrZoneOf, type Profile } from './profile';
import { bodyweightAt, sessionSets, sessionVolume } from './strength';
import { strainColor } from './recovery';
import { dayKey } from './time';
import type { RingDay } from '../components/RingCalendar';

/** Kalorienziel je Tag: Verbrauch dieses Tages plus Anpassung des Ziel-Modus. Heute mit Schätzung aus Plan, sonst Apple-Wert. */
export function kcalTargetsByDay(
  days: DayStats[],
  entries: Entry[],
  profile: Pick<Profile, 'kcal_goal' | 'energy_mode' | 'kcal_adjust_pct'>,
  now: Date = new Date(),
): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>();
  const todayKey = dayKey(now);
  let lean: number | undefined;
  days.forEach((d, i) => {
    if (typeof d.leanMass === 'number') lean = d.leanMass;
    if (d.day > todayKey) return;
    const avg = average(days.slice(Math.max(0, i - 14), i), 'activeKcal');
    const active = d.day === todayKey ? estimateActiveToday(days.slice(0, i + 1), entries, now).value : d.activeKcal;
    out.set(d.day, dailyKcalTarget(lean, active, avg, profile.kcal_goal, adjustPct(profile)).goal);
  });
  return out;
}

const GREEN = '#ADFF2F';
const AMBER = '#FBBF24';
const ORANGE = '#FF6B00';
const RED = '#FF375F';

/** Protein in Prozent des Ziels: ab 90 % grün, ab 60 % gelb, darunter orange. */
export function proteinRing(day: string, protein: number | undefined, goal: number | null | undefined, today: string): RingDay {
  if (day > today || protein === undefined || !goal) return { day, max: 1, color: '#475569' };
  const r = protein / goal;
  return { day, value: Math.min(1, r), max: 1, text: String(Math.round(r * 100)), color: r >= 0.9 ? GREEN : r >= 0.6 ? AMBER : ORANGE };
}

/** Kalorien in Prozent des Tagesziels: unter 70 % gelb (zu wenig), bis 105 % grün, bis 115 % orange, darüber rot. */
export function kcalRing(day: string, kcal: number | undefined, goal: number | undefined, today: string): RingDay {
  if (day > today || kcal === undefined || !goal) return { day, max: 1, color: '#475569' };
  const r = kcal / goal;
  return { day, value: Math.min(1, r), max: 1, text: String(Math.round(r * 100)), color: r < 0.7 ? AMBER : r <= 1.05 ? GREEN : r <= 1.15 ? ORANGE : RED };
}

/** Belastung des Tages (0 bis 10), gleiche Farben wie im Verlauf. */
export function strainRing(day: string, strain: number | undefined, today: string): RingDay {
  if (day > today || strain === undefined) return { day, max: 10, color: '#475569' };
  return { day, value: strain, max: 10, color: strainColor(strain) };
}

export interface DayWorkout {
  id: string;
  at: string;
  name: string;
  template?: string;
  minutes?: number;
  rpe?: number;
  kcal?: number;
  distanceKm?: number;
  avgHr?: number;
  zone?: number; // Pulszone, wenn Maximalpuls bekannt
  volumeKg?: number; // nur Kraft mit Sätzen
  sets?: number;
  exercises?: number;
  focus?: string;
}

/** Absolvierte Trainings eines Tages mit Zeit, Volumen (Kraft) und Intensität (RPE, Puls). */
export function dayWorkouts(entries: Entry[], day: string, maxHr?: number): DayWorkout[] {
  return entries
    .filter((e): e is Entry<'workout'> => e.kind === 'workout' && dayKey(e.occurred_at) === day)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .map((e) => {
      const w = e.data as WorkoutData;
      const strength = w.sport === 'kraft' && !!w.exercises?.length;
      const volume = strength ? sessionVolume(w, bodyweightAt(entries, e.occurred_at)) : undefined;
      return {
        id: e.id,
        at: e.occurred_at,
        name: w.sport === 'sonstiges' ? (w.sport_label ?? 'Training') : SPORT_LABEL[w.sport],
        template: w.template,
        minutes: w.duration_min,
        rpe: w.rpe,
        kcal: w.kcal,
        distanceKm: w.distance_km,
        avgHr: w.avg_hr,
        zone: hrZoneOf(w.avg_hr, maxHr),
        volumeKg: volume && volume > 0 ? volume : undefined,
        sets: strength ? sessionSets(w) : undefined,
        exercises: strength ? w.exercises!.length : undefined,
        focus: w.focus,
      };
    });
}

export interface BodyValue {
  label: string;
  value: number;
  unit: string;
}

/** Körperwerte eines Tages, nur was vorhanden ist. */
export function bodyValues(s: DayStats | undefined): BodyValue[] {
  if (!s) return [];
  const list: [string, number | undefined, string][] = [
    ['Gewicht', s.weight, 'kg'],
    ['Körperfett', s.bodyFat, '%'],
    ['Fettfreie Masse', s.leanMass, 'kg'],
    ['Muskeln (Waage)', s.muscle, 'kg'],
    ['Taille', s.waist, 'cm'],
    ['Brust', s.chest, 'cm'],
    ['Hüfte', s.hip, 'cm'],
    ['Oberarm', s.arm, 'cm'],
    ['Hautfalten Summe', s.skinfoldSum, 'mm'],
  ];
  return list.filter((x): x is [string, number, string] => typeof x[1] === 'number').map(([label, value, unit]) => ({ label, value, unit }));
}

export type { BodyData };

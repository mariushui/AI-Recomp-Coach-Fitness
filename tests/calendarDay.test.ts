import { describe, it, expect } from 'vitest';
import { bodyValues, dayWorkouts, kcalRing, kcalTargetsByDay, proteinRing, strainRing } from '../lib/calendarDay';
import { microsWeekAverage } from '../lib/micros';
import { microsByDay } from '../lib/micros';

const today = '2026-11-04';
const e = (kind: string, at: string, data: any) => ({ id: kind + at, user_id: 'u', kind, occurred_at: at, source: 'manual', data }) as any;

describe('Ringe im Kalender', () => {
  it('Protein: Prozent des Ziels, Farbe nach Stufe, Zukunft und fehlende Werte leer', () => {
    expect(proteinRing('2026-11-03', 135, 135, today)).toMatchObject({ value: 1, text: '100', color: '#ADFF2F' });
    expect(proteinRing('2026-11-03', 100, 135, today)).toMatchObject({ text: '74', color: '#FBBF24' });
    expect(proteinRing('2026-11-03', 50, 135, today)).toMatchObject({ text: '37', color: '#FF6B00' });
    expect(proteinRing('2026-11-03', 160, 135, today).value).toBe(1); // Ring voll, Text zeigt echte Prozent
    expect(proteinRing('2026-11-03', 160, 135, today).text).toBe('119');
    expect(proteinRing('2026-11-05', 100, 135, today).value).toBeUndefined();
    expect(proteinRing('2026-11-03', undefined, 135, today).value).toBeUndefined();
    expect(proteinRing('2026-11-03', 100, null, today).value).toBeUndefined();
  });
  it('Kalorien: zu wenig gelb, im Ziel grün, darüber orange und rot', () => {
    expect(kcalRing('2026-11-03', 1500, 2600, today).color).toBe('#FBBF24');
    expect(kcalRing('2026-11-03', 2500, 2600, today).color).toBe('#ADFF2F');
    expect(kcalRing('2026-11-03', 2800, 2600, today).color).toBe('#FF6B00');
    expect(kcalRing('2026-11-03', 3200, 2600, today).color).toBe('#FF375F');
  });
  it('Belastung wie im Verlauf', () => {
    expect(strainRing('2026-11-03', 7.4, today)).toMatchObject({ value: 7.4, max: 10, color: '#FF6B00' });
    expect(strainRing('2026-11-03', undefined, today).value).toBeUndefined();
  });
});

describe('Tageskalorien-Ziel', () => {
  it('Verbrauch des Tages plus Anpassung, Magermasse wird weitergetragen', () => {
    const days = [
      { day: '2026-11-01', leanMass: 67.2, activeKcal: 800, entries: 0 },
      { day: '2026-11-02', activeKcal: 1200, entries: 0 },
      { day: '2026-11-05', entries: 0 },
    ] as any;
    const t = kcalTargetsByDay(days, [], { kcal_goal: 2500, energy_mode: 'recomp' }, new Date('2026-11-04T20:00:00+01:00'));
    // Verbrauch 1.822 x 1,1 = 2.004 + aktiv: 800 -> 2.800, 1.200 -> 3.200 (Rundung 50), mit -10 %: 2.500 bzw. 2.900
    expect(t.get('2026-11-01')).toBe(2500);
    expect(t.get('2026-11-02')).toBe(2900);
    expect(t.has('2026-11-05')).toBe(false);
  });
});

describe('Tagesinhalt', () => {
  const entries = [
    e('body', '2026-11-03T07:00:00+01:00', { weight_kg: 86 }),
    e('workout', '2026-11-03T17:00:00+01:00', { sport: 'tennis', duration_min: 90, rpe: 7, avg_hr: 140 }),
    e('workout', '2026-11-03T08:00:00+01:00', { sport: 'kraft', template: 'Push', duration_min: 60, exercises: [{ exercise: 'Bankdrücken', exercise_id: 'bankdruecken', set_list: [{ reps: 10, weight_kg: 60 }, { reps: 10, weight_kg: 60 }, { reps: 15, weight_kg: 40, warmup: true }] }] }),
    e('workout', '2026-11-02T08:00:00+01:00', { sport: 'laufen', duration_min: 40 }),
  ];
  it('Trainings des Tages nach Uhrzeit, Kraft mit Volumen, andere mit Intensität und Zone', () => {
    const w = dayWorkouts(entries, '2026-11-03', 180);
    expect(w.map((x) => x.name)).toEqual(['Krafttraining', 'Tennis']);
    expect(w[0]).toMatchObject({ template: 'Push', minutes: 60, volumeKg: 1200, sets: 2, exercises: 1 });
    expect(w[1]).toMatchObject({ minutes: 90, rpe: 7, avgHr: 140, zone: 3 }); // 140 / 180 = 78 %
    expect(w[1].volumeKg).toBeUndefined();
    expect(dayWorkouts(entries, '2026-11-01')).toEqual([]);
  });
  it('Körperwerte nur, wenn vorhanden', () => {
    expect(bodyValues({ day: 'x', weight: 86, waist: 88, entries: 1 } as any)).toEqual([
      { label: 'Gewicht', value: 86, unit: 'kg' },
      { label: 'Taille', value: 88, unit: 'cm' },
    ]);
    expect(bodyValues({ day: 'x', entries: 0 } as any)).toEqual([]);
    expect(bodyValues(undefined)).toEqual([]);
  });
  it('Mikros: Ø der 7 Tage bis zum Tag', () => {
    const meals = [
      e('meal', '2026-11-03T12:00:00+01:00', { description: 'a', micros: { fiber_g: 20 } }),
      e('meal', '2026-11-02T12:00:00+01:00', { description: 'b', micros: { fiber_g: 10 } }),
      e('meal', '2026-10-20T12:00:00+01:00', { description: 'alt', micros: { fiber_g: 99 } }),
    ];
    const by = microsByDay(meals);
    expect(microsWeekAverage(by, '2026-11-03')).toEqual({ micros: { fiber_g: 15 }, days: 2 });
  });
});

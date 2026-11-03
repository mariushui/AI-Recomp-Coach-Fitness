import { describe, it, expect } from 'vitest';
import { mergeWorkoutData, sameSport, sportFromActivity } from '../supabase/functions/_shared/workouts';
import { parseDistanceKm, parseDurationMin, parseHealthPayload } from '../supabase/functions/_shared/health';

describe('sportFromActivity', () => {
  it('ordnet deutsche und englische Apple-Aktivitäten zu', () => {
    expect(sportFromActivity('Tennis')).toEqual({ sport: 'tennis' });
    expect(sportFromActivity('Laufen')).toEqual({ sport: 'laufen' });
    expect(sportFromActivity('Running')).toEqual({ sport: 'laufen' });
    expect(sportFromActivity('Kampfsport')).toEqual({ sport: 'capoeira' });
    expect(sportFromActivity('Traditionelles Krafttraining')).toEqual({ sport: 'kraft' });
    expect(sportFromActivity('Functional Strength Training')).toEqual({ sport: 'kraft' });
    expect(sportFromActivity('Radfahren')).toEqual({ sport: 'rad' });
    expect(sportFromActivity('Schwimmen')).toEqual({ sport: 'schwimmen' });
    expect(sportFromActivity('Yoga')).toEqual({ sport: 'mobility' });
  });
  it('alles andere wird sonstiges mit Label', () => {
    expect(sportFromActivity('Tischtennis')).toEqual({ sport: 'sonstiges', sport_label: 'Tischtennis' });
    expect(sportFromActivity('Gehen')).toEqual({ sport: 'sonstiges', sport_label: 'Gehen' });
    expect(sportFromActivity('')).toEqual({ sport: 'sonstiges' });
  });
});

describe('mergeWorkoutData', () => {
  it('Diktat bleibt Haupteintrag, Apple füllt Lücken', () => {
    const manual = { sport: 'tennis' as const, rpe: 7, focus: 'Aufschlag', duration_min: 100 };
    const apple = { sport: 'tennis' as const, duration_min: 118, kcal: 640, avg_hr: 132 };
    expect(mergeWorkoutData(manual, apple)).toEqual({ sport: 'tennis', rpe: 7, focus: 'Aufschlag', duration_min: 100, kcal: 640, avg_hr: 132 });
  });
  it('Dauer kommt von Apple, wenn das Diktat keine hat', () => {
    expect(mergeWorkoutData({ sport: 'laufen', rpe: 6 }, { sport: 'laufen', duration_min: 48, distance_km: 8.1 })).toEqual({ sport: 'laufen', rpe: 6, duration_min: 48, distance_km: 8.1 });
  });
  it('sameSport vergleicht Label nur bei sonstiges', () => {
    expect(sameSport({ sport: 'tennis' }, { sport: 'tennis', duration_min: 5 })).toBe(true);
    expect(sameSport({ sport: 'tennis' }, { sport: 'laufen' })).toBe(false);
    expect(sameSport({ sport: 'sonstiges', sport_label: 'Gehen' }, { sport: 'sonstiges', sport_label: 'gehen' })).toBe(true);
    expect(sameSport({ sport: 'sonstiges', sport_label: 'Gehen' }, { sport: 'sonstiges', sport_label: 'Tischtennis' })).toBe(false);
    expect(sameSport({ sport: 'sonstiges' }, { sport: 'sonstiges', sport_label: 'Tischtennis' })).toBe(true);
  });
});

describe('Distanz und Dauer', () => {
  it('liest Distanzen in km, m und Meilen', () => {
    expect(parseDistanceKm('5,23 km')).toBe(5.23);
    expect(parseDistanceKm('5230 m')).toBe(5.23);
    expect(parseDistanceKm('5230')).toBe(5.23);
    expect(parseDistanceKm('8.1')).toBe(8.1);
    expect(parseDistanceKm('3.1 mi')).toBe(4.99);
    expect(parseDistanceKm('')).toBeUndefined();
  });
  it('liest Dauern als Uhrzeit-Text, Sekunden oder Minuten', () => {
    expect(parseDurationMin('1:06:52')).toBe(66.9);
    expect(parseDurationMin('28:09')).toBe(28.2);
    expect(parseDurationMin('3721')).toBe(62);
    expect(parseDurationMin('45 min')).toBe(45);
  });
});

describe('parseHealthPayload mit Trainings', () => {
  it('bildet Trainings mit Sportart, Dauer aus Start und Ende, Kalorien und Distanz', () => {
    const r = parseHealthPayload({
      metrics: {},
      workouts: {
        types: 'Tennis\nLaufen\nGehen',
        starts: '03.11.2026, 18:02\n02.11.2026, 07:10\n01.11.2026, 12:00',
        ends: '03.11.2026, 19:58\n02.11.2026, 07:58\n01.11.2026, 12:30',
        kcal: '640\n410\n90',
        distances: '\n8,1 km\n2,3 km',
        sources: 'Apple Watch\nApple Watch\niPhone',
      },
    });
    expect(r.workouts).toHaveLength(3);
    expect(r.workouts[0]).toEqual({
      day: '2026-11-03',
      occurred_at: '2026-11-03T18:02:00+01:00',
      external_id: 'workout:2026-11-03T18:02:00+01:00',
      data: { sport: 'tennis', session_type: 'training', duration_min: 116, kcal: 640, notes: 'Apple Health: Tennis' },
    });
    expect(r.workouts[1].data).toEqual({ sport: 'laufen', session_type: 'training', duration_min: 48, kcal: 410, distance_km: 8.1, notes: 'Apple Health: Laufen' });
    expect(r.workouts[2].data.sport).toBe('sonstiges');
    expect(r.workouts[2].data.sport_label).toBe('Gehen');
    expect(r.warnings).toEqual([]);
  });
  it('nimmt Kandidat workouts2 und entfernt doppelte Starts', () => {
    const r = parseHealthPayload({
      metrics: {},
      workouts: { types: '', starts: '' },
      workouts2: { types: 'Tennis\nTennis', starts: '03.11.2026, 18:02\n03.11.2026, 18:02', ends: '03.11.2026, 19:00\n03.11.2026, 19:00' },
    });
    expect(r.workouts).toHaveLength(1);
    expect(r.workouts[0].data.duration_min).toBe(58);
  });
  it('verwirft unplausible Dauern und meldet unlesbare Starts', () => {
    const r = parseHealthPayload({
      metrics: {},
      workouts: { types: 'Tennis\nLaufen', starts: '03.11.2026, 18:02\nkaputt', ends: '04.11.2026, 18:02\n' },
    });
    expect(r.workouts).toHaveLength(0);
    expect(r.warnings.length).toBe(2);
  });
});

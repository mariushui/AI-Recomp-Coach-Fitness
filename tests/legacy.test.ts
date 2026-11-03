import { describe, it, expect } from 'vitest';
import { convertLegacyHistory, guessSport } from '../lib/legacy';

describe('convertLegacyHistory', () => {
  it('zerlegt einen alten Tageseintrag', () => {
    const out = convertLegacyHistory([
      {
        date: '1.11.2026',
        timestamp: new Date(2026, 10, 1, 20, 0).getTime(),
        metrics: { weight: '82,3', bodyFat: '17.5' },
        diet: { breakfast: '3 Eier', lunch: '', snacks: '', dinner: 'Lachs, Reis', hydration: '3', supplements: '' },
        training: { trained: true, type: 'Tennis', rpe: 7, exercises: [{ name: 'Tennis Match', type: 'cardio', duration: '90', rpe: 7, notes: 'Aufschlag gut' }] },
        recovery: { general: 8, muscleSoreness: 3, jointPain: 1, sleepQuality: 6, mood: 9, concentration: 5, appetite: 5, emotion: 'zufrieden' },
        planning: { activity: '', duration: '', focus: '' },
        remarks: '',
        macros: { calories: 2300, protein: 160, carbs: 200, fat: 80, confidence: 'medium', notes: '' },
      },
    ]);
    const kinds = out.map((e) => e.kind);
    expect(kinds).toEqual(['body', 'meal', 'workout', 'wellbeing']);
    expect(out[0].data).toEqual({ weight_kg: 82.3, body_fat_pct: 17.5 });
    expect((out[1].data as any).protein_g).toBe(160);
    expect((out[1].data as any).description).toBe('Frühstück: 3 Eier; Abend: Lachs, Reis');
    expect(out[2].data).toMatchObject({ sport: 'tennis', duration_min: 90, rpe: 7 });
    expect(out[3].data).toMatchObject({ energy: 4, soreness: 2, joint_pain: 1, mood: 5, notes: 'zufrieden' });
    expect(out.every((e) => e.external_id?.startsWith('legacy:2026-11-01:'))).toBe(true);
    expect(out[0].occurred_at.startsWith('2026-11-01T20:00:00')).toBe(true);
  });

  it('überspringt unberührte Standard-Slider und leere Tage', () => {
    const out = convertLegacyHistory([
      { date: '2.11.2026', recovery: { general: 5, muscleSoreness: 5, jointPain: 5, sleepQuality: 5, mood: 5, concentration: 5, appetite: 5, emotion: '' }, training: { trained: false, exercises: [] }, diet: {}, metrics: { weight: '', bodyFat: '' } },
    ]);
    expect(out).toEqual([]);
  });

  it('ignoriert Müll', () => {
    expect(convertLegacyHistory(null)).toEqual([]);
    expect(convertLegacyHistory([{ foo: 1 }])).toEqual([]);
  });
});

describe('guessSport', () => {
  it('erkennt die Hauptsportarten', () => {
    expect(guessSport('Tennis Match')).toBe('tennis');
    expect(guessSport('Capoeira Roda')).toBe('capoeira');
    expect(guessSport('Lauf 10k')).toBe('laufen');
    expect(guessSport('Push Day')).toBe('kraft');
    expect(guessSport('Padel')).toBe('sonstiges');
  });
});

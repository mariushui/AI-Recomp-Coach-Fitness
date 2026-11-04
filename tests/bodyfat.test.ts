import { describe, it, expect } from 'vitest';
import { daysSinceMeasurement, jacksonPollock7, skinfoldSum } from '../lib/bodyfat';

const folds = { chest: 12, midaxillary: 15, triceps: 10, subscapular: 16, abdomen: 25, suprailiac: 18, thigh: 14 }; // Summe 110

describe('Jackson-Pollock 7', () => {
  it('Summe nur bei 7 vollständigen Werten', () => {
    expect(skinfoldSum(folds)).toBe(110);
    expect(skinfoldSum({ ...folds, thigh: undefined })).toBeUndefined();
  });
  it('Mann, 45 Jahre, Summe 110 mm: Dichte 1,0602, etwa 16,9 %', () => {
    // 1,112 - 0,00043499*110 + 0,00000055*12100 - 0,00028826*45 = 1,06024; 495/1,06024 - 450 = 16,9
    expect(jacksonPollock7(folds, 45, 'm')).toBe(16.9);
  });
  it('Frau mit gleichen Werten liegt höher', () => {
    expect(jacksonPollock7(folds, 45, 'w')!).toBeGreaterThan(16.9);
  });
  it('ohne Alter kein Ergebnis', () => {
    expect(jacksonPollock7(folds, undefined)).toBeUndefined();
  });
});

describe('Erinnerung', () => {
  const now = new Date('2026-11-20T10:00:00+01:00');
  it('Tage seit der letzten Messung von Umfängen oder Hautfalten', () => {
    const entries = [
      { kind: 'body', occurred_at: '2026-11-01T08:00:00+01:00', data: { weight_kg: 82 } },
      { kind: 'body', occurred_at: '2026-11-04T08:00:00+01:00', data: { waist_cm: 86 } },
    ];
    expect(daysSinceMeasurement(entries, now)).toBe(16);
    expect(daysSinceMeasurement([entries[0]], now)).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { ageFrom, dailyKcalTarget, proteinBasis, suggestedKcalGoal, suggestedMacroGoals, suggestedProteinGoal } from '../lib/profile';

describe('Ziel-Vorschläge', () => {
  it('nimmt die Waagen-Muskelmasse, wenn sie zur fettfreien Masse passt, sonst die fettfreie Masse', () => {
    expect(proteinBasis(62, 67.2)).toEqual({ value: 62, label: 'Muskelmasse laut Waage' });
    expect(proteinBasis(36, 67.2)).toEqual({ value: 67.2, label: 'fettfreie Masse' }); // Skelettmuskel-Lesart
    expect(proteinBasis(undefined, 67.2)?.value).toBe(67.2);
    expect(proteinBasis(62, undefined)?.value).toBe(62);
    expect(proteinBasis(undefined, undefined)).toBeUndefined();
  });
  it('rundet Protein auf 5 g und Kalorien auf 50 kcal', () => {
    expect(suggestedProteinGoal(62)).toBe(125);
    expect(suggestedProteinGoal(67.2)).toBe(135);
    expect(suggestedKcalGoal(67.2, 794)).toBe(2800);
    expect(suggestedKcalGoal(undefined, 794)).toBeUndefined();
  });
  it('rechnet das Alter', () => {
    expect(ageFrom('1989-11-04', new Date('2026-11-03T12:00:00'))).toBe(36);
    expect(ageFrom('1989-11-03', new Date('2026-11-03T12:00:00'))).toBe(37);
    expect(ageFrom('quatsch')).toBeUndefined();
  });

  it('leitet Fett und Kohlenhydrate aus Kalorien und Protein ab', () => {
    expect(suggestedMacroGoals(2500, 135)).toEqual({ carbs: 300, fat: 85 }); // 85 x 9 + 135 x 4 + 300 x 4 = 2505
    expect(suggestedMacroGoals(undefined, 135)).toBeUndefined();
  });

  it('rechnet das Kalorienziel täglich aus Verbrauch, sonst fester Wert', () => {
    expect(dailyKcalTarget(67.2, 880, 600, 2500)).toEqual({ goal: 2900, burn: 2900, dynamic: true }); // heute aktiv 880
    expect(dailyKcalTarget(67.2, undefined, 600, 2500)).toEqual({ goal: 2600, burn: 2600, dynamic: true }); // Schnitt
    expect(dailyKcalTarget(undefined, 880, 600, 2500)).toEqual({ goal: 2500, dynamic: false });
    expect(dailyKcalTarget(undefined, undefined, undefined, null)).toEqual({ goal: undefined, dynamic: false });
  });
});

describe('Ziel-Modus', () => {
  it('Recomposition 10 % unter dem Verbrauch, Massephase 10 % darüber, auf 50 kcal gerundet', async () => {
    const { dailyKcalTarget } = await import('../lib/profile');
    expect(dailyKcalTarget(67.2, 880, 600, 2500, -10)).toEqual({ goal: 2600, burn: 2900, dynamic: true });
    expect(dailyKcalTarget(67.2, 880, 600, 2500, 10)).toEqual({ goal: 3200, burn: 2900, dynamic: true });
  });
  it('eigener Wert schlägt den Standard des Modus', async () => {
    const { adjustPct } = await import('../lib/profile');
    expect(adjustPct({ energy_mode: 'recomp' })).toBe(-10);
    expect(adjustPct({ energy_mode: 'recomp', kcal_adjust_pct: -15 })).toBe(-15);
    expect(adjustPct({ energy_mode: 'abnehmen' })).toBe(-20);
    expect(adjustPct({})).toBe(0);
  });
});

describe('Empfehlung je Ziel-Modus', () => {
  it('Protein, Fett und Kohlenhydrate folgen dem Modus', async () => {
    const { modeGoals } = await import('../lib/profile');
    // 67,5 kg Magermasse, Verbrauch 2900 kcal
    const re = modeGoals({ energy_mode: 'recomp' }, 67.5, 2900);
    expect(re).toMatchObject({ protein: 150, kcal: 2600, proteinPerKg: 2.2, fatPct: 28, pct: -10 });
    expect(re.fat).toBe(80); // 28 % von 2600 kcal = 728 kcal = 81 g, auf 5 gerundet
    expect(re.carbs).toBe(320); // (2600 - 600 kcal Protein - 720 kcal Fett) / 4
    const ab = modeGoals({ energy_mode: 'abnehmen' }, 67.5, 2900);
    expect(ab).toMatchObject({ protein: 160, kcal: 2300, pct: -20 });
    expect(ab.protein!).toBeGreaterThan(re.protein!);
    const ma = modeGoals({ energy_mode: 'masse' }, 67.5, 2900);
    expect(ma).toMatchObject({ protein: 120, kcal: 3200 });
    expect(ma.protein!).toBeLessThan(re.protein!);
  });
  it('ohne Modus wie bisher: 2 g je kg, Fett 30 %, keine Anpassung', async () => {
    const { modeGoals } = await import('../lib/profile');
    expect(modeGoals({}, 67.2, 2900)).toMatchObject({ protein: 135, kcal: 2900, fatPct: 30, pct: 0 });
  });
  it('ohne Masse und Verbrauch keine Zahlen', async () => {
    const { modeGoals } = await import('../lib/profile');
    expect(modeGoals({ energy_mode: 'recomp' }, undefined, undefined)).toMatchObject({ protein: undefined, kcal: undefined, carbs: undefined, fat: undefined });
  });
});

describe('Maximalpuls und Zonen', () => {
  it('eingetragener Wert vor Schätzung, Schätzung nach Tanaka', async () => {
    const { maxHeartRate } = await import('../lib/profile');
    expect(maxHeartRate(190, 45)).toEqual({ value: 190, estimated: false });
    expect(maxHeartRate(null, 45)).toEqual({ value: 177, estimated: true }); // 208 - 31,5 = 176,5
    expect(maxHeartRate(null, undefined)).toBeUndefined();
  });
  it('Zonen als Bereiche und Zone eines Durchschnittspulses', async () => {
    const { hrZoneRanges, hrZoneOf } = await import('../lib/profile');
    const z = hrZoneRanges(180);
    expect(z[1]).toEqual({ zone: 2, name: 'Grundlage, Zone 2', lo: 108, hi: 126 });
    expect(hrZoneOf(120, 180)).toBe(2);
    expect(hrZoneOf(150, 180)).toBe(4);
    expect(hrZoneOf(175, 180)).toBe(5);
    expect(hrZoneOf(80, 180)).toBeUndefined();
    expect(hrZoneOf(undefined, 180)).toBeUndefined();
  });
});

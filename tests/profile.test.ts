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

import { describe, it, expect } from 'vitest';
import { ageFrom, proteinBasis, suggestedKcalGoal, suggestedProteinGoal } from '../lib/profile';

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
});

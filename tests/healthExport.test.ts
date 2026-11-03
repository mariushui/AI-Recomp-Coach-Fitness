import { describe, it, expect } from 'vitest';
import { buildHealthExport, exportSummary, glucoseMgDl, parseReceipt } from '../supabase/functions/_shared/healthExport';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';
const T = '2026-11-03T12:30:00+00:00';

describe('buildHealthExport', () => {
  it('teilt Mahlzeiten in Energie, Protein, Kohlenhydrate und Fett', () => {
    const e = buildHealthExport([
      { id: ID1, kind: 'meal', occurred_at: T, data: { description: 'Bowl', kcal: 612.4, protein_g: 38.26, carbs_g: 55, fat_g: 0 } },
      { id: ID2, kind: 'meal', occurred_at: T, data: { description: 'Kaffee' } },
    ]);
    expect(e.energy).toEqual([{ value: 612, date: T }]);
    expect(e.protein).toEqual([{ value: 38.3, date: T }]);
    expect(e.carbs).toEqual([{ value: 55, date: T }]);
    expect(e.fat).toEqual([]); // 0 g wird nicht geschrieben
    expect(e.meals).toBe(1);
    expect(e.count).toBe(3);
    expect(e.receipt).toBe(`${ID1},${ID2}`); // auch Einträge ohne Werte gelten nach Bestätigung als erledigt
  });

  it('übernimmt nur Blutzucker aus Laborwerten', () => {
    const e = buildHealthExport([
      { id: ID1, kind: 'lab', occurred_at: T, data: { name: 'Nüchtern-Glukose', value: 5.2, unit: 'mmol/L' } },
      { id: ID2, kind: 'lab', occurred_at: T, data: { name: 'HbA1c', value: 5.4, unit: '%' } },
      { id: ID3, kind: 'lab', occurred_at: T, data: { name: 'LDL', value: 110, unit: 'mg/dl' } },
    ]);
    expect(e.glucose).toEqual([{ value: 94, date: T }]);
    expect(e.count).toBe(1);
    expect(exportSummary(e)).toBe('1x Blutzucker für Apple Health bereit.');
  });
});

describe('glucoseMgDl', () => {
  it('rechnet Einheiten um und rät nicht', () => {
    expect(glucoseMgDl({ name: 'Blutzucker', value: 98, unit: 'mg/dL' })).toBe(98);
    expect(glucoseMgDl({ name: 'Glucose', value: 6, unit: 'mmol / l' })).toBe(108);
    expect(glucoseMgDl({ name: 'Blutzucker', value: 98 })).toBeUndefined();
    expect(glucoseMgDl({ name: 'Blutzucker', value: 5000, unit: 'mg/dl' })).toBeUndefined();
  });
});

describe('parseReceipt', () => {
  it('nimmt nur gültige IDs, ohne Dubletten', () => {
    expect(parseReceipt(`${ID1}, ${ID2},${ID1},kaputt`)).toEqual([ID1, ID2]);
    expect(parseReceipt(['x'])).toEqual([]);
    expect(parseReceipt('')).toEqual([]);
  });
});

describe('exportSummary', () => {
  it('meldet leere Läufe', () => {
    expect(exportSummary(buildHealthExport([]))).toBe('Nichts Neues für Apple Health.');
  });
});

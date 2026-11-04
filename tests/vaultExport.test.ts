import { describe, it, expect } from 'vitest';
import { exportMonths, monthFile } from '../lib/vaultExport';

const e = (kind: string, at: string, data: any) => ({ id: kind + at, user_id: 'u', kind, occurred_at: at, source: 'manual', data }) as any;

describe('Vault-Export', () => {
  const entries = [
    e('body', '2026-11-02T07:00:00+01:00', { weight_kg: 86.2, waist_cm: 88 }),
    e('meal', '2026-11-02T08:00:00+01:00', { description: 'Haferflocken mit Beeren', meal_type: 'fruehstueck', protein_g: 30, carbs_g: 70, fat_g: 10, kcal: 500, micros: { fiber_g: 9 } }),
    e('workout', '2026-11-02T18:00:00+01:00', { sport: 'tennis', duration_min: 90, rpe: 7, focus_notes: [{ focus: 'Kick-Aufschlag', note: 'Wurf weiter links' }], high: 'Zwei Asse' }),
    e('workout', '2026-11-03T10:00:00+01:00', { sport: 'kraft', template: 'Push, Trizeps, Squat', exercises: [{ exercise: 'Bankdrücken', set_list: [{ reps: 8, weight_kg: 58 }, { reps: 8, weight_kg: 58 }] }] }),
    e('note', '2026-10-31T12:00:00+01:00', { text: 'Oktober, gehört nicht in den November' }),
  ];
  const f = monthFile(entries, '2026-11', new Date('2026-11-04T15:30:00+01:00'));
  it('Dateiname und Frontmatter', () => {
    expect(f.name).toBe('2026-11.md');
    expect(f.content).toMatch(/^---\ntyp: gesundheit-recomp\nmonat: 2026-11\nstand: 2026-11-04 15:30/);
    expect(f.content).toContain('gewicht_kg_mittel: 86,2');
    expect(f.content).toContain('trainings: 2');
  });
  it('Tagestabelle bis heute, deutsche Zahlen', () => {
    expect(f.content).toContain('| Mo 2.11. | 86,2 |  | 88 |');
    expect(f.content).toContain('| Mi 4.11. |');
    expect(f.content).not.toContain('| Do 5.11. |');
  });
  it('Training mit Sätzen, Fokus und Highlight', () => {
    expect(f.content).toContain('### Mo 2.11. 18:00 · Tennis · 90 min · RPE 7');
    expect(f.content).toContain('- Fokus Kick-Aufschlag: Wurf weiter links');
    expect(f.content).toContain('- Highlight: Zwei Asse');
    expect(f.content).toContain('- Bankdrücken: 2 x 8 @ 58 kg');
  });
  it('Ernährung mit Mahlzeiten und Mikros, nichts aus anderen Monaten', () => {
    expect(f.content).toContain('- 08:00 Frühstück: Haferflocken mit Beeren (30 g P, 70 g KH, 10 g F, 500 kcal)');
    expect(f.content).toContain('Ballaststoffe 9 g');
    expect(f.content).not.toContain('Oktober, gehört nicht');
  });
  it('aktueller und vorheriger Monat', () => {
    expect(exportMonths(new Date('2026-01-15T12:00:00+01:00'))).toEqual(['2025-12', '2026-01']);
  });
});

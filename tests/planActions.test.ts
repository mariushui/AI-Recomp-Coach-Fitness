import { describe, it, expect, vi, beforeEach } from 'vitest';
const calls: any[] = [];
vi.mock('../lib/entries', () => ({
  insertEntries: vi.fn(async (rows: any[]) => void calls.push(['insert', rows])),
  updateEntry: vi.fn(async (id: string, patch: any) => void calls.push(['update', id, patch])),
  deleteEntry: vi.fn(async (id: string) => void calls.push(['delete', id])),
}));
import { removePlan, swapPlanSport, swappedData } from '../lib/planActions';

const plan = (id: string, external_id: string | null, data: any) => ({ id, user_id: 'u', kind: 'plan', occurred_at: '2026-11-07T18:00:00+01:00', source: 'manual', external_id, data }) as any;

describe('Einheit aus "Als Nächstes" ändern', () => {
  beforeEach(() => void (calls.length = 0));
  it('tauschen behält Dauer und Notizen, verwirft Sportart-Eigenes', () => {
    expect(swappedData({ sport: 'tennis', duration_min: 90, rpe: 7, focus: 'Aufschlag', goal: '70 %', notes: 'Halle', sport_label: 'x' } as any, 'schwimmen')).toEqual({ sport: 'schwimmen', duration_min: 90, rpe: 7, notes: 'Halle' });
  });
  it('virtuelle Einheit aus dem Wochenplan: eigener Eintrag mit gleicher Kennung', async () => {
    await swapPlanSport(plan('slot:a:2026-11-07', 'slot:a:2026-11-07', { sport: 'rad', duration_min: 60 }), 'kraft');
    expect(calls).toEqual([['insert', [{ kind: 'plan', occurred_at: '2026-11-07T18:00:00+01:00', data: { sport: 'kraft', duration_min: 60 }, source: 'manual', external_id: 'slot:a:2026-11-07' }]]]);
  });
  it('entfernen: Wochenplan nur für den Tag, Einzeltermin ganz', async () => {
    await removePlan(plan('e1', 'slot:a:2026-11-07', { sport: 'rad' }));
    await removePlan(plan('e2', null, { sport: 'laufen' }));
    expect(calls).toEqual([['update', 'e1', { data: { sport: 'rad', status: 'entfernt' } }], ['delete', 'e2']]);
  });
});

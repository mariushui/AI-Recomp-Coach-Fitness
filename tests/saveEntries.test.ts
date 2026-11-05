import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] };
let mode: 'ok' | 'hang' | 'network' | 'db' = 'ok';
const sent: any[] = [];
vi.mock('../lib/entries', () => ({
  insertEntries: vi.fn(async (rows: any[]) => {
    if (mode === 'hang') return new Promise(() => undefined);
    if (mode === 'network') throw new Error('Load failed');
    if (mode === 'db') throw new Error('new row violates row-level security policy');
    sent.push(...rows);
  }),
}));

const row = (text: string) => ({ kind: 'note', occurred_at: '2026-11-05T08:00:00+01:00', data: { text }, source: 'manual' }) as any;

describe('Sicher speichern', () => {
  beforeEach(() => {
    mode = 'ok';
    sent.length = 0;
    for (const k of Object.keys(store)) delete store[k];
  });
  it('vergibt feste Kennungen je Zeile und lässt vorhandene stehen', async () => {
    const { withIds } = await import('../lib/saveEntries');
    const list = withIds([row('a'), { ...row('b'), external_id: 'kraft:x' }, row('c')]);
    expect(list[0].external_id).toMatch(/^app:.+:0$/);
    expect(list[1].external_id).toBe('kraft:x');
    expect(list[2].external_id).toMatch(/^app:.+:2$/);
    expect(list[0].external_id!.split(':')[1]).toBe(list[2].external_id!.split(':')[1]); // gleiche Charge
  });
  it('mit Netz direkt gespeichert', async () => {
    const { saveEntries } = await import('../lib/saveEntries');
    expect(await saveEntries([row('a')])).toEqual({ queued: false });
    expect(sent).toHaveLength(1);
  });
  it('Netzfehler: in die Warteschlange, mit denselben Kennungen', async () => {
    const { saveEntries } = await import('../lib/saveEntries');
    const { queuedCount } = await import('../lib/offlineQueue');
    mode = 'network';
    expect(await saveEntries([row('a')])).toEqual({ queued: true });
    expect(queuedCount()).toBe(1);
    expect(JSON.parse(store['recomp_offline_queue_v1'])[0].entry.external_id).toMatch(/^app:/);
  });
  it('keine Antwort nach 10 s: Warteschlange statt ewig warten', async () => {
    vi.useFakeTimers();
    const { saveEntries } = await import('../lib/saveEntries');
    mode = 'hang';
    const p = saveEntries([row('a')]);
    await vi.advanceTimersByTimeAsync(10_500);
    vi.useRealTimers();
    expect(await p).toEqual({ queued: true });
  });
  it('Fehler der Datenbank werden weitergegeben, nicht still in die Warteschlange gelegt', async () => {
    const { saveEntries } = await import('../lib/saveEntries');
    mode = 'db';
    await expect(saveEntries([row('a')])).rejects.toThrow('row-level security');
  });
});

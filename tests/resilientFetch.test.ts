import { describe, it, expect, vi } from 'vitest';
import { makeResilientFetch, retryable, READ_TIMEOUT_MS } from '../lib/resilientFetch';

describe('resilientFetch', () => {
  it('erkennt lesende Anfragen und Token-Erneuerung', () => {
    expect(retryable('https://x/rest/v1/entries')).toBe(true);
    expect(retryable('https://x/rest/v1/entries', { method: 'POST' })).toBe(false);
    expect(retryable('https://x/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).toBe(true);
    expect(retryable('https://x/functions/v1/parse-log', { method: 'POST' })).toBe(false);
  });
  it('hängende Anfrage wird abgebrochen und wiederholt', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const base = vi.fn((_u: any, init?: RequestInit) => {
      calls++;
      if (calls === 1) return new Promise<Response>((_, rej) => init!.signal!.addEventListener('abort', () => rej(new Error('abort'))));
      return Promise.resolve(new Response('ok'));
    }) as any;
    const f = makeResilientFetch(base);
    const p = f('https://x/rest/v1/entries');
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 10);
    const res = await p;
    vi.useRealTimers();
    expect(calls).toBe(2);
    expect(await res.text()).toBe('ok');
  });
  it('Schreiben wird nicht wiederholt', async () => {
    const base = vi.fn(() => Promise.reject(new Error('netz'))) as any;
    await expect(makeResilientFetch(base)('https://x/rest/v1/entries', { method: 'POST' })).rejects.toThrow('netz');
    expect(base).toHaveBeenCalledTimes(1);
  });
  it('gibt nach allen Versuchen den Fehler weiter', async () => {
    const base = vi.fn(() => Promise.reject(new Error('netz'))) as any;
    await expect(makeResilientFetch(base)('https://x/rest/v1/entries')).rejects.toThrow('netz');
    expect(base).toHaveBeenCalledTimes(3);
  });
});

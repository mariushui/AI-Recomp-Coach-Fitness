// Fetch mit Zeitlimit und Wiederholung. iOS lässt Verbindungen nach dem Wecken der App oft hängen:
// die Anfrage geht raus, die Antwort kommt nie. Lesende Anfragen (GET, HEAD) und das Erneuern des Tokens
// werden deshalb nach kurzer Zeit abgebrochen und noch einmal gesendet. Schreibende Anfragen bleiben unberührt,
// sie laufen über saveEntries mit eigener Zeitgrenze und fester Kennung.

export const READ_TIMEOUT_MS = 8_000;
export const READ_RETRIES = 2;

const methodOf = (input: RequestInfo | URL, init?: RequestInit) =>
  (init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')).toUpperCase();
const urlOf = (input: RequestInfo | URL) => (typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url);

export function retryable(input: RequestInfo | URL, init?: RequestInit): boolean {
  const m = methodOf(input, init);
  if (m === 'GET' || m === 'HEAD') return true;
  // Token erneuern: Retry innerhalb weniger Sekunden ist sicher (Toleranzfenster des Servers für denselben Refresh-Token)
  return m === 'POST' && /\/auth\/v1\/token\?grant_type=refresh_token/.test(urlOf(input));
}

export function makeResilientFetch(base: typeof fetch = (i, o) => fetch(i, o)) {
  return async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!retryable(input, init)) return base(input, init);
    let lastError: unknown;
    for (let attempt = 0; attempt <= READ_RETRIES; attempt++) {
      const ctrl = new AbortController();
      const outer = init?.signal;
      const onOuterAbort = () => ctrl.abort();
      if (outer) {
        if (outer.aborted) throw new DOMException('Aborted', 'AbortError');
        outer.addEventListener('abort', onOuterAbort);
      }
      const timer = setTimeout(() => ctrl.abort(), READ_TIMEOUT_MS);
      try {
        return await base(input, { ...init, signal: ctrl.signal });
      } catch (e) {
        lastError = e;
        if (outer?.aborted) throw e; // vom Aufrufer abgebrochen, nicht wiederholen
      } finally {
        clearTimeout(timer);
        outer?.removeEventListener('abort', onOuterAbort);
      }
    }
    throw lastError;
  };
}

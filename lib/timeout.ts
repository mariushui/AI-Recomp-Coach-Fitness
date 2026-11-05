// Zeitlimit für eine Anfrage. Hängt sie (Netz wechselt, iOS pausiert die App), bricht das Warten nach ms ab,
// statt die App ewig blockieren zu lassen. Die Anfrage selbst läuft weiter, ihr Ergebnis wird dann ignoriert.
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Zeitüberschreitung, keine Antwort vom Server (timeout)')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

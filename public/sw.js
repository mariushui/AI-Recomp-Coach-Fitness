// Service Worker: hält App, Tailwind und Schriften im Cache, damit die App auch ohne Netz startet (Keller).
// Daten-Anfragen an Supabase laufen nie über den Cache.
const CACHE = 'recomp-v2';

// Beim Installieren die Seite und alles, was sie direkt lädt, in den Speicher legen.
// Sonst fehlen beim ersten Start ohne Netz die Skripte, weil der erste Aufruf noch ohne Service Worker lief.
async function precache() {
  const c = await caches.open(CACHE);
  const res = await fetch('./', { cache: 'no-store' });
  const html = await res.clone().text();
  await c.put('./index.html', res);
  const urls = new Set(['./manifest.webmanifest']);
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const u = m[1];
    if (u.startsWith('data:') || u.startsWith('#')) continue;
    urls.add(u);
  }
  await Promise.all(
    [...urls].map(async (u) => {
      try {
        const abs = new URL(u, self.registration.scope);
        const req = abs.origin === self.location.origin ? new Request(abs) : new Request(abs, { mode: 'no-cors' });
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') await c.put(req, r);
      } catch {
        /* einzelne Datei fehlt: kommt beim nächsten Online-Aufruf */
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache().catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return; // Daten immer live
  // Seite selbst: erst Netz (neueste Version), ohne Netz aus dem Cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true })),
    );
    return;
  }
  // Skripte, Styles, Schriften, Bilder: aus dem Cache, im Hintergrund auffrischen
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});

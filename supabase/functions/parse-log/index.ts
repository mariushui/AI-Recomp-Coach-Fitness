// POST /functions/v1/parse-log
// Body: { text: string, now: ISO-String mit Offset, tz: IANA-Zeitzone, image?: { mime, data (Base64) }, mode?: 'nutrition' }
// Mit image wertet die KI ein Essensfoto aus. Das Foto wird nicht gespeichert.
// Antwort: { entries: ParsedEntry[], questions: string[], model, schema }
// Diagnose (nur angemeldet): GET ?models=1 listet Modelle; ?model=NAME erzwingt eins; ?schema=0|1 schaltet das Antwortschema.
// Secrets: GEMINI_API_KEY (Pflicht), GEMINI_MODELS oder GEMINI_MODEL (Reihenfolge Text), GEMINI_MODELS_IMAGE (Fotos), GEMINI_SCHEMA=1, AI_DAILY_LIMIT.
// Speichert nichts. Die App zeigt das Ergebnis zur Bestätigung und speichert dann selbst.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { RESPONSE_SCHEMA, buildFormatHint, buildNutritionPrompt, buildSystemPrompt, buildUserPrompt, normalizeParseResult } from '../_shared/parse.ts';
import { checkImage, type ImageInput } from '../_shared/image.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
// Reihenfolge der Modelle. Ist eins überlastet (503), begrenzt (429) oder unbekannt (404), kommt das nächste dran.
// Gemessen am 4.11.2026: 3.1-flash-lite 5 s und korrekt, flash-lite-latest 2,7 s (Wochentage unsicher), 3.6-flash 11 s,
// 3-flash-preview 7 s. 3.5, 3.7, 3.8 und flash-latest antworten seit Tagen mit 503.
// GEMINI_MODELS als Secret überschreibt die Liste für Text (kommagetrennt), GEMINI_MODELS_IMAGE die für Fotos.
const parseList = (v: string | undefined) => (v ?? '').split(',').map((m) => m.trim()).filter(Boolean);
const TEXT_MODELS = parseList(Deno.env.get('GEMINI_MODELS') ?? Deno.env.get('GEMINI_MODEL'));
const GEMINI_MODELS = TEXT_MODELS.length ? TEXT_MODELS : ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash', 'gemini-3-flash-preview'];
// Fotos: Mengen schätzen braucht das größere Modell, die Lite-Modelle sind Ersatz.
const IMAGE_LIST = parseList(Deno.env.get('GEMINI_MODELS_IMAGE'));
const GEMINI_MODELS_IMAGE = IMAGE_LIST.length ? IMAGE_LIST : ['gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '60');
// Strenges Antwortschema an Gemini schicken? Manche Modelle füllen damit Textfelder mit Unsinn. GEMINI_SCHEMA=1 schaltet es ein.
const USE_SCHEMA_DEFAULT = Deno.env.get('GEMINI_SCHEMA') === '1';
const MAX_CHARS = 4000;
// Das iPhone bricht fetch nach etwa 60 s ab ("Failed to send a request to the Edge Function"). Deshalb bleibt die ganze
// Kette unter 55 s, und nach HEDGE_MS ohne Antwort läuft parallel das nächste Modell an. Die erste Antwort gewinnt.
const GEMINI_TIMEOUT_MS = 25_000; // je Modell
const TOTAL_BUDGET_MS = 55_000; // für die ganze Kette
const HEDGE_MS = 6_000;
const BUSY = 'Die KI ist gerade überlastet. Versuch es in ein paar Minuten nochmal.';
// Merkt sich das zuletzt funktionierende Ersatzmodell, solange die Function warm ist. Spart die Fehlversuche an überlasteten Modellen.
const PREFER_MS = 15 * 60_000;
let preferred: { model: string; until: number } | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const isModelList = req.method === 'GET' && new URL(req.url).searchParams.get('models') === '1';
  if (req.method !== 'POST' && !isModelList) return json({ error: 'Nur POST' }, 405);
  if (!GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY fehlt auf dem Server' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Nicht angemeldet' }, 401);

  // Diagnose: GET ?models=1 zeigt, welche Modelle der Key nutzen darf (nur angemeldet).
  if (isModelList) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    });
    if (!r.ok) return json({ error: `Modell-Liste: Status ${r.status}`, detail: await r.text() }, 502);
    const list = await r.json();
    const models = (list.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => (m.name as string).replace('models/', ''));
    return json({ configured: GEMINI_MODELS, configuredImage: GEMINI_MODELS_IMAGE, available: models });
  }

  let body: { text?: string; now?: string; tz?: string; image?: unknown; mode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ungültiges JSON' }, 400);
  }
  const text = (body.text ?? '').trim();
  let image: ImageInput | null = null;
  if (body.image != null) {
    const check = checkImage(body.image);
    if (!check.ok) return json({ error: check.error }, 400);
    image = check.image;
  }
  if (!text && !image) return json({ error: 'Kein Text und kein Foto' }, 400);
  if (text.length > MAX_CHARS) return json({ error: `Text zu lang (max. ${MAX_CHARS} Zeichen)` }, 400);
  const now = body.now ?? new Date().toISOString();
  const tz = body.tz ?? 'Europe/Berlin';

  const { data: allowed, error: quotaError } = await supabase.rpc('consume_ai_quota', { p_limit: DAILY_LIMIT });
  if (quotaError) return json({ error: 'Kontingent-Prüfung fehlgeschlagen' }, 500);
  if (!allowed) return json({ error: `Tageslimit von ${DAILY_LIMIT} KI-Anfragen erreicht` }, 429);

  const schemaParam = new URL(req.url).searchParams.get('schema');
  const useSchema = schemaParam === null ? USE_SCHEMA_DEFAULT : schemaParam === '1';
  const payload = JSON.stringify({
    // mode=nutrition: nur Nährwerte einer Mahlzeit (Neuberechnung), kurzer Prompt mit eigenem Format
    systemInstruction: {
      parts: [{ text: body.mode === 'nutrition' && !image ? buildNutritionPrompt() : buildSystemPrompt() + (useSchema ? '' : '\n\n' + buildFormatHint()) }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          ...(image ? [{ inlineData: { mimeType: image.mime, data: image.data } }] : []),
          { text: buildUserPrompt(text, now, tz, image !== null) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      ...(useSchema ? { responseSchema: RESPONSE_SCHEMA } : {}),
    },
  });

  // Diagnose: ?model=NAME erzwingt ein Modell (nur angemeldet), zum Vergleichen der Qualität.
  const forced = new URL(req.url).searchParams.get('model');
  if (forced && !/^[A-Za-z0-9._-]{1,80}$/.test(forced)) return json({ error: 'Ungültiger Modellname' }, 400);
  const chain = image ? GEMINI_MODELS_IMAGE : GEMINI_MODELS;
  const remembered = preferred && preferred.until > Date.now() && chain.includes(preferred.model) ? preferred.model : null;
  const models = forced ? [forced] : remembered ? [remembered, ...chain.filter((m) => m !== remembered)] : chain;
  const outcome = await callWithHedging(models, payload);
  if (outcome.fatal) return outcome.fatal;
  const res = outcome.res;
  const used = outcome.used ?? '';
  if (!res) return json({ error: outcome.lastStatus === 404 ? 'Kein passendes KI-Modell gefunden' : BUSY }, 503);
  if (used !== chain[0]) {
    console.log('Gemini fallback', used);
    // Frist nur beim Ausweichen setzen, nicht verlängern: nach 15 Minuten kommt das Hauptmodell wieder zuerst dran.
    if (!forced && preferred?.model !== used) preferred = { model: used, until: Date.now() + PREFER_MS };
  } else {
    preferred = null;
  }
  const out = await res.json();
  const raw = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'KI-Antwort war kein gültiges JSON' }, 502);
  }
  return json({ ...normalizeParseResult(parsed, now), model: used, schema: useSchema });
});

interface Outcome {
  res?: Response;
  used?: string;
  lastStatus: number;
  fatal?: Response;
}

/**
 * Fragt die ersten zwei Modelle gleichzeitig an, danach der Reihe nach. Antwortet eins nach HEDGE_MS noch nicht, startet parallel das nächste.
 * Die erste brauchbare Antwort gewinnt, alle anderen Anfragen werden abgebrochen.
 * 404, 429 und 503 gelten als "nächstes Modell", andere Fehler brechen sofort ab (fatal).
 */
function callWithHedging(models: string[], payload: string): Promise<Outcome> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const controllers: AbortController[] = [];
  const timers: number[] = [];
  let lastStatus = 0;
  let settled = false;
  let pending = 0;
  let next = 0;
  return new Promise<Outcome>((resolve) => {
    // keep = Anfrage des Gewinners, deren Antwort noch gelesen wird. Alle anderen werden abgebrochen.
    const finish = (o: Outcome, keep?: AbortController) => {
      if (settled) return;
      settled = true;
      timers.forEach((t) => clearTimeout(t));
      controllers.filter((c) => c !== keep).forEach((c) => c.abort());
      resolve(o);
    };
    const maybeDone = () => {
      if (settled) return;
      const left = deadline - Date.now();
      if (pending === 0 && (next >= models.length || left < 3_000)) finish({ lastStatus });
    };
    const startNext = () => {
      if (settled || next >= models.length) return;
      const left = deadline - Date.now();
      if (left < 3_000) return;
      const model = models[next++];
      const ac = new AbortController();
      controllers.push(ac);
      pending++;
      const kill = setTimeout(() => ac.abort(), Math.min(GEMINI_TIMEOUT_MS, left));
      const hedge = setTimeout(startNext, HEDGE_MS);
      timers.push(kill, hedge);
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: ac.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: payload,
      })
        .then(async (r) => {
          if (r.ok) {
            finish({ res: r, used: model, lastStatus }, ac);
            return;
          }
          lastStatus = r.status;
          console.error('Gemini error', model, r.status, (await r.text()).slice(0, 300));
          if (![404, 429, 503].includes(r.status)) finish({ lastStatus, fatal: json({ error: `KI-Dienst antwortet mit Status ${r.status}` }, 502) });
        })
        .catch((e) => {
          if (!settled) console.error('Gemini timeout or network error', model, String(e).slice(0, 120));
        })
        .finally(() => {
          clearTimeout(kill);
          clearTimeout(hedge);
          pending--;
          if (!settled) {
            startNext();
            maybeDone();
          }
        });
    };
    timers.push(setTimeout(() => finish({ lastStatus }), TOTAL_BUDGET_MS));
    // Zwei Modelle gleich zu Beginn: Ist eins überlastet, antwortet das andere, ohne 6 s Wartezeit
    startNext();
    if (models.length > 1) startNext();
  });
}

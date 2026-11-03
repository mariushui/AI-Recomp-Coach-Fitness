// POST /functions/v1/parse-log
// Body: { text: string, now: ISO-String mit Offset, tz: IANA-Zeitzone, image?: { mime, data (Base64) } }
// Mit image wertet die KI ein Essensfoto aus. Das Foto wird nicht gespeichert.
// Antwort: { entries: ParsedEntry[], questions: string[] }
// Speichert nichts. Die App zeigt das Ergebnis zur Bestätigung und speichert dann selbst.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { RESPONSE_SCHEMA, buildFormatHint, buildSystemPrompt, buildUserPrompt, normalizeParseResult } from '../_shared/parse.ts';
import { checkImage, type ImageInput } from '../_shared/image.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
// Reihenfolge der Modelle. Ist eins überlastet (503), begrenzt (429) oder unbekannt (404), kommt das nächste dran.
// GEMINI_MODELS als Secret überschreibt die Liste (kommagetrennt), GEMINI_MODEL nur das erste.
const GEMINI_MODELS = (
  Deno.env.get('GEMINI_MODELS') ??
  `${Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'},gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash`
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '60');
// Strenges Antwortschema an Gemini schicken? Manche Modelle füllen damit Textfelder mit Unsinn. GEMINI_SCHEMA=1 schaltet es ein.
const USE_SCHEMA_DEFAULT = Deno.env.get('GEMINI_SCHEMA') === '1';
const MAX_CHARS = 4000;
// Unter dem Zeitlimit der Edge Function (150 s), damit die App eine klare Meldung bekommt statt eines Abbruchs.
const GEMINI_TIMEOUT_MS = 30_000; // je Modell, bei 4 Modellen bleibt es unter dem Limit der Function
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
    return json({ configured: GEMINI_MODELS, available: models });
  }

  let body: { text?: string; now?: string; tz?: string; image?: unknown };
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
    systemInstruction: { parts: [{ text: buildSystemPrompt() + (useSchema ? '' : '\n\n' + buildFormatHint()) }] },
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
  const remembered = preferred && preferred.until > Date.now() ? preferred.model : null;
  const models = forced ? [forced] : remembered ? [remembered, ...GEMINI_MODELS.filter((m) => m !== remembered)] : GEMINI_MODELS;
  let res: Response | null = null;
  let lastStatus = 0;
  let used = '';
  for (const model of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: payload,
      });
      if (r.ok) {
        res = r;
        used = model;
        if (model !== GEMINI_MODELS[0]) {
          console.log('Gemini fallback', model);
          if (!forced) preferred = { model, until: Date.now() + PREFER_MS };
        } else {
          preferred = null;
        }
        break;
      }
      lastStatus = r.status;
      console.error('Gemini error', model, r.status, (await r.text()).slice(0, 300));
      if (![404, 429, 503].includes(r.status))
        return json({ error: `KI-Dienst antwortet mit Status ${r.status}` }, 502);
    } catch (e) {
      console.error('Gemini timeout or network error', model, e);
      lastStatus = 0;
    }
  }
  if (!res) return json({ error: lastStatus === 404 ? 'Kein passendes KI-Modell gefunden' : BUSY }, 503);
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

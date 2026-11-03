// POST /functions/v1/parse-log
// Body: { text: string, now: ISO-String mit Offset, tz: IANA-Zeitzone, image?: { mime, data (Base64) } }
// Mit image wertet die KI ein Essensfoto aus. Das Foto wird nicht gespeichert.
// Antwort: { entries: ParsedEntry[], questions: string[] }
// Speichert nichts. Die App zeigt das Ergebnis zur Bestätigung und speichert dann selbst.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { RESPONSE_SCHEMA, buildSystemPrompt, buildUserPrompt, normalizeParseResult } from '../_shared/parse.ts';
import { checkImage, type ImageInput } from '../_shared/image.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '60');
const MAX_CHARS = 4000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
  if (!GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY fehlt auf dem Server' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Nicht angemeldet' }, 401);

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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
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
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  );
  if (!res.ok) {
    console.error('Gemini error', res.status, await res.text());
    return json({ error: `KI-Dienst antwortet mit Status ${res.status}` }, 502);
  }
  const out = await res.json();
  const raw = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'KI-Antwort war kein gültiges JSON' }, 502);
  }
  return json(normalizeParseResult(parsed, now));
});

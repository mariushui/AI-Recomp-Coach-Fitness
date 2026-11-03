// POST /functions/v1/health-ingest
// Aufgerufen vom iOS-Kurzbefehl. Authentifizierung über den persönlichen Token
// im Header "x-recomp-token" (in der App unter Einstellungen erzeugt).
// ?dry=1 zeigt nur, was erkannt wurde, ohne zu speichern.
// Mehrfaches Senden derselben Tage ist gewollt: Werte werden pro Kennzahl und Tag überschrieben.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, sha256Hex } from '../_shared/http.ts';
import { parseHealthPayload } from '../_shared/health.ts';

// Fehler tragen auch ein summary, damit der Kurzbefehl den Grund als Mitteilung zeigt.
const fail = (msg: string, status: number) => json({ error: msg, summary: 'Fehler: ' + msg }, status);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Nur POST', 405);

  const token = (req.headers.get('x-recomp-token') ?? '').trim();
  if (!token.startsWith('rc_')) return fail('Token fehlt oder ist ungültig', 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const hash = await sha256Hex(token);
  const { data: tok, error: tokError } = await admin
    .from('ingest_tokens')
    .select('user_id')
    .eq('token_hash', hash)
    .maybeSingle();
  if (tokError) return fail('Datenbankfehler', 500);
  if (!tok) return fail('Token unbekannt. In der App neu erzeugen.', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Ungültiges JSON. Im Kurzbefehl "Anfragetext: JSON" wählen.', 400);
  }

  const { rows, warnings } = parseHealthPayload(body);
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  if (dry) return json({ ok: true, dry: true, rows, warnings });

  if (rows.length > 0) {
    const { error } = await admin.from('entries').upsert(
      rows.map((r) => ({
        user_id: tok.user_id,
        kind: 'health',
        source: 'health',
        occurred_at: r.occurred_at,
        external_id: r.external_id,
        data: r.data,
      })),
      { onConflict: 'user_id,external_id' },
    );
    if (error) {
      console.error(error);
      return fail('Speichern fehlgeschlagen', 500);
    }
  }
  await admin.from('ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', tok.user_id);

  const days = [...new Set(rows.map((r) => r.day))].sort();
  const summary =
    rows.length === 0
      ? 'Keine Health-Werte erkannt.'
      : `${rows.length} Werte für ${days.length} Tag(e) gespeichert (${days[0]} bis ${days[days.length - 1]}).`;
  return json({ ok: true, saved: rows.length, days, warnings, summary });
});

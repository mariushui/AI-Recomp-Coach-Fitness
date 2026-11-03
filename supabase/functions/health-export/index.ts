// POST /functions/v1/health-export
// Rückweg nach Apple Health. Aufgerufen vom iOS-Kurzbefehl, Authentifizierung wie health-ingest über "x-recomp-token".
//
// Schritt 1, Body {}: liefert noch nicht übertragene Mahlzeiten und Blutzuckerwerte der letzten 30 Tage
//   als Listen energy, protein, carbs, fat, glucose ({ value, date }) und eine Quittung "receipt".
// Schritt 2, Body { confirm: receipt }: nachdem der Kurzbefehl die Werte geschrieben hat. Erst dann gelten sie als übertragen.
// Fällt Schritt 2 aus, kommen dieselben Werte beim nächsten Lauf erneut.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, sha256Hex } from '../_shared/http.ts';
import { buildHealthExport, exportSummary, parseReceipt } from '../_shared/healthExport.ts';

const LOOKBACK_DAYS = 30;
const MAX_ROWS = 200;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  const token = (req.headers.get('x-recomp-token') ?? '').trim();
  if (!token.startsWith('rc_')) return json({ error: 'Token fehlt oder ist ungültig' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: tok, error: tokError } = await admin
    .from('ingest_tokens')
    .select('user_id')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle();
  if (tokError) return json({ error: 'Datenbankfehler' }, 500);
  if (!tok) return json({ error: 'Token unbekannt. In der App neu erzeugen.' }, 401);

  let body: { confirm?: unknown } = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return json({ error: 'Ungültiges JSON' }, 400);
  }

  if (body.confirm !== undefined) {
    const ids = parseReceipt(body.confirm);
    if (ids.length === 0) return json({ ok: true, confirmed: 0, summary: 'Nichts zu bestätigen.' });
    const { data, error } = await admin
      .from('entries')
      .update({ health_exported_at: new Date().toISOString() })
      .eq('user_id', tok.user_id)
      .in('id', ids)
      .is('health_exported_at', null)
      .select('id');
    if (error) {
      console.error(error);
      return json({ error: 'Bestätigen fehlgeschlagen' }, 500);
    }
    return json({ ok: true, confirmed: data?.length ?? 0 });
  }

  const now = Date.now();
  const { data: rows, error } = await admin
    .from('entries')
    .select('id, kind, occurred_at, data')
    .eq('user_id', tok.user_id)
    .in('kind', ['meal', 'lab'])
    .neq('source', 'health')
    .is('health_exported_at', null)
    .gte('occurred_at', new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString())
    .lte('occurred_at', new Date(now + 3_600_000).toISOString())
    .order('occurred_at', { ascending: true })
    .limit(MAX_ROWS);
  if (error) {
    console.error(error);
    return json({ error: 'Datenbankfehler' }, 500);
  }
  const out = buildHealthExport(rows ?? []);
  return json({ ok: true, ...out, summary: exportSummary(out) });
});

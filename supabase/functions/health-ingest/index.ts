// POST /functions/v1/health-ingest
// Aufgerufen vom iOS-Kurzbefehl. Authentifizierung über den persönlichen Token
// im Header "x-recomp-token" (in der App unter Einstellungen erzeugt).
// ?dry=1 zeigt nur, was erkannt wurde, ohne zu speichern.
// Mehrfaches Senden derselben Tage ist gewollt: Werte werden pro Kennzahl und Tag überschrieben.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, sha256Hex } from '../_shared/http.ts';
import { parseHealthPayload, type WorkoutRow } from '../_shared/health.ts';
import { mergeWorkoutData, sameSport } from '../_shared/workouts.ts';
import type { WorkoutData } from '../_shared/domain.ts';

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

  const { rows, workouts, warnings } = parseHealthPayload(body);
  // Diagnose: nur Struktur und Längen, keine Werte.
  const shape = (v: unknown): unknown =>
    Array.isArray(v) ? `array(${v.length})` : typeof v === 'string' ? `string(${v.length})` : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v;
  const sampleDate = String((body as any)?.metrics?.weight?.dates ?? '').split('\n')[0].slice(0, 40);
  console.log('ingest shape', JSON.stringify(shape(body)), 'rows', rows.length, 'workouts', workouts.length, 'firstDate', JSON.stringify(sampleDate), 'warnings', JSON.stringify(warnings));
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  if (dry) return json({ ok: true, dry: true, rows, workouts, warnings });

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
  let savedWorkouts = 0;
  for (const w of workouts) {
    try {
      await upsertWorkout(admin, tok.user_id, w);
      savedWorkouts++;
    } catch (e) {
      console.error('workout', w.external_id, e);
      warnings.push(`Training ${w.occurred_at} konnte nicht gespeichert werden.`);
    }
  }
  await admin.from('ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', tok.user_id);

  const days = [...new Set([...rows.map((r) => r.day), ...workouts.map((w) => w.day)])].sort();
  const parts: string[] = [];
  if (rows.length) parts.push(`${rows.length} Werte`);
  if (savedWorkouts) parts.push(`${savedWorkouts} Training(s)`);
  // Je Bereich, was ankam, damit ein ausgefallener Block in der Mitteilung sofort auffällt
  const LABEL: Record<string, string> = { weight: 'Gewicht', body_fat: 'KFA', resting_hr: 'Ruhepuls', hrv: 'HRV', sleep: 'Schlaf', steps: 'Schritte', active_kcal: 'kcal', exercise_min: 'Trainingsmin.', vo2max: 'VO2max', spo2: 'SpO2', hr_recovery: 'HRR' };
  const sent = Object.keys((body as any)?.metrics ?? {});
  const counts = sent.map((m) => `${LABEL[m] ?? m} ${rows.filter((r) => r.metric === m).length}`);
  if ((body as any)?.workouts || (body as any)?.workouts2) counts.push(`Trainings ${savedWorkouts}`);
  const detail = counts.length ? ` ${counts.join(', ')}.` : '';
  const hint = warnings.length ? ` ${warnings.length} Hinweis(e): ${warnings[0]}` : '';
  const summary =
    parts.length === 0
      ? `Keine Health-Werte erkannt.${detail}${hint}`
      : `${parts.join(' und ')} für ${days.length} Tag(e) gespeichert.${detail}${hint}`;
  return json({ ok: true, saved: rows.length, savedWorkouts, days, warnings, summary });
});

/**
 * Training aus Apple Health speichern. Reihenfolge:
 * 1. Gibt es den Eintrag schon (external_id)? Dann Apple-Felder auffrischen, diktierte Felder bleiben.
 * 2. Gibt es am selben Tag ein diktiertes Training derselben Sportart? Dann dort Dauer, Kalorien, Distanz ergänzen
 *    und die external_id anhängen, damit es beim nächsten Lauf unter 1. landet.
 * 3. Sonst neuer Eintrag kind = workout, source = health.
 */
async function upsertWorkout(admin: ReturnType<typeof createClient>, userId: string, w: WorkoutRow) {
  const { data: existing } = await admin
    .from('entries')
    .select('id, source, data')
    .eq('user_id', userId)
    .eq('external_id', w.external_id)
    .maybeSingle();
  if (existing) {
    const data = existing.source === 'health' ? w.data : mergeWorkoutData(existing.data as WorkoutData, w.data);
    const { error } = await admin.from('entries').update({ data, occurred_at: w.occurred_at }).eq('id', existing.id);
    if (error) throw error;
    return;
  }
  const start = new Date(w.occurred_at).getTime();
  const { data: candidates } = await admin
    .from('entries')
    .select('id, source, data, occurred_at, external_id')
    .eq('user_id', userId)
    .eq('kind', 'workout')
    .neq('source', 'health')
    .gte('occurred_at', new Date(start - 36 * 3600_000).toISOString())
    .lte('occurred_at', new Date(start + 36 * 3600_000).toISOString());
  const manual = (candidates ?? []).find(
    (c: any) => !c.external_id && c.occurred_at.slice(0, 10) === w.occurred_at.slice(0, 10) && sameSport(c.data as WorkoutData, w.data),
  );
  if (manual) {
    const { error } = await admin
      .from('entries')
      .update({ data: mergeWorkoutData(manual.data as WorkoutData, w.data), external_id: w.external_id })
      .eq('id', manual.id);
    if (error) throw error;
    return;
  }
  const { error } = await admin.from('entries').insert({
    user_id: userId,
    kind: 'workout',
    source: 'health',
    occurred_at: w.occurred_at,
    external_id: w.external_id,
    data: w.data,
  });
  if (error) throw error;
}

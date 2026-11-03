# Datenmodell

Quelle der Wahrheit im Code: `supabase/functions/_shared/domain.ts`. Schema: `supabase/migrations/`.

## Tabelle `entries`

| Spalte | Typ | Bedeutung |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | Besitzer, per RLS geschützt |
| `kind` | text | Art des Eintrags, siehe unten |
| `occurred_at` | timestamptz | Wann es passiert ist (nicht wann gespeichert) |
| `source` | text | `voice`, `text`, `manual`, `health`, `import` |
| `data` | jsonb | Inhalt je nach Art |
| `raw_text` | text | Original-Diktat, falls per Sprache oder Text erfasst |
| `external_id` | text | Eindeutiger Schlüssel für Health-Sync und Import, verhindert Dubletten |

## Arten und Felder

**meal** (Mahlzeit): `description`, `meal_type` (fruehstueck, mittag, abend, snack, shake), `items[]` (name, amount), `protein_g`, `kcal`, `carbs_g`, `fat_g`, `confidence` (low, medium, high).
Makros sind KI-Schätzungen. Protein ist der wichtigste Wert.

**workout** (Training): `sport` (tennis, laufen, capoeira, kraft, rad, schwimmen, mobility, sonstiges), `sport_label`, `session_type` (training, stunde, match, wettkampf, frei), `duration_min`, `rpe` (1-10).
Technik-Sport (Tennis, Capoeira): `focus`, `high`, `low`, `result`, `opponent`.
Ausdauer: `distance_km`, `avg_pace`, `avg_hr`.
Kraft: `exercises[]` mit `exercise`, `sets`, `reps`, `weight_kg`, `rpe`.

**body** (Körperwerte, manuell): `weight_kg`, `body_fat_pct`, `waist_cm`, `bp_systolic`, `bp_diastolic`.

**wellbeing** (Befinden), Skalen 1 bis 5: `energy`, `mood`, `sleep_quality`, `stress`, `soreness`, `joint_pain`, `focus`, `appetite`. Dazu `soreness_areas[]`, `joint_pain_areas[]`, `notes`.
Bei `stress`, `soreness` und `joint_pain` heißt 5 „stark“. Sonst heißt 5 „gut“.

**lab** (Laborwert): `name`, `value`, `unit`. Ein Eintrag pro Wert.

**note**: `text`, `tags[]`.

**health** (aus Apple Health, ein Eintrag pro Kennzahl und Tag): `metric` (weight, body_fat, resting_hr, hrv, vo2max, sleep), `value`, `unit`, bei Schlaf `stages` in Minuten.
`external_id` = `<metric>:<YYYY-MM-DD>`. Ein neuer Sync überschreibt den Tageswert.

## Regeln für Tageswerte (Auswertung)

- Gewicht und KFA: manueller Eintrag schlägt Apple Health. Bei Health zählt die erste Messung des Tages.
- HRV: Mittelwert des Tages. Ruhepuls und VO2max: letzter Wert.
- Schlaf: zählt zur Nacht, in der er endet. Überlappende Quellen (Watch und App) werden nicht doppelt gezählt.
- Gewicht wird als 7-Tage-Schnitt gezeigt, weil Tageswerte um 1 bis 2 kg schwanken.

## Bewusst noch nicht drin

Steps und aktive Kalorien (doppelte Zählung von iPhone und Watch), Workouts aus Health (kommen per Sprache), Recovery-Score (Phase 2).

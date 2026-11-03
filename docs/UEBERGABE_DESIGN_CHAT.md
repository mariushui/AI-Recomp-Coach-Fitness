# Übergabe aus dem Design-Chat (3.11.2026)

Alles ist committet und gepusht. In Supabase habe ich nichts deployt: keine Migration, keine Edge Function, kein Secret.

## Meine Branches

Kette: `claude/essensfoto` (alter Stand 826de13) → `claude/daten-erweiterung` → `claude/daten-ringe` → `claude/design`

| Branch | Stand | Inhalt | Bereich |
|---|---|---|---|
| `claude/daten-erweiterung` | 0889604 | health-ingest: Schritte (pro Tag größte Quelle, gegen Doppelzählung iPhone/Watch) und Blutsauerstoff (Tagesmittel %). Migration `20261103160000_profile_height.sql` (profiles.height_cm). lib/stats: Kohlenhydrate, Fett, Magermasse, Fettmasse, Wochenmittel, BMI. lib/profile. Doku Kurzbefehl | lib, supabase |
| `claude/daten-ringe` | 71af776 | health-ingest: aktive Kalorien und Trainingsminuten (Ringe Bewegen, Trainieren, je größte Quelle), Cardio-Erholung `hr_recovery`. lib/stats entsprechend. Doku Kurzbefehl | lib, supabase |
| `claude/design` | d7644b4 | Umriss-Symbole statt Emojis (components/icons.tsx, iconPaths.ts). Verlauf neu: Diagramm-Menü, gemeinsame Zeitachse (Woche Mo bis So und 30 Tage täglich, 90 Tage und Jahr wöchentlich, components/trendData.ts), Gewicht mit Fett kg, Magermasse, KFA, BMI, Ernährung mit allen Makros, Training mit Plan als Schatten je Sportart, Aktivität (Schritte, Ringe), Herz (Ruhepuls, HRV, HRR), Schlaf, VO2max und SpO2. Einstellungen: Körpergröße, Tab heißt "Einstellungen" | components, App.tsx |
| `claude/symbole` | efa4760 | überholt, steckt komplett in `claude/design`. Kann gelöscht werden | |

Nicht von mir: `claude/health-export` (a152aa4), die neuen Commits auf `claude/trainingsplan` (Gemini-Modell, Zeitgrenze) und auf `claude/essensfoto` (jetzt 64dcc88).

## Was zu tun ist

1. `claude/daten-erweiterung` basiert auf dem alten essensfoto-Stand 826de13. Auf den neuen Stand von `claude/essensfoto` bringen (Merge oder Rebase), dann `daten-ringe` und `design` nachziehen. Mögliche Konflikte: `supabase/functions/_shared/domain.ts`, `health.ts`, `lib/stats.ts`, `docs/KURZBEFEHL.md`, falls dort parallel geändert wurde. `claude/health-export` fasst vermutlich ähnliche Dateien an.
2. Migration `profile_height` einspielen, `health-ingest` neu deployen.
3. Kurzbefehl am iPhone um die neuen Bausteine erweitern (Blutsauerstoff, Schritte, Bewegen, Trainieren, Cardio-Erholung), siehe docs/KURZBEFEHL.md.

## Getestet

- 64 Unit-Tests grün auf `claude/design` (Health-Parser inkl. Schritte, SpO2, Ringe, HRR; Statistik inkl. Makros, Fettmasse, BMI; Zeitachse und Plan-Schatten).
- `tsc --noEmit` und `vite build` sauber.
- Demo im Browser (iPhone-13-Emulation) ohne Konsolenfehler: https://claude.ai/artifact/9KoPMGUqvGfHHkTLPDp4ho
- Nicht getestet: echtes Supabase, echter Kurzbefehl, Migration gegen das echte Projekt.

## Offen, Entscheidung bei Marius

- Kalender-Tag in Blöcken (Stats, Ernährung farbig nach Protein, Kohlenhydrate, Fett in g und kcal, Training, Rohdaten eingeklappt) oder eigener Tab "Heute". Empfehlung: Blöcke im Kalender.
- Erholung und Belastung wie Athlytic: Vorschlag Erholung aus HRV, Ruhepuls und Schlaf gegen den eigenen Schnitt, Belastung = Trainingsminuten x RPE. Noch nicht gebaut.
- "Laborwert" umbenennen, Vorschlag "Blutwerte".
- Google Kalender: Abo (nur lesen) oder Sync in beide Richtungen.
- Trainingsplan-Diktat: "Paarlauf" unklar, welche Hamstring-Übung, Uhrzeit Sonntag (Platzhalter 10:00).
- Capoeira-Symbol: vorerst Kampfkunst-Figur.

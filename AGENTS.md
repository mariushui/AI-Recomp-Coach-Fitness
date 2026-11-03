# Recomp Coach: Regeln für alle KI-Werkzeuge

Gilt für Claude Code und Google AI Studio. Vor jeder Änderung lesen.

## Ziel der App

Marius (und später Freunde) sammeln mit möglichst wenig Aufwand Daten zu Gesundheit, Körper und Training:

1. lange gesund bleiben
2. Recomposition: Körperfett runter, Muskeln rauf
3. besser werden in Tennis, Laufen und Capoeira

Phase 1 (jetzt): nur Datensammlung und einfache Verläufe.
Phase 2 (später): Planung und Coaching auf Basis der gesammelten Daten.

## Architektur

- Frontend: React 19 + Vite + Tailwind (CDN), Web-App für den iPhone-Homescreen.
- Backend: Supabase (Region EU Frankfurt). Postgres mit Row Level Security, Login per E-Mail-Code.
- KI: Gemini, nur serverseitig in der Edge Function `parse-log`. **Nie einen API-Key ins Frontend.**
- Apple Health: iOS-Kurzbefehl sendet an die Edge Function `health-ingest`. Anleitung: `docs/KURZBEFEHL.md`.

## Ordner

| Pfad | Inhalt | Wer ändert |
|---|---|---|
| `supabase/functions/_shared/domain.ts` | Datenmodell, gemeinsam für App und Server | Claude Code |
| `supabase/functions/_shared/*.ts` | Parser für Health und KI, reines TypeScript | Claude Code |
| `supabase/functions/*/index.ts` | Edge Functions (Deno) | Claude Code |
| `supabase/migrations/` | Datenbankschema | Claude Code |
| `lib/` | Datenzugriff, Statistik, Zeit, Import | Claude Code |
| `components/` | Oberfläche | beide |
| `tests/` | Vitest | beide |
| `docs/` | Setup, Datenmodell, Kurzbefehl | beide |

## Zusammenarbeit Claude Code und AI Studio

- `main` ist geschützt. Änderungen kommen nur per Pull Request.
- Claude Code arbeitet auf Branches `claude/...`.
- AI Studio arbeitet auf dem Branch `aistudio` und holt vorher den aktuellen Stand von `main`.
- AI Studio ändert bevorzugt nur `components/` und Texte. Neue Felder im Datenmodell zuerst in `docs/DATENMODELL.md` beschreiben, Claude Code setzt sie in Schema, Typen und Tests um.
- Kein `process.env.API_KEY`, kein `@google/genai` im Frontend. KI-Aufrufe laufen über `lib/entries.ts` → `parseText()`.

## Datenmodell in Kurzform

Eine Tabelle `entries` als Event-Log. Jeder Eintrag hat `kind`, `occurred_at` (ISO mit Offset), `source` und `data` (JSON).
Arten: `meal`, `workout`, `plan`, `body`, `wellbeing`, `lab`, `note`, `health`. Details in `docs/DATENMODELL.md`.

## Prüfen vor jedem Commit

```bash
npm test
npm run typecheck
npm run build
```

## Stil

- Oberfläche auf Deutsch, du-Form.
- Keine Gedankenstriche in Texten, kurze Sätze.
- Mobile zuerst: alles muss auf iPhone-Breite bedienbar sein.

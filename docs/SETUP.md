# Einrichtung

Einmalig, etwa 30 Minuten. Du brauchst: Mac mit Terminal, GitHub-Zugang, einen Gemini-API-Key.

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) anmelden, **New project**.
2. Name `recomp-coach`, Region **Central EU (Frankfurt)**, Datenbank-Passwort im Passwort-Manager speichern.
3. Unter **Project Settings > API** notieren: `Project URL` und den `anon public` Key.

## 2. Datenbank-Schema einspielen

**SQL Editor > New query**, nacheinander alle Dateien aus `supabase/migrations/` in Reihenfolge der Dateinamen einfügen und jeweils **Run**.

## 3. Login einstellen

1. **Authentication > Sign In / Providers > Email**: aktiviert lassen.
2. **Authentication > Emails > Magic Link**: In die Vorlage diese Zeile einfügen, damit die Mail einen Code enthält:
   ```
   <p>Dein Code: <strong>{{ .Token }}</strong></p>
   ```
   Der Code ist wichtig fürs iPhone. Ein Link öffnet sich in Safari und nicht in der Homescreen-App.
3. **Authentication > URL Configuration**: Site URL = Adresse deiner App (Schritt 6). Für lokale Tests zusätzlich `http://localhost:3000` als Redirect URL.

Hinweis: Der eingebaute Mailversand von Supabase hat ein niedriges Stundenlimit. Für dich und ein paar Freunde reicht das. Für mehr Nutzer später eigenes SMTP eintragen, zum Beispiel Brevo.

## 4. Server-Funktionen deployen

Gemini-Key holen: [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

Im Terminal auf dem Mac:

```bash
brew install supabase/tap/supabase
```

```bash
cd ~/Pfad/zu/AI-Recomp-Coach-Fitness
```

```bash
supabase login
```

```bash
supabase link --project-ref DEINE_PROJECT_REF
```

Die Project Ref ist der Teil vor `.supabase.co` in der Project URL.

```bash
supabase secrets set GEMINI_API_KEY=dein-key AI_DAILY_LIMIT=60
```

```bash
supabase functions deploy parse-log
```

```bash
supabase functions deploy health-ingest --no-verify-jwt
```

```bash
supabase functions deploy health-export --no-verify-jwt
```

Nach jeder Änderung an `supabase/functions/` die betroffene Funktion erneut deployen.

Optional: `GEMINI_MODELS=modell1,modell2,...` legt die Reihenfolge fest, in der die Function Modelle probiert (bei Überlastung kommt das nächste dran). Standard: `gemini-3.8-flash, gemini-3.7-flash, gemini-3.6-flash, gemini-3.5-flash`. `GEMINI_SCHEMA=1` schickt zusätzlich ein strenges Antwortschema mit; standardmäßig aus, weil manche Modelle damit schlechter antworten.

## 5. Lokal starten

```bash
cp .env.example .env.local
```

In `.env.local` die Werte aus Schritt 1 eintragen. Dann:

```bash
npm install
```

```bash
npm run dev
```

App läuft auf `http://localhost:3000`.

## 6. Online stellen (GitHub Pages, kostenlos)

1. GitHub-Repo > **Settings > Pages > Source: GitHub Actions**.
2. **Settings > Secrets and variables > Actions > Variables**: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` anlegen.
3. Jeder Push auf `main` baut und veröffentlicht die App unter `https://mariushui.github.io/AI-Recomp-Coach-Fitness/`.
4. Diese Adresse in Supabase als Site URL eintragen (Schritt 3).
5. Auf dem iPhone in Safari öffnen, **Teilen > Zum Home-Bildschirm**.

## 7. Apple Health verbinden

In der App unter **Einstellungen > Apple Health** einen Token erzeugen. Dann `docs/KURZBEFEHL.md` folgen.

## 8. Alte Daten übernehmen

Die alte Version hat deine Einträge im Browser-Speicher von AI Studio. Läuft die neue App unter einer anderen Adresse, sieht sie diese Daten nicht automatisch.
So holst du sie: In der alten App am Mac die Entwicklerkonsole öffnen (Safari: Entwickler > JavaScript-Konsole) und eingeben:

```
copy(localStorage.getItem('ai_fitness_coach_history_v2'))
```

Dann in der neuen App unter **Einstellungen > Alte Daten übernehmen** einfügen. Doppelte Einträge werden übersprungen.

## Freunde einladen

Adresse der App schicken. Jeder meldet sich mit seiner E-Mail an und sieht nur seine eigenen Daten. Die KI-Kosten laufen über deinen Key, begrenzt auf `AI_DAILY_LIMIT` Anfragen pro Person und Tag.

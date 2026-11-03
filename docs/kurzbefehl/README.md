# Kurzbefehl „Recomp Health“ als Datei

Statt den Kurzbefehl von Hand zu bauen, erzeugt `make_shortcut.py` die Datei. Apple lässt nur signierte Dateien aufs iPhone,
deshalb läuft die Signatur auf dem Mac (Shortcuts ab macOS 12).

Stand: am Code geprüft, Import am iPhone noch nicht. Klappt der Import nicht, gilt die Anleitung in `docs/KURZBEFEHL.md`.

## Schritte auf dem Mac

1. Token und Adresse aus der App holen: Einstellungen → Apple Health → Token erstellen, Adresse kopieren.
2. Im Terminal, im Ordner `docs/kurzbefehl`:

```bash
python3 make_shortcut.py "rc_DEIN_TOKEN" "https://DEIN-PROJEKT.supabase.co/functions/v1/health-ingest"
```

3. Signieren:

```bash
shortcuts sign --mode anyone --input "Recomp Health.shortcut" --output "Recomp Health signed.shortcut"
```

4. `Recomp Health signed.shortcut` per AirDrop ans iPhone schicken und öffnen. Kurzbefehle fragt, ob der Kurzbefehl hinzugefügt werden soll.
5. Einmal starten, Health-Zugriff erlauben. Erwartet: „… Werte für … Tag(e) gespeichert“.

Ohne eigenen Token lässt sich die Datei auch mit dem Platzhalter bauen. Dann nach dem Import im Kurzbefehl die Aktion
„Inhalte von URL abrufen“ öffnen und beim Header `x-recomp-token` den echten Token eintragen.

## Was Stufe 1 enthält

Gewicht, Körperfett, Ruhepuls, HRV (je die letzten 10 bzw. 40 Werte) und Schlaf (letzte 80 Abschnitte).
Der Server fasst pro Kennzahl und Tag zusammen und überschreibt bei erneutem Senden. Stufe 2 (Schritte, Ringe, Blutsauerstoff,
Cardio-Erholung, VO2max) und Stufe 3 (Rückweg Ernährung) stehen in `docs/KURZBEFEHL.md` und kommen in die Datei, sobald Stufe 1 läuft.

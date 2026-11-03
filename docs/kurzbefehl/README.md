# Kurzbefehl „Recomp Health“ als Datei

Statt den Kurzbefehl von Hand zu bauen, erzeugt `make_shortcut.py` die Datei. Apple lässt nur signierte Dateien aufs iPhone,
deshalb läuft die Signatur auf dem Mac (Shortcuts ab macOS 12).

Stand: geprüft am iPhone (iOS 26, 3. November 2026). Erster Lauf: 18 Werte für 5 Kennzahlen gespeichert.

## Schritte auf dem Mac

1. Token und Adresse aus der App holen: Einstellungen → Apple Health → Token erstellen, Adresse kopieren.
2. Im Terminal, im Ordner `docs/kurzbefehl`:

```bash
python3 make_shortcut.py "rc_DEIN_TOKEN" "https://DEIN-PROJEKT.supabase.co/functions/v1/health-ingest"
```

3. Signieren. Der Dateiname wird zum Namen des Kurzbefehls, und die App startet ihn unter „Recomp Health“, deshalb in einen Unterordner:

```bash
mkdir -p signed && shortcuts sign --mode anyone --input "Recomp Health.shortcut" --output "signed/Recomp Health.shortcut"
```

4. `signed/Recomp Health.shortcut` per AirDrop ans iPhone schicken und öffnen. Kurzbefehle fragt, ob der Kurzbefehl hinzugefügt werden soll.
5. Auf dem iPhone einmalig: Einstellungen → Apps → Kurzbefehle → Erweitert → **Teilen großer Datenmengen erlauben**. Sonst blockiert iOS das Senden mit „Diese Aktion versucht, N Health-Objekte zu teilen“.
6. Einmal starten, Health-Zugriff für die 5 Typen erlauben. Erwartet: „… Werte für … Tag(e) gespeichert“.

Ohne eigenen Token lässt sich die Datei auch mit dem Platzhalter bauen. Dann nach dem Import im Kurzbefehl die Aktion
„Inhalte von URL abrufen“ öffnen und beim Header `x-recomp-token` den echten Token eintragen.

## Was beim Bauen der Datei wichtig war

Abgelesen aus einem Kurzbefehl, den iOS selbst gespeichert hat (iCloud-Link, Download über `https://www.icloud.com/shortcuts/api/records/ID`):

- „Health-Messungen suchen“ speichert Typ und Zeitraum als Filterbedingungen (`WFContentItemFilter`), kein eigenes Typ-Feld. Typnamen auf Englisch: `Weight`, `Body Fat Percentage`, `Resting Heart Rate`, `Heart Rate Variability`, `Sleep`.
- Jede Folgeaktion braucht eine ausdrückliche Verknüpfung (`WFInput` mit der UUID der Vorgängerin). Ohne sie bleibt die Variable leer.
- „Datum formatieren“ liefert bei einer Liste von Daten nichts. Die Datei übergibt die Daten roh, der Server liest das Format von Kurzbefehle („03.11.2026, 07:12“) in Berliner Zeit.
- „Wörterbuchwert abrufen“ erwartet den Schlüssel in `WFDictionaryKey`.

## Was Stufe 1 enthält

Gewicht, Körperfett, Ruhepuls, HRV (je die letzten 10 bzw. 40 Werte) und Schlaf (letzte 80 Abschnitte).
Der Server fasst pro Kennzahl und Tag zusammen und überschreibt bei erneutem Senden. Stufe 2 (Schritte, Ringe, Blutsauerstoff,
Cardio-Erholung, VO2max) und Stufe 3 (Rückweg Ernährung) stehen in `docs/KURZBEFEHL.md` und kommen in die Datei, sobald Stufe 1 läuft.

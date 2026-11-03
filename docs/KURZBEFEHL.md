# Apple Health per Kurzbefehl verbinden

Ein Kurzbefehl auf dem iPhone liest Werte aus Apple Health und schickt sie an die App.
Bau ihn einmal, das dauert etwa 20 Minuten. Danach läuft er automatisch.

Stand: Anleitung am Code geprüft, am iPhone noch nicht durchgeklickt. Die Namen der Aktionen können je nach iOS-Version leicht abweichen. In Klammern steht der englische Name.

## Warum diese Bauweise stabil ist

Frühere Lösungen mit Auto-Export und Push waren bei dir instabil. Die häufigsten Ursachen und was hier anders ist:

| Problem | Lösung hier |
|---|---|
| iPhone gesperrt, Health-Daten sind dann verschlüsselt und der Lauf scheitert still | Auslöser ist das Entsperren beim Öffnen einer App, nicht eine feste Uhrzeit |
| Ein Lauf fällt aus und der Tag fehlt für immer | Jeder Lauf sendet die letzten 3 Tage. Der nächste Lauf holt Lücken nach |
| Doppelte Werte durch mehrfaches Senden | Der Server speichert pro Kennzahl und Tag genau einen Wert und überschreibt ihn |
| Fehler bleiben unbemerkt | Der Kurzbefehl zeigt nach jedem Lauf eine Mitteilung mit dem Ergebnis. Die App zeigt unter **Einstellungen** den letzten Empfang |
| Schlaf doppelt gezählt (Watch und Schlaf-App) | Der Server zählt überlappende Zeiten nur einmal |

## Vorbereitung

1. In der App **Einstellungen > Apple Health > Token erstellen**. Token kopieren und in einer Notiz zwischenspeichern.
2. Ebenda die **Adresse** kopieren. Sie endet auf `/functions/v1/health-ingest`.

## Kurzbefehl bauen

App **Kurzbefehle** öffnen, **+**, Name: **Recomp Health** (genau so, die App startet ihn über diesen Namen).

### Baustein pro Kennzahl

Diesen Block baust du 7-mal, je einmal für:

| Kennzahl | Typ in Health | Variablen-Namen |
|---|---|---|
| Gewicht | Gewicht (Weight) | `GW` und `GD` |
| Körperfett | Körperfettanteil (Body Fat Percentage) | `KW` und `KD` |
| Ruhepuls | Ruheherzfrequenz (Resting Heart Rate) | `RW` und `RD` |
| HRV | Herzfrequenzvariabilität (Heart Rate Variability) | `HW` und `HD` |
| VO2max | Cardiofitness (VO2 Max) | `VW` und `VD` |
| Blutsauerstoff | Blutsauerstoff (Blood Oxygen) | `BW` und `BD` |
| Cardio-Erholung (HRR) | Cardio-Erholung (Cardio Recovery) | `CW` und `CD` |

Für Gewicht sieht der Block so aus:

1. **Health-Samples suchen** (Find Health Samples)
   - Typ: **Gewicht**
   - Filter: **Startdatum** **liegt in den letzten** **3 Tagen**
   - Sortieren nach: **Startdatum**, Reihenfolge: **Älteste zuerst**
   - Limit: aus
2. **Details von Health-Samples abrufen** (Get Details of Health Sample): **Wert** von *Health-Samples*
3. **Variable festlegen** (Set Variable): `GW`
4. **Details von Health-Samples abrufen**: **Startdatum** von *Health-Samples* (die Ausgabe aus Schritt 1 antippen, nicht die aus Schritt 2)
5. **Datum formatieren** (Format Date): Datumsformat **ISO 8601**, **Uhrzeit einschließen** an
6. **Variable festlegen**: `GD`

Mit Duplizieren (lange auf eine Aktion drücken) geht das schneller. Danach nur Typ und Variablen-Namen ändern.

### Baustein Schritte

iPhone und Watch zählen Schritte parallel. Damit nichts doppelt zählt, schickt der Kurzbefehl die Quelle mit. Der Server nimmt pro Tag die Quelle mit den meisten Schritten.

1. **Health-Samples suchen**: Typ **Schritte** (Steps), Startdatum in den letzten **3 Tagen**, sortiert nach Startdatum, älteste zuerst
2. **Details von Health-Samples abrufen**: **Wert** → **Variable festlegen** `TW`
3. **Details von Health-Samples abrufen**: **Startdatum** → **Datum formatieren** ISO 8601 mit Uhrzeit → **Variable festlegen** `TD`
4. **Details von Health-Samples abrufen**: **Quelle** (Source) → **Variable festlegen** `TQ`

### Bausteine Aktivitätsringe

Gleich gebaut wie Schritte, also mit Quelle:

| Ring | Typ in Health | Variablen |
|---|---|---|
| Bewegen | Aktive Energie (Active Energy) | `AW`, `AD`, `AQ` |
| Trainieren | Trainingsminuten (Exercise Minutes) | `EW`, `ED`, `EQ` |

Den Ring „Stehen“ lassen wir weg.

### Baustein Schlaf

1. **Health-Samples suchen**: Typ **Schlafanalyse** (Sleep Analysis), Startdatum in den letzten **3 Tagen**, sortiert nach Startdatum, älteste zuerst
2. **Details von Health-Samples abrufen**: **Wert** → **Variable festlegen** `SW`
3. **Details von Health-Samples abrufen**: **Startdatum** → **Datum formatieren** ISO 8601 mit Uhrzeit → **Variable festlegen** `SS`
4. **Details von Health-Samples abrufen**: **Enddatum** → **Datum formatieren** ISO 8601 mit Uhrzeit → **Variable festlegen** `SE`

### Senden

1. **Inhalte von URL abrufen** (Get Contents of URL)
   - URL: deine kopierte Adresse
   - Methode: **POST**
   - Header: Schlüssel `x-recomp-token`, Wert: dein Token
   - Anfragetext: **JSON**
   - Feld `metrics`, Typ **Wörterbuch** (Dictionary). Darin:

   | Schlüssel | Typ | Inhalt |
   |---|---|---|
   | `weight` | Wörterbuch | `values` (Text) = `GW`, `dates` (Text) = `GD` |
   | `body_fat` | Wörterbuch | `values` = `KW`, `dates` = `KD` |
   | `resting_hr` | Wörterbuch | `values` = `RW`, `dates` = `RD` |
   | `hrv` | Wörterbuch | `values` = `HW`, `dates` = `HD` |
   | `vo2max` | Wörterbuch | `values` = `VW`, `dates` = `VD` |
   | `spo2` | Wörterbuch | `values` = `BW`, `dates` = `BD` |
   | `hr_recovery` | Wörterbuch | `values` = `CW`, `dates` = `CD` |
   | `steps` | Wörterbuch | `values` = `TW`, `dates` = `TD`, `sources` = `TQ` |
   | `active_kcal` | Wörterbuch | `values` = `AW`, `dates` = `AD`, `sources` = `AQ` |
   | `exercise_min` | Wörterbuch | `values` = `EW`, `dates` = `ED`, `sources` = `EQ` |
   | `sleep` | Wörterbuch | `values` = `SW`, `starts` = `SS`, `ends` = `SE` |

   Wichtig: Die Variablen in ein **Text**-Feld einsetzen. Shortcuts schreibt Listen dann zeilenweise, genau so erwartet es der Server.

2. **Wörterbuchwert abrufen** (Get Dictionary Value): Wert für Schlüssel `summary` aus *Inhalte von URL*
3. **Mitteilung anzeigen** (Show Notification): *Wörterbuchwert*

### Erster Test

Kurzbefehl einmal von Hand starten. iOS fragt nach Health-Zugriff, alles erlauben.
Erwartete Mitteilung, zum Beispiel: „24 Werte für 3 Tag(e) gespeichert (…)“.

Klappt etwas nicht, in der URL hinten `?dry=1` anhängen und als letzte Aktion **Ergebnis anzeigen** (Show Result) mit *Inhalte von URL* einsetzen.
Der Server speichert dann nichts. Er zeigt nur, was er erkannt hat, und listet unter `warnings` jede Zeile, die er nicht lesen konnte. Den Text kannst du mir schicken.

## Rückweg: Ernährung und Blutzucker nach Apple Health

Derselbe Kurzbefehl schreibt danach deine Mahlzeiten nach Apple Health: Kalorien, Protein, Kohlenhydrate, Fett. Dazu Blutzucker, wenn du ihn als Blutwert mit Einheit mg/dL oder mmol/L erfasst hast.
Andere Blutwerte (HbA1c, LDL, Vitamin D) und Trainings werden nicht übertragen. Apple Health hat dafür keinen passenden Messwert, Trainings zeichnet die Watch auf.

Stand: Server getestet, Kurzbefehl am iPhone noch nicht durchgeklickt.

Die Bausteine kommen ans Ende von **Recomp Health**, nach **Mitteilung anzeigen**.

### 1. Neue Werte abholen

1. **Inhalte von URL abrufen**
   - URL: die zweite Adresse aus der App, sie endet auf `/functions/v1/health-export`
   - Methode **POST**, Header `x-recomp-token` mit deinem Token, Anfragetext **JSON** ohne Felder
2. **Variable festlegen**: `EX`

### 2. Baustein pro Nährwert

Diesen Block baust du 4-mal, dazu einmal für Blutzucker:

| Schlüssel | Typ in Health | Einheit |
|---|---|---|
| `energy` | Nahrungsenergie (Dietary Energy) | kcal |
| `protein` | Protein | g |
| `carbs` | Kohlenhydrate (Carbohydrates) | g |
| `fat` | Fett gesamt (Total Fat) | g |
| `glucose` | Blutzucker (Blood Glucose) | mg/dL |

Für `energy`:

1. **Wörterbuchwert abrufen**: Wert für Schlüssel `energy` aus `EX`
2. **Wiederholen mit jedem Objekt** (Repeat with Each) in *Wörterbuchwert*. Darin:
   1. **Wörterbuchwert abrufen**: `value` aus *Wiederholungsobjekt*
   2. **Wörterbuchwert abrufen**: `date` aus *Wiederholungsobjekt*
   3. **Health-Probe protokollieren** (Log Health Sample): Typ **Nahrungsenergie**, Wert = `value`, Einheit **kcal**, Datum = `date`

Ist eine Liste leer, läuft die Wiederholung einfach nicht. Das ist gewollt.

### 3. Empfang bestätigen

Erst jetzt gelten die Werte als übertragen. Fällt dieser Schritt aus, kommen sie beim nächsten Lauf erneut.

1. **Wörterbuchwert abrufen**: `receipt` aus `EX`
2. **Inhalte von URL abrufen**: gleiche Adresse und Header wie in Schritt 1, Anfragetext **JSON** mit Feld `confirm` (Text) = *Wörterbuchwert*
3. Optional: **Wörterbuchwert abrufen** `summary` aus `EX` und **Mitteilung anzeigen**

Hinweis: Änderst du eine Mahlzeit nach der Übertragung in der App, bleibt in Apple Health der alte Wert stehen. Korrigiere ihn dann in der Health-App.

## Automatisch auslösen

**Kurzbefehle > Automation > +  > Persönliche Automation**

**Auslöser 1 (Hauptweg): App wird geöffnet**
- **App**: eine App, die du jeden Morgen öffnest, zum Beispiel Athlytic oder Mail. Das iPhone ist dann entsperrt, Health ist lesbar.
- **Sofort ausführen** wählen, **Bei Ausführung benachrichtigen** aus.
- Aktion: **Kurzbefehl ausführen** → Recomp Health.

**Auslöser 2 (Netz): Tageszeit**, zum Beispiel 21:00, ebenfalls **Sofort ausführen**. Fängt Tage ab, an denen Auslöser 1 nicht lief.

Mehrfaches Laufen am Tag schadet nicht.

**Von Hand**: In der App unter **Einstellungen** gibt es **Jetzt syncen**. Das startet den Kurzbefehl direkt.

## Für Freunde

Jeder baut den Kurzbefehl mit seinem eigenen Token. Teilen per iCloud-Link geht auch, dann muss jeder nur Token und Adresse im Schritt **Inhalte von URL abrufen** austauschen. Den Token nie mitteilen, er ist wie ein Passwort.

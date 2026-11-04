# Ableitungen für die App

Stand 4. November 2026. Folgerungen aus `studien.md` (Nr. 1 bis 20) und `huberman.md` (H1 bis H7). Alle Zielwerte sind Voreinstellungen, die Nutzer ändern können.

Bezug zum Datenmodell: `docs/DATENMODELL.md`. Krafteinträge haben heute `exercises[]` mit `exercise`, `sets`, `reps`, `weight_kg`, `rpe`. Vorschläge für neue Felder stehen unten und müssen erst in `DATENMODELL.md` beschrieben werden.

---

## 1. Kennzahlen (KPIs)

### Ernährung

| KPI | Berechnung | Quelle |
|---|---|---|
| Protein pro Tag | g Protein ÷ kg Körpergewicht (7-Tage-Schnitt Gewicht) | Nr. 2, 16 |
| Proteinmahlzeiten | Anzahl Mahlzeiten pro Tag mit mindestens 0,4 g/kg (Ersatzwert: 30 g) | Nr. 5, H4 |
| Kalorienbilanz | Aufnahme minus geschätzter TDEE, Tag und 7-Tage-Schnitt | Nr. 15, 17 |
| Abnahmerate | Änderung 7-Tage-Schnitt Gewicht in % pro Woche | Nr. 6 |
| Fett und Kohlenhydrate | g/kg pro Tag, nur als Untergrenzen-Check | Nr. 14 |

### Training

| KPI | Berechnung | Quelle |
|---|---|---|
| Harte Sätze pro Muskelgruppe und Woche | Sätze mit RIR 0 bis 3 (oder RPE 7 bis 10). Primärmuskel zählt 1,0, Sekundärmuskel 0,5 | Nr. 4, 11, 13 |
| e1RM je Hauptübung | Epley: Gewicht × (1 + Wdh. ÷ 30), nur Sätze bis 10 Wdh. | begriffe.md |
| Volumen-Last je Übung | Gewicht × Wdh. × Sätze, nur als Verlauf pro Übung | begriffe.md |
| Einheiten pro Woche nach Art | Zählung nach `session_type` bzw. Split-Typ | H1 |
| Frequenz pro Muskel | An wie vielen Tagen pro Woche ein Muskel direkt trainiert wurde | H1, H2 |
| Gedehnt-Abdeckung | Pro Muskel: gab es in der Woche mindestens eine Übung mit Betonung gedehnt? | H1, Nr. 19 |

### Körper

| KPI | Berechnung | Quelle |
|---|---|---|
| Gewicht 7-Tage-Schnitt | gleitender Mittelwert | Nr. 6 |
| Taillenumfang | wöchentlich, gleiche Stelle, morgens | begriffe.md |
| Körperfett und fettfreie Masse | Waage oder DEXA, Trend über mindestens 4 Wochen | Nr. 1 |
| Recomposition-Signal | Taille sinkt und e1RM steigt bei etwa stabilem Gewicht | Nr. 1, 15 |

### Erholung

Schlaf, Ruhepuls, HRV aus Apple Health als Kontext für Volumen (H3). Optional später Glukosespitze nach Mahlzeiten per CGM (H7).

---

## 2. Standardziele

### Ernährung

| Ziel | Standard | Bereich | Quelle |
|---|---|---|---|
| Protein (Erhaltung, Aufbau) | 1,8 g/kg | 1,6 bis 2,2 g/kg | Nr. 2, 14, 16 |
| Protein (Defizit, schlank) | 2,2 g/kg | bis 2,3 bis 3,1 g/kg fettfreie Masse | Nr. 3, 6, 7, 17 |
| Proteinmahlzeiten | 4 pro Tag | mindestens 3 | Nr. 5, H4 |
| Defizit für Recomposition | 300 kcal unter TDEE | 0 bis 500 kcal, oder ca. 10 bis 20 % | Nr. 15 |
| Abnahmerate | 0,5 % pro Woche | 0,25 bis 1 % | Nr. 6, 17 |
| Fett | mindestens 0,5 g/kg | 0,5 bis 1,5 g/kg | Nr. 14 |
| Überschuss (spätere Aufbauphase) | 10 % über TDEE | 5 bis 20 % | Nr. 14 |

Hinweis: Die 300 kcal sind eine Ableitung, keine Studienzahl. Belegt ist nur, dass über 500 kcal der Muskelzuwachs im Mittel ausbleibt (Nr. 15).

### Training

| Ziel | Standard | Bereich | Quelle |
|---|---|---|---|
| Harte Sätze pro Muskel und Woche | 10 bis 12 | Start 6 bis 10, üblich 10 bis 20, gut Trainierte bis 25 | Nr. 4, 13, H2 |
| Frequenz pro Muskel | 2 Mal pro Woche | 1 bis 3 | H1, H2, Nr. 13 |
| Wiederholungen Grundübungen | 6 bis 10 | 4 bis 12 | H1 |
| Wiederholungen Isolation | 10 bis 15 | 8 bis 30 | H1, H2 |
| RIR | 1 bis 2 | 0 bis 3 | Nr. 10, 11, 12 |
| Pausen | Grundübungen 2 bis 3 min, Isolation 1 bis 2 min | | H1 |
| Einheitsdauer | 50 bis 60 min harte Arbeit | höchstens 75 min | H1 |
| Kraftblock (optional) | 3 bis 5 Wdh., 3 bis 5 Sätze, 3 bis 5 min Pause | | H2 |

Anzeige der Wochensätze in Ampelfarben, bewusst als Bereiche:

- unter 6: wenig, eher Erhalt
- 6 bis 10: wirksam für Einsteiger oder im Defizit
- 10 bis 20: Zielbereich
- über 20: nur sinnvoll, wenn Leistung und Erholung stimmen

---

## 3. Einheitstypen

Die App sollte diese Typen als Auswahl für Krafteinheiten anbieten (Feld zum Beispiel `split_type` innerhalb `workout` mit `sport = kraft`):

| Wert | Bezeichnung |
|---|---|
| `push` | Push (Brust, Schultern, Trizeps) |
| `pull` | Pull (Rücken, hintere Schulter, Bizeps) |
| `beine` | Beine / Unterkörper |
| `oberkoerper` | Oberkörper |
| `unterkoerper` | Unterkörper |
| `ganzkoerper` | Ganzkörper |
| `rumpf` | Rumpf (Brust, Rücken, Schultern), Hubermans "Torso" |
| `arme_waden` | Arme, Waden, Nacken (Huberman Samstag) |
| `sonstiges` | Freie Einheit |

Ausdauer-Typen nach H1: `zone2` (lang, locker), `moderat`, `hiit`. Dazu `erholung` für aktive Erholung.

Der Split der Woche (PPL, Upper/Lower, Ganzkörper, Torso/Limbs, Bro-Split) ergibt sich aus den Einheiten und muss nicht gespeichert werden.

---

## 4. Metadaten pro Übung

Für einen Übungskatalog (Vorlage: `begriffe.md`, Abschnitt c) pro Übung speichern:

| Feld | Werte | Zweck |
|---|---|---|
| `name_de`, `name_en` | Text | Anzeige, Erkennung bei Spracheingabe |
| `aliases` | Liste | Synonyme für KI-Parser (zum Beispiel "RDL", "Rumänisches Kreuzheben") |
| `pattern` | horizontal_druecken, vertikal_druecken, horizontal_ziehen, vertikal_ziehen, kniebeuge, hinge, ausfallschritt, tragen, rotation, anti_rotation, rumpf, isolation | Musterbalance |
| `primary_muscles` | Liste | Zählt 1,0 Satz |
| `secondary_muscles` | Liste | Zählt 0,5 Satz (Nr. 13) |
| `emphasis` | gedehnt, verkuerzt, voll | Gedehnt-Abdeckung (H1, Nr. 19) |
| `unilateral` | ja/nein | Gewicht pro Seite, Sätze pro Seite |
| `equipment` | langhantel, kurzhantel, kabel, maschine, koerpergewicht | Filter, Ersatzübungen |
| `compound` | ja/nein | Wiederholungsbereich, e1RM nur für Grundübungen |
| `load_type` | absolut, koerpergewicht_plus | Klimmzug, Dips: Zusatzgewicht plus Körpergewicht |

Pro Satz zusätzlich sinnvoll (heute nur `sets`, `reps`, `weight_kg`, `rpe` pro Übung):

- `rir` pro Satz oder pro Übung, alternativ `rpe` umrechnen (RPE 8 = 2 RIR)
- `is_warmup` zum Ausschluss aus harten Sätzen
- optional `technique` (normal, lengthened_partials, drop_set)

Muskelgruppen-Liste (Vorschlag): Brust, Latissimus, oberer Rücken, vordere Schulter, seitliche Schulter, hintere Schulter, Bizeps, Trizeps, Unterarm, Quadrizeps, Beinbeuger, Gesäß, Adduktoren, Waden, Bauch, Rückenstrecker, Nacken.

---

## 5. Was die App nicht tun soll

- **MRV, MEV, MAV nicht als feste Zahlen behandeln.** Sie sind individuell und ändern sich mit Schlaf, Stress und Defizit (Nr. 8). Die App zeigt Bereiche, keine Grenzwerte mit Alarm.
- **Nicht Training bis zum Versagen fordern.** 0 bis 3 RIR genügt (Nr. 10, 11).
- **Sätze mit großer Reserve nicht als harte Sätze zählen.** Ohne RIR-Angabe Sätze als hart zählen, aber kennzeichnen, dass die Zahl geschätzt ist.
- **Volumen-Last (Tonnage) nicht als Maß für Hypertrophie verwenden.** Nur als Verlauf einer Übung.
- **Keine großen Defizite für Recomposition vorschlagen.** Über 500 kcal warnen (Nr. 15).
- **Nicht einzelne BIA-Werte bewerten.** Körperfett aus der Waage nur als Trend über Wochen anzeigen, nie Tagesänderungen kommentieren.
- **Gewicht allein nicht als Fortschritt werten.** Bei Recomposition kann das Gewicht gleich bleiben. Taille, e1RM und Fotos gehören dazu (Nr. 1).
- **Protein nicht gegen fettfreie Masse und Körpergewicht vermischen.** Einheit immer anzeigen (g/kg KG oder g/kg FFM).
- **Keine Warnung bei hohem Protein für Gesunde.** Bis 3,4 g/kg ohne beobachtete Schäden (Nr. 18).
- **Keine Diätform vorschreiben.** Low Carb, Low Fat, Fasten wirken bei gleichen Kalorien und gleichem Protein ähnlich (Nr. 17, H4).
- **Mahlzeiten-Timing nicht überbewerten.** Gesamtmenge vor Verteilung vor Timing (Nr. 5, 6, H3).
- **Glukosewerte nicht als Ziel für Körperzusammensetzung ausgeben.** Für Menschen ohne Diabetes fehlt der Beleg (H7).
- **Podcast-Zahlen nicht als Studienergebnis darstellen.** Quelle immer mitführen.

---

## 6. Offene Punkte

- TDEE-Schätzung: Start mit Katch-McArdle (wenn Körperfett bekannt) oder Mifflin-St Jeor, dann anhand von Gewichtsverlauf und Kalorien nachführen.
- Indirekte Sätze: Muskelzuordnung pro Übung muss gepflegt werden, sonst ist die 0,5-Zählung wertlos.
- Phase (Defizit, Erhaltung, Aufbau) als Nutzereinstellung, damit Proteinziel und Kalorienziel sich anpassen.

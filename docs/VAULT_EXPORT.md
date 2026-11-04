# Export in den Obsidian-Vault

Stand 4. November 2026.

## Was

Eine Markdown-Datei pro Monat, Name `JJJJ-MM.md`, zum Beispiel `2026-11.md`. Erzeugt von `lib/vaultExport.ts` (`monthFile`).
Die Datei wird bei jedem Export ganz ersetzt. Korrekturen in der App kommen so automatisch im Vault an. Änderungen von Hand in der Datei gehen beim nächsten Export verloren.

## Aufbau

- Frontmatter: `typ: gesundheit-recomp`, `monat`, `stand`, Monatsmittel (Gewicht, KFA, Schlaf, Erholung, Protein, kcal), Anzahl Trainings, `tags`.
- `## Tage`: Tabelle, eine Zeile je Tag bis heute. Gewicht, KFA, Taille, Schlaf, HRV, Ruhepuls, Erholung, Belastung, Schritte, aktive kcal, kcal, Protein, KH, Fett, Trainingsminuten.
- `## Training`: je Einheit eine Überschrift mit Sportart, Vorlage, Dauer, RPE, kcal, Distanz. Darunter Übungen mit Sätzen, Fokus-Notizen, Highlight, Flop, Notizen.
- `## Ernährung`: je Tag Summe, darunter jede Mahlzeit mit Makros, dazu die Mikronährstoffe als Tagessumme (KI-Schätzung).
- `## Körpermaße`: Messtage mit Umfängen, Hautfalten-Summe, KFA und Methode.
- `## Befinden, Blutwerte, Notizen`.

Zahlen deutsch formatiert (Dezimalkomma, Tausenderpunkt).

## Ablageort

Am Mac: `/Users/mariushuinink/Library/Mobile Documents/iCloud~md~obsidian/Documents/Marius_Vault/01 marius privat/Sport&Health/Health App Export`
Auf dem iPhone in der Dateien-App: Obsidian → Marius_Vault → 01 marius privat → Sport&Health → Health App Export.

## Wie es in den Vault kommt

- **Jetzt, von Hand:** Einstellungen → Obsidian-Vault → „Jetzt in den Vault“. Aktueller und letzter Monat. Auf dem iPhone über das Teilen-Menü „In Dateien sichern“ in den Ordner „Health App Export“, vorhandene ersetzen. Am Mac in Chrome oder Edge einmal „Vault-Ordner verbinden“, danach schreibt der Export direkt in den Ordner. In Safari als Download.
- **Später, automatisch:** Kurzbefehl nach dem Health-Abgleich. Dafür kommt eine Server-Funktion `vault-export` dazu, die dieselbe Funktion `monthFile` nutzt, und ein Kurzbefehl mit „Datei sichern“ in den Vault-Ordner. Geplant, wenn die App ein paar Wochen im Einsatz ist.

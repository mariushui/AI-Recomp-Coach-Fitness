# Plan: Krafttraining-Modul

Entwurf vom 4. November 2026, Entscheidungen offen (siehe unten).

## Ziel

Krafttraining im Keller ohne Internet erfassen, mit den Werten der Vorwoche als Schatten im Feld. Im Verlauf Volumen pro Woche je Einheitsart, je Übung und je Muskelgruppe sehen.

## Einheitsarten

Push, Pull, Beine, Ganzkörper (mixed), Oberkörper, Unterkörper, Arme, Rumpf, Einzelübungen. Im Verlauf wählbar sind nur die Arten, die in den letzten 8 Wochen vorkamen.

## Übungskatalog

Startliste mit ca. 40 Übungen, je Übung Muster (horizontal drücken, vertikal drücken, horizontal ziehen, vertikal ziehen, Kniebeuge, Hinge, Ausfallschritt, Isolation, Rumpf, Tragen) und primäre Muskelgruppe. Eigene Übungen lassen sich anlegen.

## Eingabe

1. Einheit starten: Vorlage wählen (z. B. „Push A“) oder frei.
2. Je Übung Zeilen für Aufwärmsätze und Arbeitssätze. Gewicht und Wdh. der letzten Einheit derselben Vorlage stehen grau als Platzhalter im Feld.
3. Tippen auf den Haken übernimmt den Schattenwert. Nur Abweichungen tippen.
4. Speichern lokal auf dem Gerät, Abgleich mit Supabase, sobald wieder Netz da ist.

## Kennzahlen im Verlauf

- Volumen = Summe Gewicht x Wdh. der Arbeitssätze, pro Woche, je Einheitsart und je Übung
- Harte Sätze pro Muskelgruppe und Woche mit Ampel (unter 10, 10 bis 20, über 20)
- Geschätztes 1RM je Hauptübung (Epley: Gewicht x (1 + Wdh./30))
- Bestwerte (PR) markiert

## Umsetzung (Stand 4. November 2026)

- Tab „Kraft“: Training starten (Vorlagen Pull, Push, Beine oder frei), Wochenvolumen je Einheitsart (auswählbar), harte Sätze je Muskelgruppe (diese Woche und Ø der 4 Wochen davor), Verlauf je Übung (Volumen und e1RM), Trainingshistorie mit Veränderung zur letzten Einheit derselben Art.
- Eingabe: Schatten = letzte Einheit mit dieser Übung, sonst Vorlage. Leere Felder übernehmen den Schatten. Gespeichert werden nur abgehakte Sätze, Tippen hakt automatisch ab. Entwurf liegt bei jedem Tastendruck im Gerätespeicher.
- Ohne Netz: Service Worker (`public/sw.js`) hält App, Tailwind und Schriften. Sitzung wird aus dem Gerät gelesen. Speichern geht in die Warteschlange (`lib/offlineQueue.ts`) und wird beim nächsten Online-Moment gesendet. Schattenwerte werden bei jedem App-Start lokal aufgefrischt.
- Vorlagen und eigene Übungen liegen vorerst nur im Gerät (localStorage). Sync über Supabase ist ein späterer Schritt.
- Bestwerte (PR) markieren: noch offen.

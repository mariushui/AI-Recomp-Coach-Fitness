# Recomp Coach

Persönliche Web-App, um Gesundheit, Körperwerte und Training mit minimalem Aufwand zu erfassen.
Ziele: lange gesund bleiben, Körperfett senken bei Muskelaufbau, besser werden in Tennis, Laufen und Capoeira.

**Phase 1 (aktuell): Datensammlung**

- Sprechen oder tippen, die KI zerlegt den Text in Mahlzeiten, Trainings, Befinden und Messwerte. Du bestätigst vor dem Speichern.
- Apple Health (Gewicht, Körperfett, Schlaf, HRV, Ruhepuls, VO2max) per iOS-Kurzbefehl.
- Tagesansicht und Verläufe: Gewicht im 7-Tage-Schnitt, Protein pro Tag, Training pro Woche nach Sportart, Schlaf und HRV.
- Login per E-Mail-Code, jeder sieht nur seine eigenen Daten. Export und Löschen aller Daten.

**Phase 2 (geplant): Planung und Coaching**

## Dokumentation

- [Einrichtung](docs/SETUP.md)
- [Apple Health per Kurzbefehl](docs/KURZBEFEHL.md)
- [Datenmodell](docs/DATENMODELL.md)
- [Regeln für Claude Code und AI Studio](AGENTS.md)

## Entwicklung

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test && npm run typecheck && npm run build
```

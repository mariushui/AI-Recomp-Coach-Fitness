# Literatur: Body Recomposition

Stand 4. November 2026.

## Zweck

Diese Sammlung ist Hintergrund für die Entwicklung der App. Sie wird in der App nicht angezeigt.

Sie hält fest, worauf Zielwerte, Kennzahlen und Begriffe in der App beruhen. Wer eine Voreinstellung ändert (zum Beispiel Proteinziel oder Satzzahl pro Woche), prüft hier zuerst die Quelle.

Body Recomposition heißt: Körperfett sinkt und Muskelmasse steigt im selben Zeitraum.

## Aufbau

| Datei | Inhalt |
|---|---|
| `README.md` | Zweck, Aufbau, Bewertungsskala, Verzeichnis |
| `huberman.md` | Huberman Lab Folgen mit Bezug zu Recomposition, getrennt nach Huberman und Gast |
| `studien.md` | 20 wissenschaftliche Arbeiten mit Zitat, DOI, Kernaussagen und Bedeutung für die App |
| `begriffe.md` | Glossar: Splits, Bewegungsmuster, Übungskatalog, Volumen, Ernährung, Messgrößen |
| `ableitungen-fuer-die-app.md` | Konkrete Folgerungen: KPIs, Standardziele, Metadaten, was die App nicht tun soll |

Die frühere Datei `docs/RECHERCHE_HUBERMAN.md` verweist nur noch hierher.

## Bewertung der Evidenz

Jeder Eintrag trägt ein Kürzel. Je weiter oben, desto belastbarer.

| Kürzel | Art | Bedeutung |
|---|---|---|
| **MA** | Metaanalyse, systematische Übersicht | Fasst viele Studien statistisch zusammen. Stärkste Stufe, aber nur so gut wie die eingeschlossenen Studien. |
| **RCT** | Randomisierte kontrollierte Studie | Einzelne Studie mit Zufallszuteilung. Aussagekräftig, oft kleine Stichproben und kurze Dauer. |
| **PS** | Positionspapier einer Fachgesellschaft | Konsens mehrerer Fachleute auf Basis der Literatur, zum Beispiel ISSN. |
| **REV** | Narratives Review | Übersicht ohne systematische Suche. Gute Einordnung, Auswahl der Studien subjektiv. |
| **STUDIE** | Nicht randomisierte oder sehr kleine Studie | Hinweis, kein Beleg. |
| **EXP** | Buch, Expertenmeinung | Praxiswissen, teils ohne direkte Studienbasis. |
| **POD** | Podcast | Aussagen aus Gesprächen. Zahlen oft gerundet oder aus dem Gedächtnis. |

Zusätzliche Markierungen:

- **unsicher**: Angabe stammt aus Sekundärquellen oder automatischen Transkripten und wurde nicht am Original geprüft.
- **nicht verifiziert**: Arbeit oder Detail konnte nicht gefunden werden. Steht in der Liste nur als offener Punkt.

## Verzeichnis

### Huberman Lab (`huberman.md`)

- H1. Fitness Toolkit, Folge 94, und Foundational Fitness Protocol (Huberman selbst). POD
- H2. Andy Galpin: How to Build Strength, Muscle Size & Endurance (2022). POD
- H3. Andy Galpin Guest Series, 6 Folgen (2023). POD
- H4. Layne Norton: The Science of Eating for Health, Fat Loss & Lean Muscle (2022). POD
- H5. Layne Norton: Tools for Nutrition & Fitness (2024). POD
- H6. Jeff Cavaliere: Optimize Your Exercise Program with Science-Based Tools (2022). POD
- H7. Casey Means: Metabolism, Hormone & Blood Sugar Regulation (2024). POD

### Studien (`studien.md`)

1. Barakat et al. 2020: Recomposition ist auch bei Trainierten möglich. REV
2. Morton et al. 2018: Protein plus Training, Plateau um 1,6 g/kg. MA
3. Longland et al. 2016: 2,4 g/kg im starken Defizit, Muskelaufbau trotz Defizit. RCT
4. Schoenfeld, Ogborn, Krieger 2017: Mehr Sätze pro Woche, mehr Hypertrophie. MA
5. Schoenfeld und Aragon 2018: 0,4 g/kg pro Mahlzeit, mindestens 4 Mahlzeiten. REV
6. Helms, Aragon, Fitschen 2014: Wettkampfvorbereitung, 2,3 bis 3,1 g/kg fettfreie Masse. REV
7. Helms, Zinn, Rowlands, Brown 2014: Protein im Defizit bei schlanken Trainierten. MA (systematisch)
8. Israetel et al. 2021: Volumen-Landmarken MV, MEV, MAV, MRV. EXP
9. Schoenfeld 2010: Mechanismen der Hypertrophie. REV
10. Grgic et al. 2022: Training bis zum Versagen ist nicht nötig. MA
11. Refalo et al. 2023: Nähe zum Muskelversagen und Hypertrophie. MA
12. Robinson et al. 2024: Dosis-Wirkung RIR, Kraft und Hypertrophie. MA
13. Pelland et al. 2026: Volumen und Frequenz, direkte und indirekte Sätze. MA
14. Iraki et al. 2019: Ernährung in der Aufbauphase. REV
15. Murphy und Koehler 2022: Energiedefizit bremst Muskelzuwachs, Grenze um 500 kcal. MA
16. Jäger et al. 2017: ISSN Positionspapier Protein. PS
17. Aragon et al. 2017: ISSN Positionspapier Diäten und Körperzusammensetzung. PS
18. Antonio et al. 2015: 3,4 g/kg Protein bei Trainierten. STUDIE
19. Maeo et al. 2021 und 2023: Training in gedehnter Position (Beinbeuger, Trizeps). RCT
20. Kassiano et al. 2023, Pedrosa et al. 2022, Wolf et al. 2023: Bewegungsumfang und Teilwiederholungen. MA, RCT

### Weitere Dateien

- `begriffe.md`: Glossar mit rund 50 Übungen.
- `ableitungen-fuer-die-app.md`: Umsetzung in der App.

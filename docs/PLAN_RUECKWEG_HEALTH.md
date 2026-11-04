# Plan: Rückweg App nach Apple Health

Stand 4. November 2026. Nächster Ausbauschritt nach dem Kraftmodul.

## Ziel

Was die App erhebt oder berechnet und Apple nicht hat, schreibt der Kurzbefehl nach Apple Health zurück. So sehen Health und andere Apps die Werte auch.

## Was zurückgeht

**Körpermaße (Health kennt sie, misst sie aber nicht selbst):**
- Taillenumfang (Health-Typ Taillenumfang)
- Körperfettanteil aus den Hautfalten, nur wenn `body_fat_method = hautfalten`
- Magere Körpermasse, berechnet aus Gewicht und KFA

Brust, Hüfte, Oberarm und die einzelnen Hautfalten kennt Health nicht. Sie bleiben nur in der App.

**Ernährung (heute schon: Nahrungsenergie, Protein, Kohlenhydrate, Fett, Blutzucker):**
Neu aus der Essensanalyse, sobald die KI sie mitschätzt: Ballaststoffe, Zucker, gesättigte, einfach und mehrfach ungesättigte Fette, Cholesterin, Natrium, Kalium, Calcium, Eisen, Magnesium, Zink, Selen, Jod, Kupfer, Mangan, Phosphor, Vitamin A, B1 (Thiamin), B6, B12, C, D, E, K, Wasser, Koffein, Alkohol.

## Schritte

1. Datenmodell `meal`: Feld `micros` (Objekt, Schlüssel je Nährstoff, Einheit fest je Schlüssel). In `docs/DATENMODELL.md` beschreiben.
2. KI-Prompt: Mikronährstoffe nur schätzen, wenn Lebensmittel und Menge klar sind, sonst weglassen. Sicherheit wie bei den Makros.
3. Edge Function `health-export`: neue Typen ausliefern, Einheiten passend zu Health (mg, µg, g, ml).
4. Kurzbefehl Stufe 3: je Typ „Health-Messung protokollieren“. Typnamen vorher aus einem iCloud-Export ablesen, wie bei den Lese-Aktionen.
5. Doppelte vermeiden: jede Probe trägt die Eintrags-ID, der Server merkt sich `health_exported_at`.

## Offene Fragen

- Mikronährstoffe aus KI-Schätzungen sind grob. Ob sie in Health landen sollen oder nur in der App, entscheidet Marius nach ein paar Wochen Probelauf.

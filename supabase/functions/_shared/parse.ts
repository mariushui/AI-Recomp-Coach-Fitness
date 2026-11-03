// Prompt, Antwort-Schema und Nachbearbeitung für das Zerlegen von Freitext in Einträge.
// Wird von der Edge Function parse-log genutzt. Reines TypeScript, getestet in tests/parse.test.ts.

import { ENTRY_KINDS, SPORTS, normalizeData, type EntryKind, type EntryDataByKind } from './domain.ts';

export interface ParsedEntry<K extends EntryKind = EntryKind> {
  kind: K;
  occurred_at: string;
  data: EntryDataByKind[K];
}

export interface ParseResult {
  entries: ParsedEntry[];
  questions: string[];
}

const S = (description?: string) => ({ type: 'STRING', ...(description ? { description } : {}) });
const N = (description?: string) => ({ type: 'NUMBER', ...(description ? { description } : {}) });
const E = (values: readonly string[]) => ({ type: 'STRING', enum: [...values] });

// Gemini responseSchema (OpenAPI-Teilmenge). Kein oneOf, deshalb je Art ein optionales Unterobjekt.
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: E(ENTRY_KINDS.filter((k) => k !== 'health')),
          occurred_at: S('ISO 8601 mit Zeitzonen-Offset'),
          meal: {
            type: 'OBJECT',
            properties: {
              description: S(),
              meal_type: E(['fruehstueck', 'mittag', 'abend', 'snack', 'shake']),
              items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: S(), amount: S() } } },
              protein_g: N(),
              kcal: N(),
              carbs_g: N(),
              fat_g: N(),
              confidence: E(['low', 'medium', 'high']),
            },
          },
          workout: {
            type: 'OBJECT',
            properties: {
              sport: E(SPORTS),
              sport_label: S(),
              session_type: E(['training', 'match', 'stunde', 'frei', 'wettkampf']),
              duration_min: N(),
              rpe: N('1-10'),
              focus: S(),
              high: S(),
              low: S(),
              result: S(),
              opponent: S(),
              distance_km: N(),
              avg_pace: S(),
              avg_hr: N(),
              exercises: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: { exercise: S(), sets: N(), reps: N(), weight_kg: N(), rpe: N() },
                },
              },
              notes: S(),
            },
          },
          plan: {
            type: 'OBJECT',
            properties: {
              sport: E(SPORTS),
              sport_label: S(),
              session_type: E(['training', 'match', 'stunde', 'frei', 'wettkampf']),
              duration_min: N(),
              rpe: N('geplante Intensität 1-10'),
              focus: S(),
              goal: S('messbares Ziel der Einheit'),
              distance_km: N(),
              exercises: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: { exercise: S(), sets: N(), reps: N(), weight_kg: N() },
                },
              },
              notes: S(),
            },
          },
          body: {
            type: 'OBJECT',
            properties: { weight_kg: N(), body_fat_pct: N(), waist_cm: N(), bp_systolic: N(), bp_diastolic: N() },
          },
          wellbeing: {
            type: 'OBJECT',
            properties: {
              energy: N('1-5'),
              mood: N('1-5'),
              sleep_quality: N('1-5'),
              stress: N('1-5'),
              soreness: N('1-5'),
              soreness_areas: { type: 'ARRAY', items: S() },
              joint_pain: N('1-5'),
              joint_pain_areas: { type: 'ARRAY', items: S() },
              focus: N('1-5'),
              appetite: N('1-5'),
              notes: S(),
            },
          },
          lab: { type: 'OBJECT', properties: { name: S(), value: N(), unit: S() } },
          note: { type: 'OBJECT', properties: { text: S(), tags: { type: 'ARRAY', items: S() } } },
        },
        required: ['kind', 'occurred_at'],
      },
    },
    questions: { type: 'ARRAY', items: S('Kurze Rückfrage zu wichtigen fehlenden Angaben') },
  },
  required: ['entries'],
};

export function buildSystemPrompt(): string {
  return `Du zerlegst kurze, oft diktierte Notizen eines Sportlers in strukturierte Tagebuch-Einträge.
Ziele des Nutzers: lange gesund bleiben, Körperfett senken und Muskeln aufbauen, besser werden in Tennis, Laufen und Capoeira.

Regeln:
- Ein Eintrag pro Mahlzeit, pro Trainingseinheit, pro Messung. Befinden in einem Eintrag zusammenfassen.
- occurred_at: Leite die Zeit aus dem Text ab ("heute morgen", "gestern Abend", "nach dem Training"). Ohne Angabe die aktuelle Zeit verwenden. Immer mit dem Zeitzonen-Offset aus dem Kontext.
- Mahlzeiten: Zutaten mit Menge auflisten. Protein, kcal, Kohlenhydrate und Fett realistisch schätzen. Protein ist am wichtigsten. confidence = low, wenn Mengen fehlen.
- Training: sport aus der Liste wählen, sonst "sonstiges" mit sport_label. Bei Tennis und Capoeira focus, high und low erfassen, wenn genannt. Bei Kraft jede Übung mit Sätzen, Wiederholungen, Gewicht in kg. Bei Laufen Distanz und Pace.
- Vorhaben sind plan, nicht workout: alles in der Zukunft oder mit "will", "plane", "vorgenommen", "morgen", "nächste Woche", "am Donnerstag".
  occurred_at ist dann der geplante Zeitpunkt. Ohne Uhrzeit 18:00 Uhr. Wochentage beziehen sich auf die kommende Woche ab heute.
  Ein Wochenplan ergibt einen plan-Eintrag pro Einheit. goal nur, wenn ein messbares Ziel genannt ist.
- RPE 1-10. Befinden-Skalen 1-5 (5 = viel davon). Übersetze Wörter: "top" = 5, "gut" = 4, "ok" = 3, "mäßig" = 2, "schlecht" = 1.
- Erfinde nichts. Fehlende Werte weglassen.
- questions: höchstens 2 kurze Rückfragen, nur wenn eine wichtige Angabe fehlt (z. B. Dauer eines Trainings, Menge einer Proteinquelle). Sonst leer.
- Alles, was in keine Kategorie passt, als note.
- Antworte auf Deutsch.`;
}

export function buildUserPrompt(text: string, nowIso: string, timeZone: string): string {
  return `Kontext: Jetzt ist ${nowIso} (Zeitzone ${timeZone}).\n\nNotiz:\n${text}`;
}

const hasOffset = (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s);

/** Prüft und säubert die KI-Antwort. Ungültige Einträge fallen weg. */
export function normalizeParseResult(raw: any, nowIso: string): ParseResult {
  const entries: ParsedEntry[] = [];
  const list = Array.isArray(raw?.entries) ? raw.entries : [];
  for (const e of list) {
    const kind = e?.kind as EntryKind;
    if (!ENTRY_KINDS.includes(kind) || kind === 'health') continue;
    const data = normalizeData(kind, e[kind]);
    if (!data) continue;
    const at = typeof e.occurred_at === 'string' && hasOffset(e.occurred_at) ? e.occurred_at : nowIso;
    entries.push({ kind, occurred_at: at, data });
  }
  const questions = Array.isArray(raw?.questions)
    ? raw.questions.filter((q: unknown) => typeof q === 'string' && q.trim()).slice(0, 2)
    : [];
  return { entries, questions };
}

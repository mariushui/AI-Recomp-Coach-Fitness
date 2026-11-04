// Nährwerte einer Mahlzeit neu schätzen: Text für die KI bauen und das Ergebnis in die Mahlzeit übernehmen.
// Reine Funktionen, getestet in tests/backgroundJobs.test.ts.
import { sumMicros } from './micros';

/** Text für die KI aus Beschreibung und Zutaten. Leer, wenn nichts da ist. */
export function recalcText(d: any): string {
  const items = Array.isArray(d?.items) ? d.items.map((i: any) => (i.amount ? `${i.amount} ${i.name}` : i.name)).join(', ') : '';
  const text = [d?.description, items && `Zutaten: ${items}`].filter(Boolean).join('. ');
  return text.trim() ? `Nur Nährwerte schätzen, eine Mahlzeit: ${text}` : '';
}

/** Nährwerte aus den erkannten Mahlzeiten übernehmen. Zeit, Mahlzeit-Typ und Text bleiben. */
export function applyRecalc(d: any, meals: any[]): any {
  const sum = (k: string) => {
    const v = meals.map((m) => m[k]).filter((x) => typeof x === 'number');
    return v.length ? Math.round(v.reduce((a: number, b: number) => a + b, 0)) : undefined;
  };
  const next: any = { ...d, protein_g: sum('protein_g'), kcal: sum('kcal'), carbs_g: sum('carbs_g'), fat_g: sum('fat_g') };
  const newItems = meals.flatMap((m) => m.items ?? []);
  if (newItems.length && !d?.items?.length) next.items = newItems;
  next.confidence = meals[0]?.confidence;
  next.micros = sumMicros(meals.map((m) => m.micros));
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return next;
}

// Bereitet Einträge für den Rückweg nach Apple Health auf. Reines TypeScript, getestet in tests/healthExport.test.ts.
// Übertragen werden nur Werte, für die Apple Health einen passenden Typ hat:
// Ernährung (Energie, Protein, Kohlenhydrate, Fett) und Blutzucker. Trainings bleiben bei der Watch.

export interface ExportRow {
  id: string;
  kind: string;
  occurred_at: string;
  data: any;
}

export interface Sample {
  value: number;
  date: string; // ISO 8601
}

export interface HealthExport {
  energy: Sample[]; // kcal
  protein: Sample[]; // g
  carbs: Sample[]; // g
  fat: Sample[]; // g
  glucose: Sample[]; // mg/dL
  receipt: string; // kommagetrennte IDs, schickt der Kurzbefehl nach dem Schreiben zurück
  meals: number; // Mahlzeiten mit mindestens einem Wert
  count: number; // Anzahl Health-Werte insgesamt
}

const MG_DL_PER_MMOL_L = 18.016;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_RECEIPT_IDS = 500;

const positive = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Blutzucker in mg/dL. Andere Laborwerte (HbA1c, LDL, Vitamin D) kennt Apple Health nicht als Messwert. */
export function glucoseMgDl(data: any): number | undefined {
  const name = typeof data?.name === 'string' ? data.name.toLowerCase() : '';
  if (!/(glukose|glucose|blutzucker)/.test(name) || /hba1c/.test(name)) return undefined;
  const value = positive(data?.value);
  if (value === undefined) return undefined;
  const unit = typeof data?.unit === 'string' ? data.unit.toLowerCase().replace(/\s/g, '') : '';
  let mg: number | undefined;
  if (unit === 'mg/dl') mg = value;
  else if (unit === 'mmol/l') mg = value * MG_DL_PER_MMOL_L;
  if (mg === undefined || mg < 20 || mg > 600) return undefined; // ohne Einheit oder unplausibel: nicht raten
  return Math.round(mg);
}

export function buildHealthExport(rows: ExportRow[]): HealthExport {
  const out: HealthExport = { energy: [], protein: [], carbs: [], fat: [], glucose: [], receipt: '', meals: 0, count: 0 };
  const ids: string[] = [];
  for (const r of rows) {
    ids.push(r.id);
    const date = r.occurred_at;
    if (r.kind === 'meal') {
      const kcal = positive(r.data?.kcal);
      const protein = positive(r.data?.protein_g);
      const carbs = positive(r.data?.carbs_g);
      const fat = positive(r.data?.fat_g);
      if (kcal !== undefined) out.energy.push({ value: Math.round(kcal), date });
      if (protein !== undefined) out.protein.push({ value: round(protein), date });
      if (carbs !== undefined) out.carbs.push({ value: round(carbs), date });
      if (fat !== undefined) out.fat.push({ value: round(fat), date });
      if ([kcal, protein, carbs, fat].some((v) => v !== undefined)) out.meals++;
    } else if (r.kind === 'lab') {
      const mg = glucoseMgDl(r.data);
      if (mg !== undefined) out.glucose.push({ value: mg, date });
    }
  }
  out.receipt = ids.join(',');
  out.count = out.energy.length + out.protein.length + out.carbs.length + out.fat.length + out.glucose.length;
  return out;
}

/** Liest die Quittung des Kurzbefehls. Ungültige Teile fallen weg. */
export function parseReceipt(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const ids = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => UUID.test(s));
  return [...new Set(ids)].slice(0, MAX_RECEIPT_IDS);
}

export function exportSummary(e: HealthExport): string {
  if (e.count === 0) return 'Nichts Neues für Apple Health.';
  const parts: string[] = [];
  if (e.meals) parts.push(`${e.meals} ${e.meals === 1 ? 'Mahlzeit' : 'Mahlzeiten'}`);
  if (e.glucose.length) parts.push(`${e.glucose.length}x Blutzucker`);
  return `${parts.join(' und ')} für Apple Health bereit.`;
}

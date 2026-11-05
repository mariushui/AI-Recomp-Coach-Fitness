// Export für den Obsidian-Vault: eine Markdown-Datei pro Monat mit allen Werten.
// Reine Funktion, getestet in tests/vaultExport.test.ts. Die App nutzt sie für den Export in den Einstellungen,
// später auch der Kurzbefehl über eine Server-Funktion. Dateien werden immer ganz überschrieben, nie fortgeschrieben,
// damit Korrekturen in der App automatisch im Vault ankommen.

import { MICROS, SPORT_LABEL, type BodyData, type Entry, type MealData, type WellbeingData, type WorkoutData } from '../supabase/functions/_shared/domain';
import { dailyStats, type DayStats } from './stats';
import { dailyRecovery, dailyStrain } from './recovery';
import { setsOf, summarizeSets } from './strength';
import { slotOf, SLOT_LABEL } from './meals';
import { microsByDay, fmtMicro } from './micros';
import { skinfoldSum } from './bodyfat';
import { addDays, dayKey } from './time';

const n = (v: number | undefined, digits = 0) =>
  v === undefined || Number.isNaN(v) ? '' : v.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const mean = (list: (number | undefined)[]) => {
  const v = list.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};
const time = (iso: string) => iso.slice(11, 16);
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dayLabel = (day: string) => {
  const d = new Date(day + 'T12:00:00');
  return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
};
const esc = (s: string | undefined) => (s ?? '').replace(/\|/g, '/').replace(/\n+/g, ' ').trim();

export interface VaultFile {
  name: string; // z. B. "2026-11.md"
  content: string;
}

/**
 * Monatsdatei. entries: alle Einträge des Monats plus 30 Tage davor (für die Erholung). month: "YYYY-MM".
 * now: Zeitpunkt des Exports, steht im Frontmatter.
 */
export function monthFile(entries: Entry[], month: string, now: Date = new Date()): VaultFile {
  const [y, m] = month.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  const extFrom = addDays(from, -30);
  const ext = dailyStats(entries, extFrom, to);
  const rec = dailyRecovery(ext);
  const strain = dailyStrain(entries, ext);
  const recByDay = new Map(ext.map((d, i) => [d.day, rec[i]]));
  const today = dayKey(now);
  const days: (DayStats & { recovery?: number; strain?: number })[] = ext
    .filter((d) => d.day >= dayKey(from) && d.day <= today)
    .map((d) => ({ ...d, recovery: recByDay.get(d.day), strain: strain.get(d.day) }));
  const inMonth = entries
    .filter((e) => e.occurred_at.slice(0, 7) === month)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const workouts = inMonth.filter((e): e is Entry<'workout'> => e.kind === 'workout');
  const meals = inMonth.filter((e): e is Entry<'meal'> => e.kind === 'meal');
  const bodies = inMonth.filter((e): e is Entry<'body'> => e.kind === 'body');
  const notes = inMonth.filter((e) => e.kind === 'wellbeing' || e.kind === 'note' || e.kind === 'lab');
  const micro = microsByDay(meals);

  const fm = [
    '---',
    'typ: gesundheit-recomp',
    `monat: ${month}`,
    `stand: ${dayKey(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    'quelle: Chakka',
    `gewicht_kg_mittel: ${n(mean(days.map((d) => d.weight)), 1) || 'leer'}`,
    `kfa_prozent_mittel: ${n(mean(days.map((d) => d.bodyFat)), 1) || 'leer'}`,
    `schlaf_h_mittel: ${n(mean(days.map((d) => d.sleepH)), 1) || 'leer'}`,
    `erholung_mittel: ${n(mean(days.map((d) => d.recovery))) || 'leer'}`,
    `protein_g_mittel: ${n(mean(days.map((d) => d.protein))) || 'leer'}`,
    `kcal_mittel: ${n(mean(days.map((d) => d.kcal))) || 'leer'}`,
    `trainings: ${workouts.length}`,
    'tags: [gesundheit, recomp]',
    '---',
    '',
    `# Recomp ${month}`,
    '',
    'Automatisch erzeugt aus Chakka. Bei jedem Export ganz überschrieben, Änderungen hier gehen verloren.',
    '',
  ];

  const tage = [
    '## Tage',
    '',
    '| Datum | Gewicht kg | KFA % | Taille cm | Schlaf h | HRV ms | Ruhepuls | Erholung | Belastung | Schritte | aktiv kcal | kcal | Protein g | KH g | Fett g | Training min |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...days.map((d) =>
      `| ${dayLabel(d.day)} | ${n(d.weight, 1)} | ${n(d.bodyFat, 1)} | ${n(d.waist, 1)} | ${n(d.sleepH, 1)} | ${n(d.hrv)} | ${n(d.restingHr)} | ${n(d.recovery)} | ${n(d.strain, 1)} | ${n(d.steps)} | ${n(d.activeKcal)} | ${n(d.kcal)} | ${n(d.protein)} | ${n(d.carbs)} | ${n(d.fat)} | ${n(d.trainingMin)} |`,
    ),
    '',
  ];

  const training = ['## Training', ''];
  if (!workouts.length) training.push('Keine Trainings.', '');
  for (const e of workouts) {
    const w = e.data as WorkoutData;
    const name = w.sport === 'sonstiges' ? w.sport_label ?? 'Training' : SPORT_LABEL[w.sport];
    const head = [name, w.template, w.duration_min !== undefined && `${n(w.duration_min)} min`, w.rpe !== undefined && `RPE ${n(w.rpe)}`, w.kcal !== undefined && `${n(w.kcal)} kcal`, w.distance_km !== undefined && `${n(w.distance_km, 2)} km`]
      .filter(Boolean)
      .join(' · ');
    training.push(`### ${dayLabel(dayKey(e.occurred_at))} ${time(e.occurred_at)} · ${head}`, '');
    for (const x of w.exercises ?? []) training.push(`- ${esc(x.exercise)}: ${summarizeSets(setsOf(x))}`);
    for (const f of w.focus_notes ?? []) training.push(`- Fokus ${esc(f.focus)}${f.note ? `: ${esc(f.note)}` : ''}`);
    if (!w.focus_notes?.length && w.focus) training.push(`- Fokus: ${esc(w.focus)}`);
    if (w.high) training.push(`- Highlight: ${esc(w.high)}`);
    if (w.low) training.push(`- Flop: ${esc(w.low)}`);
    if (w.result) training.push(`- Ergebnis: ${esc(w.result)}`);
    if (w.notes) training.push(`- Notizen: ${esc(w.notes)}`);
    training.push('');
  }

  const ernaehrung = ['## Ernährung', ''];
  const mealDays = [...new Set(meals.map((e) => dayKey(e.occurred_at)))];
  if (!mealDays.length) ernaehrung.push('Keine Mahlzeiten.', '');
  for (const day of mealDays) {
    const d = days.find((x) => x.day === day);
    ernaehrung.push(`### ${dayLabel(day)} · ${n(d?.kcal)} kcal · ${n(d?.protein)} g Protein · ${n(d?.carbs)} g KH · ${n(d?.fat)} g Fett`, '');
    for (const e of meals.filter((x) => dayKey(x.occurred_at) === day)) {
      const md = e.data as MealData;
      const macros = [md.protein_g !== undefined && `${n(md.protein_g)} g P`, md.carbs_g !== undefined && `${n(md.carbs_g)} g KH`, md.fat_g !== undefined && `${n(md.fat_g)} g F`, md.kcal !== undefined && `${n(md.kcal)} kcal`]
        .filter(Boolean)
        .join(', ');
      ernaehrung.push(`- ${time(e.occurred_at)} ${SLOT_LABEL[slotOf(e)]}: ${esc(md.description || md.items?.map((i) => i.name).join(', '))}${macros ? ` (${macros})` : ''}`);
    }
    const mi = micro.get(day);
    if (mi && mi.withMicros) {
      const parts = MICROS.filter((x) => mi.micros[x.key] !== undefined).map((x) => `${x.label} ${fmtMicro(x.key, mi.micros[x.key])}`);
      ernaehrung.push(`- Mikronährstoffe (Schätzung aus ${mi.withMicros} von ${mi.meals} Mahlzeiten): ${parts.join(', ')}`);
    }
    ernaehrung.push('');
  }

  const koerper = ['## Körpermaße', ''];
  const measured = bodies.filter((e) => {
    const b = e.data as BodyData;
    return b.waist_cm || b.chest_cm || b.hip_cm || b.arm_cm || b.skinfolds;
  });
  if (!measured.length) koerper.push('Keine Messung in diesem Monat.', '');
  else {
    koerper.push('| Datum | Taille cm | Brust cm | Hüfte cm | Arm cm | Hautfalten Summe mm | KFA % | Methode |', '|---|---|---|---|---|---|---|---|');
    for (const e of measured) {
      const b = e.data as BodyData;
      koerper.push(`| ${dayLabel(dayKey(e.occurred_at))} | ${n(b.waist_cm, 1)} | ${n(b.chest_cm, 1)} | ${n(b.hip_cm, 1)} | ${n(b.arm_cm, 1)} | ${n(skinfoldSum(b.skinfolds), 1)} | ${n(b.body_fat_pct, 1)} | ${b.body_fat_method ?? ''} |`);
    }
    koerper.push('');
  }

  const befinden = ['## Befinden, Blutwerte, Notizen', ''];
  if (!notes.length) befinden.push('Keine Einträge.', '');
  for (const e of notes) {
    const head = `- ${dayLabel(dayKey(e.occurred_at))} ${time(e.occurred_at)}`;
    if (e.kind === 'wellbeing') {
      const w = e.data as WellbeingData;
      const parts = [
        w.energy && `Energie ${w.energy}/5`,
        w.mood && `Stimmung ${w.mood}/5`,
        w.sleep_quality && `Schlafqualität ${w.sleep_quality}/5`,
        w.stress && `Stress ${w.stress}/5`,
        w.soreness && `Muskelkater ${w.soreness}/5${w.soreness_areas?.length ? ` (${w.soreness_areas.join(', ')})` : ''}`,
        w.joint_pain && `Gelenke ${w.joint_pain}/5${w.joint_pain_areas?.length ? ` (${w.joint_pain_areas.join(', ')})` : ''}`,
        w.notes && esc(w.notes),
      ].filter(Boolean);
      befinden.push(`${head} Befinden: ${parts.join(', ')}`);
    } else if (e.kind === 'lab') {
      const l = e.data as any;
      befinden.push(`${head} Blutwert: ${esc(l.name)} ${n(l.value, 2)} ${esc(l.unit)}`);
    } else befinden.push(`${head} Notiz: ${esc((e.data as any).text)}`);
  }
  befinden.push('');

  return { name: `${month}.md`, content: [...fm, ...tage, ...training, ...ernaehrung, ...koerper, ...befinden].join('\n') };
}

/** Monate, die ein Export enthalten soll: aktueller und vorheriger, damit Korrekturen am Monatsanfang ankommen. */
export function exportMonths(now: Date = new Date()): string[] {
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const p = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`;
  return [prev, cur];
}

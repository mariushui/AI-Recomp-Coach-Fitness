// Körperfett aus der 7-Punkte-Hautfaltenmessung nach Jackson und Pollock (1978, Männer; 1980, Frauen),
// Körperdichte nach Siri (1961) in Prozent umgerechnet. Reine Funktionen, getestet in tests/bodyfat.test.ts.

export const SKINFOLD_SITES = ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdomen', 'suprailiac', 'thigh'] as const;
export type SkinfoldSite = (typeof SKINFOLD_SITES)[number];
export type Skinfolds = Partial<Record<SkinfoldSite, number>>;

export const SKINFOLD_LABEL: Record<SkinfoldSite, { name: string; how: string }> = {
  chest: { name: 'Brust', how: 'diagonal, halbe Strecke zwischen Achselfalte und Brustwarze' },
  midaxillary: { name: 'Achsel', how: 'senkrecht, mittlere Achsellinie auf Höhe des Brustbeinendes' },
  triceps: { name: 'Trizeps', how: 'senkrecht, Rückseite Oberarm, Mitte zwischen Schulter und Ellbogen' },
  subscapular: { name: 'Schulterblatt', how: 'diagonal, 1 bis 2 cm unter der Schulterblattspitze' },
  abdomen: { name: 'Bauch', how: 'senkrecht, 2 cm rechts neben dem Bauchnabel' },
  suprailiac: { name: 'Hüfte', how: 'diagonal, direkt über dem Beckenkamm' },
  thigh: { name: 'Oberschenkel', how: 'senkrecht, Vorderseite, Mitte zwischen Leiste und Knie' },
};

/** Summe der 7 Falten in mm, nur wenn alle 7 gemessen sind. */
export function skinfoldSum(s: Skinfolds | undefined): number | undefined {
  if (!s) return undefined;
  let sum = 0;
  for (const k of SKINFOLD_SITES) {
    const v = s[k];
    if (typeof v !== 'number' || !(v > 0)) return undefined;
    sum += v;
  }
  return Math.round(sum * 10) / 10;
}

/** Körperfett in Prozent nach Jackson-Pollock 7. sex: 'm' oder 'w'. */
export function jacksonPollock7(s: Skinfolds | undefined, age: number | undefined, sex: 'm' | 'w' = 'm'): number | undefined {
  const sum = skinfoldSum(s);
  if (sum === undefined || age === undefined || age < 15 || age > 90) return undefined;
  const density =
    sex === 'm'
      ? 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * age
      : 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * age;
  const pct = 495 / density - 450;
  if (!Number.isFinite(pct) || pct < 2 || pct > 60) return undefined;
  return Math.round(pct * 10) / 10;
}

export const MEASURE_INTERVAL_DAYS = 14;

/** Tage seit der letzten Messung von Umfängen oder Hautfalten, undefined wenn es noch keine gibt. */
export function daysSinceMeasurement(entries: { kind: string; occurred_at: string; data: any }[], now: Date = new Date()): number | undefined {
  let last: number | undefined;
  for (const e of entries) {
    if (e.kind !== 'body') continue;
    const d = e.data ?? {};
    const measured = d.waist_cm || d.chest_cm || d.hip_cm || d.arm_cm || skinfoldSum(d.skinfolds);
    if (!measured) continue;
    const t = new Date(e.occurred_at).getTime();
    if (last === undefined || t > last) last = t;
  }
  if (last === undefined) return undefined;
  return Math.floor((now.getTime() - last) / 86_400_000);
}

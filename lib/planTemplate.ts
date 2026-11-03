// Wochenplan: aus festen Einheiten (PlanSlot) werden geplante Einheiten im Kalender.
// Reine Funktionen, getestet in tests/planTemplate.test.ts.

import type { Entry, PlanData, PlanSlot } from '../supabase/functions/_shared/domain';
import { addDays, dayKey, localIso, startOfDay } from './time';

export const slotExternalId = (slotId: string, day: string) => `slot:${slotId}:${day}`;
export const isVirtual = (e: Entry) => e.id.startsWith('slot:');
export const fromSlot = (e: Entry) => Boolean(e.external_id?.startsWith('slot:'));

/** ISO-Wochentag 1 = Montag ... 7 = Sonntag */
export const isoWeekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;

/**
 * Erzeugt für [from, to) je Tag und passender Einheit einen virtuellen plan-Eintrag.
 * Existiert schon ein Eintrag mit derselben external_id (in dieser Woche geändert oder gestrichen),
 * gewinnt dieser und es entsteht kein virtueller Eintrag.
 */
export function expandSlots(slots: PlanSlot[], existing: Entry[], from: Date, to: Date): Entry<'plan'>[] {
  const taken = new Set(existing.map((e) => e.external_id).filter(Boolean));
  const out: Entry<'plan'>[] = [];
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    const day = dayKey(d);
    const wd = isoWeekday(d);
    for (const s of slots) {
      if (s.weekday !== wd) continue;
      if (day < s.valid_from) continue;
      if (s.valid_to && day > s.valid_to) continue;
      const ext = slotExternalId(s.id, day);
      if (taken.has(ext)) continue;
      const [h, m] = s.time.split(':').map(Number);
      const at = new Date(d);
      at.setHours(h || 0, m || 0, 0, 0);
      out.push({ id: ext, user_id: s.user_id ?? '', kind: 'plan', occurred_at: localIso(at), source: 'manual', data: s.data, external_id: ext });
    }
  }
  return out;
}

/** Ohne gestrichene Einheiten, für Anzeige und Statistik */
export const visiblePlans = (entries: Entry[]) =>
  entries.filter((e) => !(e.kind === 'plan' && (e.data as PlanData).status === 'entfernt'));

/** Erkannte plan-Entwürfe in Einheiten für den Wochenplan umwandeln */
export function slotsFromDrafts(drafts: { occurred_at: string; data: PlanData }[], validFrom: string): Omit<PlanSlot, 'id'>[] {
  return drafts.map((d) => {
    const at = new Date(d.occurred_at);
    const { status, skip_reason, ...data } = d.data;
    return {
      weekday: isoWeekday(at),
      time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
      data,
      valid_from: validFrom,
      valid_to: null,
    };
  });
}

/** Aktive Einheiten am Stichtag, sortiert nach Wochentag und Uhrzeit */
export function activeSlots(slots: PlanSlot[], day: string = dayKey(new Date())): PlanSlot[] {
  return slots
    .filter((s) => !s.valid_to || s.valid_to >= day)
    .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
}

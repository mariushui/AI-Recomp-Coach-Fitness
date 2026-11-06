// Aktionen auf einer geplanten Einheit. Einheiten aus dem Wochenplan existieren oft nur virtuell:
// dann entsteht ein eigener Eintrag mit derselben Kennung, der den Wochenplan nur für diesen Tag überschreibt.
import type { Entry, PlanData, Sport } from '../supabase/functions/_shared/domain';
import { deleteEntry, insertEntries, updateEntry } from './entries';
import { fromSlot, isVirtual } from './planTemplate';

async function writePlan(plan: Entry<'plan'>, data: PlanData): Promise<void> {
  if (isVirtual(plan)) await insertEntries([{ kind: 'plan', occurred_at: plan.occurred_at, data, source: 'manual', external_id: plan.external_id }]);
  else await updateEntry(plan.id, { data });
}

/** Einheit entfernen. Aus dem Wochenplan nur für diesen Tag, sonst ganz löschen. */
export async function removePlan(plan: Entry<'plan'>): Promise<void> {
  if (isVirtual(plan) || fromSlot(plan)) return writePlan(plan, { ...(plan.data as PlanData), status: 'entfernt' });
  await deleteEntry(plan.id);
}

/** Neue Sportart für diesen Tag. Dauer, Intensität und Notizen bleiben. Fokus, Ziel, Übungen und Art gehören zur alten Sportart. */
export function swappedData(data: PlanData, sport: Sport): PlanData {
  const { duration_min, rpe, notes, status } = data;
  return Object.fromEntries(Object.entries({ sport, duration_min, rpe, notes, status }).filter(([, v]) => v !== undefined)) as unknown as PlanData;
}

export async function swapPlanSport(plan: Entry<'plan'>, sport: Sport): Promise<void> {
  await writePlan(plan, swappedData(plan.data as PlanData, sport));
}

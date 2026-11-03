-- Tagesziele für Protein und Kalorien. Null = kein Ziel gesetzt.
alter table public.profiles
  add column if not exists protein_goal_g smallint check (protein_goal_g is null or protein_goal_g between 30 and 400),
  add column if not exists kcal_goal smallint check (kcal_goal is null or kcal_goal between 800 and 6000);

-- Tagesziele für Kohlenhydrate und Fett. Null = kein Ziel gesetzt.
alter table public.profiles
  add column if not exists carbs_goal_g smallint check (carbs_goal_g is null or carbs_goal_g between 20 and 800),
  add column if not exists fat_goal_g smallint check (fat_goal_g is null or fat_goal_g between 20 and 300);

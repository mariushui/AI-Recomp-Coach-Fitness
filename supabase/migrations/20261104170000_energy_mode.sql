-- Ziel-Modus für das Kalorienziel: Body Recomposition, Abnehmen, Gewicht halten, Massephase.
-- kcal_adjust_pct: Abweichung vom Tagesverbrauch in Prozent, negativ = Defizit. Null = 0 %.
alter table public.profiles
  add column if not exists energy_mode text check (energy_mode is null or energy_mode in ('recomp', 'abnehmen', 'halten', 'masse')),
  add column if not exists kcal_adjust_pct smallint check (kcal_adjust_pct is null or kcal_adjust_pct between -30 and 25);

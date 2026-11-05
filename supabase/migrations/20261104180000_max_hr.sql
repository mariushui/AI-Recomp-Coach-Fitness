-- Maximalpuls zum Eintragen. Leer = Schätzung aus dem Alter (Tanaka 2001: 208 minus 0,7 x Alter).
alter table public.profiles
  add column if not exists max_hr smallint check (max_hr is null or max_hr between 120 and 230);

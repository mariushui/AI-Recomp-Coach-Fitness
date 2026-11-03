-- Körpergröße im Profil, für den BMI im Verlauf.
alter table public.profiles add column if not exists height_cm numeric(5, 1)
  check (height_cm is null or height_cm between 100 and 250);

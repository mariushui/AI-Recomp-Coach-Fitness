-- Geburtsdatum im Profil: für Alter, Maximalpuls und Kalorien-Vorschlag.
alter table public.profiles add column if not exists birth_date date
  check (birth_date is null or birth_date between '1900-01-01' and current_date);

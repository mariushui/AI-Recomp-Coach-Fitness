-- Essensfoto: neue Quelle "photo" für Einträge, die die KI aus einem Foto geschätzt hat.
alter table public.entries drop constraint entries_source_check;
alter table public.entries add constraint entries_source_check
  check (source in ('voice', 'text', 'photo', 'manual', 'health', 'import'));

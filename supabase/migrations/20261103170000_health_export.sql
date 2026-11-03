-- Rückweg nach Apple Health: merkt sich, welche Einträge der Kurzbefehl schon übertragen hat.
-- Gesetzt wird der Wert erst, wenn der Kurzbefehl den Empfang bestätigt (health-export mit confirm).
alter table public.entries add column health_exported_at timestamptz;

create index entries_health_export_idx on public.entries (user_id, occurred_at)
  where health_exported_at is null and kind in ('meal', 'lab');

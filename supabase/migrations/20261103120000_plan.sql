-- Trainingsplan: neue Art "plan" im Event-Log.
alter table public.entries drop constraint entries_kind_check;
alter table public.entries add constraint entries_kind_check
  check (kind in ('meal', 'workout', 'plan', 'body', 'wellbeing', 'lab', 'note', 'health'));

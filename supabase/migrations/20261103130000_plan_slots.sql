-- Wochenplan: feste Einheiten, die jede Woche im Kalender erscheinen.
-- Änderungen für eine einzelne Woche landen als plan-Eintrag in entries
-- mit external_id 'slot:<slot_id>:<YYYY-MM-DD>' und überschreiben die Vorlage für diesen Tag.
create table public.plan_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  time time not null default '18:00',
  data jsonb not null default '{}'::jsonb,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from - 1)
);

create index plan_slots_user_idx on public.plan_slots (user_id, weekday);

alter table public.plan_slots enable row level security;

create policy "plan_slots_select_own" on public.plan_slots for select using (user_id = auth.uid());
create policy "plan_slots_insert_own" on public.plan_slots for insert with check (user_id = auth.uid());
create policy "plan_slots_update_own" on public.plan_slots for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plan_slots_delete_own" on public.plan_slots for delete using (user_id = auth.uid());

-- Datenlöschung (DSGVO) um Wochenplan erweitern
create or replace function public.delete_my_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from public.entries where user_id = auth.uid();
  delete from public.plan_slots where user_id = auth.uid();
  delete from public.ingest_tokens where user_id = auth.uid();
  delete from public.ai_usage where user_id = auth.uid();
end $$;

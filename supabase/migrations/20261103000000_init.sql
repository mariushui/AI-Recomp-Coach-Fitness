-- Recomp Coach: Grundschema für die Datensammlung (Phase 1)
-- Jede Tabelle hat Row Level Security: Nutzer sehen und ändern nur ihre eigenen Zeilen.

create extension if not exists pgcrypto with schema extensions;

-- Profile ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid());

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Einträge (Event-Log) --------------------------------------------------
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('meal', 'workout', 'body', 'wellbeing', 'lab', 'note', 'health')),
  occurred_at timestamptz not null,
  source text not null default 'manual' check (source in ('voice', 'text', 'manual', 'health', 'import')),
  data jsonb not null default '{}'::jsonb,
  raw_text text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entries_external_unique unique (user_id, external_id)
);

create index entries_user_time_idx on public.entries (user_id, occurred_at desc);
create index entries_user_kind_time_idx on public.entries (user_id, kind, occurred_at desc);

alter table public.entries enable row level security;

create policy "entries_select_own" on public.entries for select using (user_id = auth.uid());
create policy "entries_insert_own" on public.entries for insert with check (user_id = auth.uid());
create policy "entries_update_own" on public.entries for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "entries_delete_own" on public.entries for delete using (user_id = auth.uid());

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- Token für den iOS-Kurzbefehl -----------------------------------------
-- Gespeichert wird nur der SHA-256-Hash. Der Klartext wird genau einmal angezeigt.
create table public.ingest_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.ingest_tokens enable row level security;

create policy "ingest_tokens_select_own" on public.ingest_tokens for select using (user_id = auth.uid());
create policy "ingest_tokens_delete_own" on public.ingest_tokens for delete using (user_id = auth.uid());

create function public.create_ingest_token() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  t text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  t := 'rc_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.ingest_tokens (user_id, token_hash)
  values (auth.uid(), encode(extensions.digest(t, 'sha256'), 'hex'))
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return t;
end $$;

revoke all on function public.create_ingest_token() from public, anon;
grant execute on function public.create_ingest_token() to authenticated;

-- KI-Kontingent pro Nutzer und Tag -------------------------------------
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

create policy "ai_usage_select_own" on public.ai_usage for select using (user_id = auth.uid());

-- Erhöht den Zähler und gibt false zurück, wenn das Tageslimit erreicht ist.
create function public.consume_ai_quota(p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  c int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.ai_usage (user_id, day, count)
  values (auth.uid(), (now() at time zone 'Europe/Berlin')::date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into c;
  return c <= p_limit;
end $$;

revoke all on function public.consume_ai_quota(int) from public, anon;
grant execute on function public.consume_ai_quota(int) to authenticated;

-- Alle eigenen Daten löschen (DSGVO) -----------------------------------
create function public.delete_my_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from public.entries where user_id = auth.uid();
  delete from public.ingest_tokens where user_id = auth.uid();
  delete from public.ai_usage where user_id = auth.uid();
end $$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

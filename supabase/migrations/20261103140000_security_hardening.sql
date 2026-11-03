-- Hinweise aus dem Supabase-Sicherheitscheck beheben.

-- Trigger-Funktion mit festem search_path, damit kein fremdes Schema untergeschoben werden kann.
alter function public.touch_updated_at() set search_path = public;

-- handle_new_user läuft nur als Trigger bei neuen Nutzern. Über die API soll sie niemand aufrufen.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

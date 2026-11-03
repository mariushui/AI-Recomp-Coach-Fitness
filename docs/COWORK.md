# Zugriff aus Claude Cowork (Rechner)

Die App-Daten liegen in Supabase. Cowork erreicht sie über den Supabase-Connector, der in Claude schon verbunden ist.
Damit kann Cowork Pläne eintragen, Wochen auswerten und Zusammenfassungen in den Vault schreiben, ohne die App zu öffnen.

Projekt: `psuwcwxzctfwenakuoss` (AI Recomp Coach, Frankfurt). Alle Tabellen in `docs/DATENMODELL.md`.

## Eigene user_id finden

```sql
select id from auth.users where email = 'DEINE@MAIL';
```

## Trainingsplan eintragen (feste Einheiten pro Woche)

```sql
insert into public.plan_slots (user_id, weekday, time, data, valid_from) values
  ('<user_id>', 2, '18:00', '{"sport":"tennis","session_type":"stunde","duration_min":60,"focus":"Rückhand"}', current_date),
  ('<user_id>', 4, '07:30', '{"sport":"laufen","duration_min":50,"distance_km":8,"goal":"8 km unter 5:45"}', current_date);
```

weekday: 1 = Montag … 7 = Sonntag. Alte Einheiten beenden statt löschen, damit vergangene Wochen ihren Plan behalten:

```sql
update public.plan_slots set valid_to = current_date - 1 where user_id = '<user_id>' and valid_to is null;
```

## Einzelne Einheit planen (nur ein Datum)

```sql
insert into public.entries (user_id, kind, occurred_at, source, data)
values ('<user_id>', 'plan', '2026-11-08T10:00:00+01:00', 'import', '{"sport":"capoeira","duration_min":90}');
```

## Woche auswerten (für den Vault)

```sql
select date(occurred_at at time zone 'Europe/Berlin') as tag, kind,
       sum((data->>'protein_g')::numeric) filter (where kind = 'meal') as protein_g,
       sum((data->>'kcal')::numeric) filter (where kind = 'meal') as kcal,
       sum((data->>'duration_min')::numeric) filter (where kind = 'workout') as training_min
from public.entries
where user_id = '<user_id>' and occurred_at >= now() - interval '7 days'
group by 1, 2 order by 1, 2;
```

Apple-Health-Werte: `kind = 'health'`, `data->>'metric'` in weight, body_fat, hrv, resting_hr, sleep (Minuten), steps, active_kcal, exercise_min, vo2max, spo2, hr_recovery.

## Regeln

- `source = 'import'` für alles, was Cowork einträgt. Dann ist in der App sichtbar, was nicht von Hand kam.
- Nie `auth.users` oder `profiles` anderer Nutzer anfassen. Der Connector läuft ohne RLS.
- Zeiten immer mit Offset (`+01:00` bzw. `+02:00`), sonst landet der Eintrag am falschen Tag.

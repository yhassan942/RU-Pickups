-- Starting Elo 400, one Basketball row per user; hardened signup trigger.

-- 1) Default Elo for new stat rows
alter table public.player_stats
  alter column elo set default 400;

-- 2) Replace signup trigger (search_path + explicit Basketball row with elo 400)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (user_id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      'user_' || substring(new.id::text from 1 for 6)
    )
  )
  on conflict (user_id) do nothing;

  insert into public.player_stats (user_id, sport, elo, wins, losses)
  values (new.id, 'Basketball', 400, 0, 0)
  on conflict (user_id, sport) do nothing;

  return new;
end;
$$;

-- 3) Backfill: users without a Basketball row
insert into public.player_stats (user_id, sport, elo, wins, losses)
select u.user_id, 'Basketball', 400, 0, 0
from public.users u
where not exists (
  select 1
  from public.player_stats ps
  where ps.user_id = u.user_id
    and ps.sport = 'Basketball'
);

-- 4) Optional: bump untouched starter rows that still have old default elo 0
update public.player_stats
set elo = 400
where elo = 0
  and wins = 0
  and losses = 0
  and coalesce(matches_played, 0) = 0;

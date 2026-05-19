-- Apply on existing Supabase/Postgres DBs that already ran the older schema.
-- New installs: use docs/db/schema.sql (includes this behavior).

-- 1) Stop storing rating/record defaults on public.users (source of truth: player_stats)
alter table public.users alter column elo drop default;
alter table public.users alter column wins drop default;
alter table public.users alter column losses drop default;
alter table public.users alter column elo drop not null;
alter table public.users alter column wins drop not null;
alter table public.users alter column losses drop not null;

-- 2) Backfill one Basketball row per user who does not have player_stats yet
insert into public.player_stats (user_id)
select u.user_id
from public.users u
where not exists (
  select 1
  from public.player_stats ps
  where ps.user_id = u.user_id
    and ps.sport = 'Basketball'
);

-- 3) On auth signup: public.users row + initial player_stats row
create or replace function public.handle_new_user()
returns trigger as $$
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

  insert into public.player_stats (user_id)
  values (new.id)
  on conflict (user_id, sport) do nothing;

  return new;
end;
$$ language plpgsql security definer;

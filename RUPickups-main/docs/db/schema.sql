-- ==========================
-- RU Pickups Database Schema
-- ==========================
create extension if not exists pgcrypto;

-- 1) enums

--- lobby status
do $$ begin
  create type lobby_status as enum (
    'open',
    'full',
    'in_progress',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

--- match status
do $$ begin
  create type match_status as enum (
    'scheduled',
    'in_progress',
    'completed',
    'forfeited',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

--- notification type
do $$ begin
  create type notification_type as enum (
    'lobby_invite',
    'lobby_join_request',
    'lobby_join_approved',
    'match_started',
    'match_completed',
    'match_result_reported',
    'elo_updated',
    'system_announcement'
  );
exception when duplicate_object then null;
end $$;

-- 2) Location
create table if not exists public.locations (
  location_id uuid primary key default gen_random_uuid(),

  name text not null,
  campus text not null,

  address text,
  latitude double precision,
  longitude double precision,

  created_at timestamptz not null default now()
);

-- 3) User table
create table if not exists public.users (
  user_id uuid primary key references auth.users(id) on delete cascade,

  username text not null unique,
  preferred_campus text,
  phone_number text,

  -- Rating / record live in player_stats; leave these unset (NULL) for new users
  elo integer,
  wins integer,
  losses integer,

  created_at timestamptz not null default now()
);

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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 4) Lobby table
create table if not exists public.lobby (
  lobby_id uuid primary key default gen_random_uuid(),

  host_user_id uuid not null references public.users(user_id) on delete cascade,

  sport text not null default 'Basketball',
  campus text not null default 'Busch',

  location_id uuid references public.locations(location_id) on delete set null,

  is_public boolean not null default true,

  password_hash text,

  max_players integer not null default 5 check (max_players > 1),
  min_elo integer not null default 0 check (min_elo >= 0),
  status lobby_status not null default 'open',
  scheduled_start_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 5) Lobby Participant
create table if not exists public.lobby_participants (
  lobby_id uuid not null references public.lobby(lobby_id) on delete cascade,
  player_id uuid not null references public.users(user_id) on delete cascade, 

  joined_at timestamptz not null default now(),
  is_ready boolean not null default false,

  current_team text,

  primary key (lobby_id, player_id)
);

-- 6) Match
create table if not exists public.matches (
  match_id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobby(lobby_id) on delete cascade,

  match_number integer not null check (match_number > 0),
  status match_status not null default 'scheduled',

  started_at timestamptz,
  ended_at timestamptz,

  winner_team text,
  
  created_at timestamptz not null default now(),

  unique(lobby_id, match_number)
);

-- 7) Match players
create table if not exists public.match_players (
  match_id uuid not null references public.matches(match_id) on delete cascade,
  player_id uuid not null references public.users(user_id) on delete cascade,

  team text,
  elo_before integer check (elo_before >= 0),
  elo_after integer check (elo_after >= 0),

  primary key (match_id, player_id)
);

-- 8) Player stats
create table if not exists public.player_stats (
  stat_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,

  sport text not null default 'Basketball',

  matches_played integer not null default 0 check (matches_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  
  elo integer not null default 400 check (elo >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),

  created_at timestamptz not null default now(),

  unique (user_id, sport)
);

-- 9) Notification
create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(user_id) on delete cascade,

  message text not null,
  type notification_type not null default 'system_announcement',

  is_read boolean not null default false,

  created_at timestamptz not null default now()
);
-- Minimum ELO required to join a lobby (host sets; default 0).
alter table public.lobby
  add column if not exists min_elo integer not null default 0
  check (min_elo >= 0);

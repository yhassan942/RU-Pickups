create unique index if not exists lobby_name_unique_ci
  on public.lobby (lower(trim(lobby_name)));
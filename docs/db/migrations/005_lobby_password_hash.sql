-- Optional bcrypt hash for password-protected (is_public = false) lobbies.
alter table public.lobby
  add column if not exists password_hash text;

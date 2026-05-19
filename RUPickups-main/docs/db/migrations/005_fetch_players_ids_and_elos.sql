create or replace function get_players_current_elos(
  p_ids uuid[],
  m_sport text
)
returns table(
  p_id uuid,
  p_elo int
)
language plpgsql
as $$
begin
  return query
  select 
    ids.user_id,
    coalesce(ps.elo, 400) as elo
  from unnest(p_ids) as ids(user_id)
  left join player_stats ps
    on ps.user_id = ids.user_id
    and lower(ps.sport) = lower(m_sport);
end;
$$;
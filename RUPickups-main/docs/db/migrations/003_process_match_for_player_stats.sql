create or replace function process_match(
  p_winner_ids uuid[],
  p_loser_ids uuid[],
  p_sport text
)
returns void
language plpgsql
as $$
declare
  winner_avg numeric;
  loser_avg numeric;
  k numeric := 32;
  winner_delta numeric;
  loser_delta numeric;
begin

  insert into player_stats (user_id, sport, wins, losses, elo, current_streak)
  select unnest(p_winner_ids), p_sport, 0, 0, 1000, 0
  on conflict (user_id, sport) do nothing;

  insert into player_stats (user_id, sport, wins, losses, elo, current_streak)
  select unnest(p_loser_ids), p_sport, 0, 0, 1000, 0
  on conflict (user_id, sport) do nothing;

  select avg(elo) into winner_avg
  from player_stats
  where user_id = any(p_winner_ids) and sport = p_sport;

  select avg(elo) into loser_avg
  from player_stats
  where user_id = any(p_loser_ids) and sport = p_sport;

  winner_delta := k * (1 - (1.0 / (1 + power(10, (loser_avg - winner_avg)/400))));
  loser_delta  := k * (0 - (1.0 / (1 + power(10, (winner_avg - loser_avg)/400))));

  update player_stats
  set 
    wins = wins + 1,
    current_streak = coalesce(current_streak, 0) + 1,
    elo = elo + winner_delta
  where user_id = any(p_winner_ids)
    and sport = p_sport;

  update player_stats
  set 
    losses = losses + 1,
    current_streak = 0,
    elo = elo + loser_delta
  where user_id = any(p_loser_ids)
    and sport = p_sport;

end;
$$;
from uuid import UUID

from app.db.supabase_admin_client import get_supabase_admin_client
from app.db.supabase_client import get_supabase_client


client = get_supabase_client()

def player_ids_and_elos(match_players: list[str], match_sport: str):
    response = client.rpc("get_players_current_elos", {
        "p_ids": match_players,
        "m_sport": match_sport
    }).execute()

    return [(p["p_id"], p["p_elo"]) for p in response.data]

"""Service functions for reading and mutating match-player mappings."""

from app.db.supabase_client import get_supabase_client
from app.repositories.matchplayers_repository import insert_match_players, delete_match_players


def get_match_players() -> list[dict]:
    db = get_supabase_client()

    response = (
        db
        .table("match_players")
        .select("*")
        .execute()
    )

    return response.data or []


def get_match_players_by_match_id(match_id: str) -> list[dict]:
    db = get_supabase_client()

    response = (
        db
        .table("match_players")
        .select("*")
        .eq("match_id", match_id)
        .execute()
    )

    return response.data or []


def insert_match_players_to_db(match_id: str, team_A_player_ids: list[str], team_B_player_ids: list[str]):
    insert_match_players(match_id=match_id, team_A_player_ids=team_A_player_ids, team_B_player_ids=team_B_player_ids)


def delete_match_players_from_db(match_id: str):
    delete_match_players(match_id=match_id)
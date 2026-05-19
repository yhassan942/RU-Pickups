"""Service layer for reading and processing player statistics."""

from uuid import UUID

from app.repositories import playerstats_repository


def get_player_stats() -> list[dict]:
    return playerstats_repository.get_all_player_stats()

def process_match_for_player_stats(winner_ids: list[str], loser_ids: list[str], sport: str):
    playerstats_repository.process_match_player_stats_in_db(winner_ids, loser_ids, sport)
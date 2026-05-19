"""Routes for querying and updating player stats."""

from fastapi import APIRouter, status, Query
from uuid import UUID

from app.services.playerstats_service import get_player_stats, process_match_for_player_stats
from app.models.playerstats import PlayerStatsResponse

router = APIRouter()

@router.get("/player_stats_manifest", response_model=list[PlayerStatsResponse])
def get_list_of_player_stats():
    return get_player_stats()

@router.patch("/process", status_code=status.HTTP_202_ACCEPTED)
def process_match(
    winner_ids: list[str] = Query(...),
    loser_ids: list[str] = Query(...),
    sport: str = Query(...)
):
    process_match_for_player_stats(
        winner_ids=winner_ids,
        loser_ids=loser_ids,
        sport=sport
    )

    return {"ok": True}
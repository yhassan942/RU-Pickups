"""Service layer for user profiles, leaderboard data, and sport stats."""

from app.repositories import playerstats_repository, user_repository
from app.models.users import UserCreate

def get_users() -> list[dict]:
    return user_repository.get_all_users()

def get_leaderboard(limit: int = 10, sport: str | None = None) -> list[dict]:
    return user_repository.get_leaderboard(limit=limit, sport=sport)


def get_my_sport_stats(user_id: str) -> list[dict]:
    rows = playerstats_repository.get_sport_stats_rows_for_user(user_id)
    out: list[dict] = []
    for r in rows:
        sport = str(r.get("sport") or "").strip()
        if not sport:
            continue
        try:
            elo = int(r.get("elo") if r.get("elo") is not None else playerstats_repository.DEFAULT_STARTING_ELO)
        except (TypeError, ValueError):
            elo = int(playerstats_repository.DEFAULT_STARTING_ELO)
        try:
            wins = int(r.get("wins") or 0)
        except (TypeError, ValueError):
            wins = 0
        try:
            losses = int(r.get("losses") or 0)
        except (TypeError, ValueError):
            losses = 0
        out.append({"sport": sport, "elo": elo, "wins": wins, "losses": losses})
    return out

def get_user_by_id(user_id: str):
    return user_repository.get_user_by_id(user_id)

def upsert_user(user_id: str, payload: UserCreate):
    return user_repository.upsert_user(
        user_id=user_id,
        username=payload.username,
        preferred_campus=payload.preferred_campus,
        phone_number=payload.phone_number,
    )
from fastapi import APIRouter

from app.api.routes import (
    health_route,
    lobby_route,
    lobbyparticipant_route,
    location_route,
    matches_route,
    matchplayers_route,
    notifications_route,
    playerstats_route,
    users_route
)

api_router = APIRouter()

api_router.include_router(health_route.router, prefix="/health", tags=["health"])

api_router.include_router(lobby_route.router, prefix="/lobbies", tags=["lobbies"])
api_router.include_router(lobbyparticipant_route.router, prefix="/lobby-participants", tags=["lobby-participants"])

api_router.include_router(location_route.router, prefix="/locations", tags=["locations"])

api_router.include_router(matches_route.router, prefix="/matches", tags=["matches"])
api_router.include_router(matchplayers_route.router, prefix="/match-players", tags=["match-players"])

api_router.include_router(notifications_route.router, prefix="/notifications", tags=["notifications"])

api_router.include_router(playerstats_route.router, prefix="/player-stats", tags=["player-stats"])

api_router.include_router(users_route.router, prefix="/users", tags=["users"]) 
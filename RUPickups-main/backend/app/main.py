import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router
from app.repositories.lobby_repository import cleanup_expired_unstarted_lobbies


STALE_LOBBY_CLEANUP_INTERVAL_SECONDS = 300  # 5 minutes


async def _stale_lobby_cleanup_loop() -> None:
    while True:
        try:
            cleanup_expired_unstarted_lobbies()
        except Exception:
            # Keep the API healthy even if cleanup temporarily fails.
            pass
        await asyncio.sleep(STALE_LOBBY_CLEANUP_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(_stale_lobby_cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="RU Pickups API", lifespan=lifespan)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

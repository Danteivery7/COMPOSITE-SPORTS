from datetime import datetime, timezone
import os

from fastapi import FastAPI, HTTPException, Query


app = FastAPI(title="Composite CBB Backend", version="0.1.0")


def utc_now():
    return datetime.now(timezone.utc).isoformat()


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "composite-cbb",
        "timestamp": utc_now(),
        "mongoConfigured": bool(os.getenv("MONGODB_URI")),
        "torvikEnabled": bool(os.getenv("CBB_TORVIK_ENABLED")),
        "haslaEnabled": bool(os.getenv("CBB_HASLA_ENABLED")),
    }


@app.get("/bootstrap")
async def bootstrap(force: int = Query(default=0)):
    raise HTTPException(
        status_code=503,
        detail=(
            "The CBB ingestion service scaffold is present, but no live scraper/storage "
            "pipeline has been configured in this environment yet."
        ),
    )


@app.get("/players")
async def players(q: str = Query(default="")):
    raise HTTPException(status_code=503, detail="Player snapshot store is not configured yet.")


@app.get("/players/{player_id}")
async def player_detail(player_id: str):
    raise HTTPException(status_code=503, detail=f"Player detail for {player_id} is not configured yet.")


@app.get("/teams/{team_id}")
async def team_detail(team_id: str):
    raise HTTPException(status_code=503, detail=f"Team detail for {team_id} is not configured yet.")


@app.get("/predictor")
async def predictor(
    homeTeamId: str = Query(default=""),
    awayTeamId: str = Query(default=""),
):
    raise HTTPException(
        status_code=503,
        detail=(
            "Predictor service is scaffolded, but the source-ingestion pipeline has not been "
            "wired to MongoDB in this environment yet."
        ),
    )

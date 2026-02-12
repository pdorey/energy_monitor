from __future__ import annotations

from fastapi import APIRouter
from ..db import get_repository

router = APIRouter(prefix="/api", tags=["weather"])


@router.get("/weather")
async def get_weather(days: int = 7):
    """Return weather forecast from DB."""
    repo = get_repository()
    rows = repo.get_weather(days=days)
    return {"data": rows}

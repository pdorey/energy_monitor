"""Energy prices API router. Spot prices from DB."""
from __future__ import annotations

from fastapi import APIRouter
from ..db import get_repository

router = APIRouter(prefix="/api", tags=["prices"])


@router.get("/energy-prices")
async def get_energy_prices(days: int = 2):
    """Return energy price data from DB. days: lookback period."""
    repo = get_repository()
    rows = repo.get_energy_prices(days=days)
    return {"data": rows}

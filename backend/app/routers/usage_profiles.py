"""Usage profiles API router. AI-generated load/solar profiles."""
from __future__ import annotations

from fastapi import APIRouter
from typing import Optional
from ..db import get_repository

router = APIRouter(prefix="/api", tags=["usage-profiles"])


@router.get("/usage-profiles")
async def get_usage_profiles(profile_id: Optional[str] = None):
    """Return AI-generated usage profiles. Optional profile_id filter."""
    repo = get_repository()
    rows = repo.get_usage_profiles(profile_id=profile_id)
    return {"data": rows}

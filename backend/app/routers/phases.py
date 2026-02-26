"""3-phase metrics API router. L1/L2/L3 for equipment."""
from __future__ import annotations

from fastapi import APIRouter, Request
from ..db import get_repository
from ..config import use_simulator

router = APIRouter(prefix="/api", tags=["phases"])


@router.get("/equipment/{equipment_id}/phases")
async def get_equipment_phases(request: Request, equipment_id: str, hours: int = 24):
    """Return 3-phase metrics for equipment (L1, L2, L3 + aggregate). hours: lookback."""
    if use_simulator():
        sim = getattr(request.app.state, "sim", None)
        if sim and getattr(sim, "_last_snapshot", None):
            snap = sim._last_snapshot
            if snap and snap.three_phase:
                key = "grid" if "grid" in equipment_id else "load" if "load" in equipment_id else None
                if key:
                    data = snap.three_phase.get(key)
                    if data:
                        return {"data": [data], "equipment_id": equipment_id}
        return {"data": [], "equipment_id": equipment_id}
    repo = get_repository()
    rows = repo.get_three_phase_metrics(equipment_id, hours=hours)
    return {"data": rows, "equipment_id": equipment_id}

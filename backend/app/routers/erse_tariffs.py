from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any
from ..db import get_repository

router = APIRouter(prefix="/api", tags=["erse-tariffs"])


class ERSETariffCreate(BaseModel):
    tariff_type: str
    valid_from: str
    valid_to: str
    peak_hours: Optional[dict] = None
    access_charge_peak: Optional[float] = None
    access_charge_off_peak: Optional[float] = None
    access_charge_super_off_peak: Optional[float] = None
    export_multiplier: float = 0.8


class ERSETariffUpdate(BaseModel):
    tariff_type: Optional[str] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    peak_hours: Optional[dict] = None
    access_charge_peak: Optional[float] = None
    access_charge_off_peak: Optional[float] = None
    access_charge_super_off_peak: Optional[float] = None
    export_multiplier: Optional[float] = None


@router.get("/erse-tariff-definitions")
async def list_erse_tariffs(tariff_type: Optional[str] = None):
    """List ERSE tariff definitions."""
    repo = get_repository()
    rows = repo.get_erse_tariff_definitions(tariff_type=tariff_type)
    return {"data": rows}


@router.post("/erse-tariff-definitions")
async def create_erse_tariff(payload: ERSETariffCreate):
    """Create new ERSE tariff definition."""
    repo = get_repository()
    data = payload.model_dump()
    try:
        id = repo.insert_erse_tariff(data)
        return {"id": id, "message": "created"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/erse-tariff-definitions/{id}")
async def update_erse_tariff(id: int, payload: ERSETariffUpdate):
    """Update ERSE tariff definition."""
    repo = get_repository()
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    repo.update_erse_tariff(id, data)
    return {"message": "updated"}


@router.delete("/erse-tariff-definitions/{id}")
async def delete_erse_tariff(id: int):
    """Delete ERSE tariff definition."""
    repo = get_repository()
    repo.delete_erse_tariff(id)
    return {"message": "deleted"}

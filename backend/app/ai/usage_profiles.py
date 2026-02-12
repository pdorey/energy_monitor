"""
Build usage profiles from Consumption.csv or DB consumption data.
Aggregates by day_type (weekday/weekend) and 15-min slot.
"""
from __future__ import annotations

import csv
import os
from pathlib import Path
from typing import List, Optional

from ..db import get_repository


def _resolve_consumption_csv() -> Optional[str]:
    here = Path(__file__).parent
    candidates = [
        here.parent.parent.parent,  # repo root
        here.parent.parent,
        Path.cwd(),
    ]
    for c in candidates:
        p = c / "Consumption.csv"
        if p.exists():
            return str(p)
    return None


def build_usage_profiles(profile_id: str = "default", source: str = "csv") -> int:
    """
    Build usage profiles from Consumption.csv (weekday) and store in DB.
    Weekend profile uses 40% of weekday load.
    Returns number of profile rows stored.
    """
    repo = get_repository()
    rows: List[dict] = []

    if source == "csv":
        path = _resolve_consumption_csv()
        if not path:
            return 0
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not any(row.values()):
                    continue
                row_clean = {(k or "").strip().lstrip("\ufeff"): v for k, v in row.items()}
                rows.append(row_clean)
    else:
        consumption = repo.get_consumption(days=7)
        if not consumption:
            return 0
        for r in consumption:
            rows.append({
                "building_load_kw": r.get("building_load_kw", 0),
                "grid_kw": r.get("grid_kw", 0),
                "solar_kw": r.get("solar_kw", 0),
                "battery_kw": r.get("battery_kw", 0),
            })

    if not rows:
        return 0

    def parse_float(r: dict, field: str) -> float:
        val = (r.get(field) or "").strip()
        try:
            return float(val) if val else 0.0
        except ValueError:
            return 0.0

    count = 0
    for slot_15min, row in enumerate(rows[:96]):
        load = parse_float(row, "BUILDING LOAD PWR") if "BUILDING LOAD PWR" in (row or {}) else row.get("building_load_kw", 0)
        solar = parse_float(row, "SOLAR PWR") if "SOLAR PWR" in (row or {}) else row.get("solar_kw", 0)
        battery = parse_float(row, "BATTERY PWR") if "BATTERY PWR" in (row or {}) else row.get("battery_kw", 0)
        grid = parse_float(row, "GRID PWR") if "GRID PWR" in (row or {}) else row.get("grid_kw", 0)
        hour = (slot_15min // 4) % 24

        repo.insert_usage_profile(
            profile_id=profile_id,
            day_type="weekday",
            slot_15min=slot_15min,
            hour=hour,
            typical_load_kw=load,
            typical_solar_kw=solar,
            typical_battery_kw=battery,
            typical_grid_kw=grid,
        )
        count += 1

        repo.insert_usage_profile(
            profile_id=profile_id,
            day_type="weekend",
            slot_15min=slot_15min,
            hour=hour,
            typical_load_kw=load * 0.4,
            typical_solar_kw=solar,
            typical_battery_kw=battery * 0.5,
            typical_grid_kw=grid * 0.5,
        )
        count += 1

    return count

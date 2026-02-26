"""Open-Meteo weather collector. Free API, no key required."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

import httpx

from ..config import get_open_meteo_config
from ..db import get_repository


class OpenMeteoCollector:
    """Fetch hourly weather forecast from Open-Meteo (free, no API key)."""

    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    def __init__(self, repo=None):
        """Init with optional Repository; uses get_repository() if None."""
        self.repo = repo or get_repository()
        self.config = get_open_meteo_config()

    async def fetch(self) -> Optional[List[dict]]:
        """Fetch 7-day hourly forecast. Returns list of weather dicts or None on failure."""
        params = {
            "latitude": self.config["latitude"],
            "longitude": self.config["longitude"],
            "hourly": "temperature_2m,relative_humidity_2m,cloud_cover,shortwave_radiation,precipitation,wind_speed_10m,weather_code",
            "forecast_days": 7,
            "timezone": "UTC",
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(self.BASE_URL, params=params)
                r.raise_for_status()
                data = r.json()
        except Exception as e:
            print(f"[OpenMeteo] Fetch failed: {e}")
            return None

        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        if not times:
            return None

        rows = []
        for i, t in enumerate(times):
            rows.append({
                "timestamp": t,
                "temperature_c": _v(hourly.get("temperature_2m"), i),
                "relative_humidity": _v(hourly.get("relative_humidity_2m"), i),
                "cloud_cover": _v(hourly.get("cloud_cover"), i),
                "shortwave_radiation_wm2": _v(hourly.get("shortwave_radiation"), i),
                "precipitation_mm": _v(hourly.get("precipitation"), i),
                "wind_speed_kmh": _v(hourly.get("wind_speed_10m"), i),
                "weather_code": _v(hourly.get("weather_code"), i),
            })
        return rows

    async def run(self) -> bool:
        """Fetch and persist to weather table. Returns True on success."""
        rows = await self.fetch()
        if not rows:
            return False
        self.repo.insert_weather_batch(rows)
        print(f"[OpenMeteo] Stored {len(rows)} weather records")
        return True


def _v(arr, i):
    """Safe array index: return arr[i] or None if out of range."""
    if arr is None or i >= len(arr):
        return None
    return arr[i]

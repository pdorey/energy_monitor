from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional

import httpx

from ..config import get_esios_config
from ..db import get_repository


class EsiosCollector:
    """Fetch day-ahead prices from ESIOS (Iberian market, Portugal + Spain). Fallback when ENTSO-E fails."""

    BASE_URL = "https://api.esios.ree.es"

    def __init__(self, repo=None):
        self.repo = repo or get_repository()
        self.config = get_esios_config()

    async def fetch(self) -> Optional[List[dict]]:
        api_key = self.config.get("api_key")
        if not api_key:
            print("[ESIOS] No API key configured")
            return None

        # ESIOS indicator for Portugal day-ahead price (OMIE)
        # 1001 = Portugal day-ahead market
        indicator_id = 1001
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        end = (now + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")

        url = f"{self.BASE_URL}/indicators/{indicator_id}"
        params = {"start_date": start, "end_date": end}
        headers = {"x-api-key": api_key, "Accept": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(url, params=params, headers=headers)
                r.raise_for_status()
                data = r.json()
        except Exception as e:
            print(f"[ESIOS] Fetch failed: {e}")
            return None

        return self._parse_response(data)

    def _parse_response(self, data: dict) -> Optional[List[dict]]:
        try:
            values = data.get("indicator", {}).get("values", [])
            if not values:
                return None

            rows = []
            for v in values:
                dt_str = v.get("datetime")
                value = v.get("value")
                if dt_str is None or value is None:
                    continue
                # ESIOS returns datetime in ISO format
                rows.append({
                    "timestamp": dt_str,
                    "spot_price_eur_mwh": float(value),
                    "source": "esios",
                })
            return rows
        except Exception as e:
            print(f"[ESIOS] Parse failed: {e}")
            return None

    async def run(self) -> bool:
        rows = await self.fetch()
        if not rows:
            return False
        self.repo.insert_energy_prices_batch(rows)
        print(f"[ESIOS] Stored {len(rows)} price records")
        return True

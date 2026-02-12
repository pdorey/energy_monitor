from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from ..config import get_huawei_config
from ..db import get_repository


class HuaweiCollector:
    """
    Fetch inverter, battery, plant data from Huawei FusionSolar Northbound API.
    Stub implementation - integrate FusionSolarPy or direct REST when credentials available.
    """

    def __init__(self, repo=None):
        self.repo = repo or get_repository()
        self.config = get_huawei_config()

    async def fetch(self) -> Optional[dict]:
        if not self.config.get("username") or not self.config.get("password"):
            return None
        # TODO: Integrate FusionSolarPy or direct REST
        # from fusion_solar_py import FusionSolarClient
        # client = FusionSolarClient(...)
        # plant_data = client.get_plant_real_time_data(station_code)
        return None

    async def run(self) -> bool:
        data = await self.fetch()
        if not data:
            return False
        ts = datetime.now(timezone.utc).isoformat()
        # Map to equipment_snapshots
        # self.repo.insert_equipment_snapshot(ts, "solar_001", "solar", ...)
        # self.repo.insert_equipment_snapshot(ts, "battery_001", "battery", ...)
        return True

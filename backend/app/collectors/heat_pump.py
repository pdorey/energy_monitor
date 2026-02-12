from __future__ import annotations

from typing import Optional

from ..db import get_repository


class HeatPumpCollector:
    """
    Fetch HVAC (heat pump) power and mode from vendor API.
    Stub implementation - integrate when heat pump API available.
    """

    def __init__(self, repo=None):
        self.repo = repo or get_repository()

    async def fetch(self) -> Optional[dict]:
        return None

    async def run(self) -> bool:
        data = await self.fetch()
        if not data:
            return False
        # self.repo.insert_equipment_snapshot(ts, "heat_pump_001", "heat_pump", power_w=..., raw_json=...)
        return True

from __future__ import annotations

from typing import Optional

from ..db import get_repository


class EvChargerCollector:
    """
    Fetch EV charging status and power from Huawei FusionSolar or OCPP.
    Stub implementation - integrate when EV charger API available.
    """

    def __init__(self, repo=None):
        self.repo = repo or get_repository()

    async def fetch(self) -> Optional[dict]:
        return None

    async def run(self) -> bool:
        data = await self.fetch()
        if not data:
            return False
        # self.repo.insert_equipment_snapshot(ts, "ev_001", "ev", power_w=..., soc_percent=...)
        return True

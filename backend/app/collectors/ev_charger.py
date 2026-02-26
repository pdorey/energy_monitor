"""EV charger collector (stub). FusionSolar or OCPP integration."""
from __future__ import annotations

from typing import Optional

from ..db import get_repository


class EvChargerCollector:
    """
    Fetch EV charging status and power from Huawei FusionSolar or OCPP.
    Stub implementation - integrate when EV charger API available.
    """

    def __init__(self, repo=None):
        """Init with optional Repository; uses get_repository() if None."""
        self.repo = repo or get_repository()

    async def fetch(self) -> Optional[dict]:
        """Stub: returns None until EV charger API integration."""
        return None

    async def run(self) -> bool:
        """Stub: fetch and persist. Returns False until integration complete."""
        data = await self.fetch()
        if not data:
            return False
        # self.repo.insert_equipment_snapshot(ts, "ev_001", "ev", power_w=..., soc_percent=...)
        return True

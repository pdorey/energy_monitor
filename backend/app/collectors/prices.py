"""Price fetch: ENTSO-E primary, ESIOS fallback."""
from __future__ import annotations

import asyncio
from typing import Optional

from .entsoe import EntsoeCollector
from .esios import EsiosCollector


async def fetch_prices_with_fallback(entsoe: EntsoeCollector, esios: EsiosCollector) -> bool:
    """Try ENTSO-E first; on failure fall back to ESIOS. Returns True if either succeeds."""
    rows = await entsoe.fetch()
    if rows:
        entsoe.repo.insert_energy_prices_batch(rows)
        print(f"[Prices] Stored {len(rows)} records from ENTSO-E")
        return True
    rows = await esios.fetch()
    if rows:
        esios.repo.insert_energy_prices_batch(rows)
        print(f"[Prices] Stored {len(rows)} records from ESIOS (fallback)")
        return True
    print("[Prices] Both ENTSO-E and ESIOS failed")
    return False

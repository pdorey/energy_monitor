"""Transform OMIE spot price + grid tariff to buy_price and export_price.

Delegates to grid_tariff module for database-driven slot resolution and costs.
Uses portuguese_holidays, grid_tariff_costs, erse_tariff_definitions.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Tuple

from .. import grid_tariff
from ..db import get_repository


def compute_buy_export_prices(
    spot_price_eur_mwh: float,
    timestamp: datetime,
    tariff_type: str = "simple",
    repo=None,
    site_settings: Optional[dict] = None,
) -> Tuple[float, float]:
    """Compute buy and export prices from spot and grid tariff.

    Args:
        spot_price_eur_mwh: OMIE day-ahead price in €/MWh.
        timestamp: Datetime (UTC) for period resolution.
        tariff_type: ERSE tariff type (simple | two_rate | three_rate | four_rate).
        repo: Optional Repository; uses get_repository() if None.
        site_settings: Optional dict; uses repo.get_site_settings() if None.

    Returns:
        Tuple of (buy_price_eur_kwh, export_price_eur_kwh).
    """
    buy_price = grid_tariff.compute_buy_price(
        spot_price_eur_mwh,
        timestamp,
        tariff_type,
        repo=repo,
        site_settings=site_settings,
    )
    export_price = grid_tariff.compute_export_price(
        spot_price_eur_mwh,
        tariff_type,
        timestamp,
        repo=repo,
    )
    return (buy_price, export_price)

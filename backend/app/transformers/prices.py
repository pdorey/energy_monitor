"""
Transform OMIE spot price + ERSE tariff definitions -> buy_price, export_price.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Tuple

from ..db import get_repository


def _hour_in_range(hour: int, ranges: list) -> bool:
    """Check if hour falls in any [start,end) range."""
    for r in ranges:
        if len(r) >= 2:
            start, end = r[0], r[1]
            if start <= hour < end:
                return True
            if start > end:  # wraps midnight
                if hour >= start or hour < end:
                    return True
    return False


def _get_access_charge(tariff: dict, hour: int) -> float:
    """Resolve access charge for given hour from tariff definition."""
    peak_hours = tariff.get("peak_hours") or {}
    if isinstance(peak_hours, str):
        import json
        peak_hours = json.loads(peak_hours) if peak_hours else {}

    peak = peak_hours.get("peak", [])
    super_off = peak_hours.get("super_off_peak", [])

    in_peak = _hour_in_range(hour, peak)
    in_super = _hour_in_range(hour, super_off)

    if in_peak:
        return tariff.get("access_charge_peak") or 0.0
    if in_super:
        return tariff.get("access_charge_super_off_peak") or 0.0
    return tariff.get("access_charge_off_peak") or 0.0


def compute_buy_export_prices(
    spot_price_eur_mwh: float,
    timestamp: datetime,
    tariff_type: str = "simple",
    repo=None,
) -> Tuple[float, float]:
    """
    Compute buy price (€/kWh) and export price (€/kWh) from spot price and ERSE tariff.
    spot_price_eur_mwh: OMIE day-ahead price in €/MWh
    Returns (buy_price_eur_kwh, export_price_eur_kwh)
    """
    repo = repo or get_repository()
    tariff = repo.get_active_erse_tariff(tariff_type, timestamp)
    if not tariff:
        # Fallback: assume 0.05 €/kWh access, 0.8 export multiplier
        access = 0.05
        export_mult = 0.8
    else:
        hour = timestamp.hour
        access = _get_access_charge(tariff, hour)
        export_mult = tariff.get("export_multiplier", 0.8)

    spot_eur_kwh = spot_price_eur_mwh / 1000.0
    buy_price = spot_eur_kwh + access
    export_price = spot_eur_kwh * export_mult
    return (buy_price, export_price)

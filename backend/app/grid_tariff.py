"""Grid tariff logic: season, day-of-week, slot resolution, and price calculation.

Central module for:
- Portuguese holidays (treated as sunday for tariff)
- Season (summer/winter) from date
- Day of week (weekday/saturday/sunday)
- Grid access lookup from grid_tariff_costs (slot ranges embedded)
- Buy price: ((spot/1000)*loss_factor + buy_spread + grid_access) * vat_rate
- Export price: spot/1000 * export_multiplier
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from .db import get_repository

# Season boundaries (Portugal: last Sunday March -> last Sunday October)
SEASON_SUMMER_START_MONTH = 3
SEASON_SUMMER_END_MONTH = 10

# Day-of-week for tariff resolution
DAY_WEEKDAY = "weekday"
DAY_SATURDAY = "saturday"
DAY_SUNDAY = "sunday"

# Slot names
SLOT_PEAK = "peak"
SLOT_STANDARD = "standard"
SLOT_OFF_PEAK = "off_peak"
SLOT_SUPER_OFF_PEAK = "super_off_peak"

# Fallbacks when DB empty
DEFAULT_GRID_ACCESS_EUR_KWH = 0.05
DEFAULT_LOSS_FACTOR = 1.08
DEFAULT_BUY_SPREAD_EUR_KWH = 0.005
DEFAULT_VAT_RATE = 1.23
DEFAULT_EXPORT_MULTIPLIER = 0.8


def _last_sunday_of_month(year: int, month: int) -> date:
    """Return the last Sunday of the given month."""
    if month == 12:
        next_first = date(year + 1, 1, 1)
    else:
        next_first = date(year, month + 1, 1)
    last = next_first.replace(day=1) - timedelta(days=1)
    days_back = (last.weekday() + 1) % 7
    return last.replace(day=last.day - days_back)


def get_season(dt: datetime) -> Literal["summer", "winter"]:
    """Return season for datetime.

    Summer: last Sunday of March to last Sunday of October (Portugal DST).
    Winter: rest of year.
    """
    d = dt.date() if isinstance(dt, datetime) else dt
    year = d.year
    summer_start = _last_sunday_of_month(year, SEASON_SUMMER_START_MONTH)
    summer_end = _last_sunday_of_month(year, SEASON_SUMMER_END_MONTH)
    if summer_start <= d <= summer_end:
        return "summer"
    return "winter"


def get_day_of_week(
    dt: datetime,
    repo=None,
) -> Literal["weekday", "saturday", "sunday"]:
    """Return day_of_week for tariff resolution.

    Holidays (from portuguese_holidays) are treated as sunday.
    Monday-Friday = weekday, Saturday = saturday, Sunday = sunday.
    """
    repo = repo or get_repository()
    d = dt.date() if isinstance(dt, datetime) else dt
    date_str = d.isoformat()[:10]
    if repo.is_holiday(date_str):
        return DAY_SUNDAY
    wd = d.weekday()
    if wd < 5:
        return DAY_WEEKDAY
    if wd == 5:
        return DAY_SATURDAY
    return DAY_SUNDAY


def get_grid_access(
    tariff_type: str,
    voltage_level: str,
    season: str,
    day_of_week: str,
    hour: int,
    minute: int = 0,
    repo=None,
) -> float:
    """Return grid_access_eur_kwh for (tariff_type, voltage_level, season, day_of_week, time).

    Looks up grid_tariff_costs where (hour, minute) falls in [start_time, end_time).
    Uses minute-level resolution for four_rate slots (e.g. 10:30 boundaries).
    Falls back to DEFAULT_GRID_ACCESS_EUR_KWH if not found.
    """
    repo = repo or get_repository()
    cost = repo.get_grid_access(tariff_type, voltage_level, season, day_of_week, hour, minute)
    return cost if cost is not None else DEFAULT_GRID_ACCESS_EUR_KWH


def compute_buy_price(
    spot_price_eur_mwh: float,
    timestamp: datetime,
    tariff_type: str,
    repo=None,
    site_settings: Optional[dict] = None,
) -> float:
    """Compute buy price (€/kWh) = ((spot/1000)*loss_factor + buy_spread + grid_access) * vat_rate.

    Args:
        spot_price_eur_mwh: OMIE spot price in €/MWh.
        timestamp: For tariff resolution.
        tariff_type: simple | two_rate | three_rate | four_rate.
        repo: Optional Repository.
        site_settings: Optional dict with voltage_level, tariff_type; uses repo.get_site_settings() if None.

    Returns:
        Buy price in €/kWh.
    """
    repo = repo or get_repository()
    settings = site_settings or repo.get_site_settings()
    voltage_level = settings.get("voltage_level", "medium_voltage")

    season = get_season(timestamp)
    day_of_week = get_day_of_week(timestamp, repo)
    hour = timestamp.hour
    minute = timestamp.minute

    grid_access = get_grid_access(
        tariff_type, voltage_level, season, day_of_week, hour, minute, repo
    )
    loss_factor = repo.get_loss_factor(tariff_type, timestamp)
    buy_spread = repo.get_buy_spread(tariff_type, timestamp)
    vat_rate = repo.get_vat_rate(tariff_type, timestamp)

    spot_eur_kwh = spot_price_eur_mwh / 1000.0
    energy_component = spot_eur_kwh * loss_factor + buy_spread
    subtotal = energy_component + grid_access
    return subtotal * vat_rate


def compute_export_price(
    spot_price_eur_mwh: float,
    tariff_type: str,
    timestamp: datetime,
    repo=None,
) -> float:
    """Compute export price (€/kWh) = spot/1000 × export_multiplier.

    Args:
        spot_price_eur_mwh: OMIE spot price in €/MWh.
        tariff_type: For export_multiplier lookup from erse_tariff_definitions.
        timestamp: For tariff validity.
        repo: Optional Repository.

    Returns:
        Export (feed-in) price in €/kWh.
    """
    repo = repo or get_repository()
    mult = repo.get_export_multiplier(tariff_type, timestamp)
    spot_eur_kwh = spot_price_eur_mwh / 1000.0
    return spot_eur_kwh * mult

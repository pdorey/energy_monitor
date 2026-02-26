"""Configuration from environment variables (mode, DB path, retention, collector config)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

def _default_data_path() -> str:
    """Default data directory: backend/data (relative to this file)."""
    return str(Path(__file__).parent.parent / "data")


def get_mode() -> str:
    """Return ENERGY_MONITOR_MODE (simulator | live)."""
    return os.environ.get("ENERGY_MONITOR_MODE", "simulator")


def get_database_path() -> str:
    """Return ENERGY_MONITOR_DB_PATH or default data dir."""
    return os.environ.get("ENERGY_MONITOR_DB_PATH", _default_data_path())


def get_retention_days() -> int:
    """Return ENERGY_MONITOR_RETENTION_DAYS for time-series retention."""
    return int(os.environ.get("ENERGY_MONITOR_RETENTION_DAYS", "7"))


def get_open_meteo_config() -> dict:
    """Return Open-Meteo config: latitude, longitude, fetch_interval_hours."""
    return {
        "latitude": float(os.environ.get("OPEN_METEO_LATITUDE", "38.7")),
        "longitude": float(os.environ.get("OPEN_METEO_LONGITUDE", "-9.1")),
        "fetch_interval_hours": int(os.environ.get("OPEN_METEO_FETCH_INTERVAL_HOURS", "6")),
    }


def get_entsoe_config() -> dict:
    """Return ENTSO-E config: token, zone, fetch_interval_hours."""
    return {
        "token": os.environ.get("ENTSOE_TOKEN", ""),
        "zone": os.environ.get("ENTSOE_ZONE", "10YPT-REN------1"),
        "fetch_interval_hours": int(os.environ.get("ENTSOE_FETCH_INTERVAL_HOURS", "1")),
    }


def get_esios_config() -> dict:
    """Return ESIOS config: api_key."""
    return {
        "api_key": os.environ.get("ESIOS_API_KEY", ""),
    }


def get_huawei_config() -> dict:
    """Return Huawei FusionSolar config: username, password, station_code."""
    return {
        "username": os.environ.get("HUAWEI_USER", ""),
        "password": os.environ.get("HUAWEI_PASS", ""),
        "station_code": os.environ.get("HUAWEI_STATION", ""),
    }


def use_simulator() -> bool:
    """True if mode is simulator (collectors and retention skipped)."""
    return get_mode().lower() == "simulator"

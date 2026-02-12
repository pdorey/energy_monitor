from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

# Default to repo root for data dir
def _default_data_path() -> str:
    return str(Path(__file__).parent.parent / "data")


def get_mode() -> str:
    return os.environ.get("ENERGY_MONITOR_MODE", "simulator")


def get_database_path() -> str:
    return os.environ.get("ENERGY_MONITOR_DB_PATH", _default_data_path())


def get_retention_days() -> int:
    return int(os.environ.get("ENERGY_MONITOR_RETENTION_DAYS", "7"))


def get_open_meteo_config() -> dict:
    return {
        "latitude": float(os.environ.get("OPEN_METEO_LATITUDE", "38.7")),
        "longitude": float(os.environ.get("OPEN_METEO_LONGITUDE", "-9.1")),
        "fetch_interval_hours": int(os.environ.get("OPEN_METEO_FETCH_INTERVAL_HOURS", "6")),
    }


def get_entsoe_config() -> dict:
    return {
        "token": os.environ.get("ENTSOE_TOKEN", ""),
        "zone": os.environ.get("ENTSOE_ZONE", "10YPT-REN------1"),
        "fetch_interval_hours": int(os.environ.get("ENTSOE_FETCH_INTERVAL_HOURS", "1")),
    }


def get_esios_config() -> dict:
    return {
        "api_key": os.environ.get("ESIOS_API_KEY", ""),
    }


def get_huawei_config() -> dict:
    return {
        "username": os.environ.get("HUAWEI_USER", ""),
        "password": os.environ.get("HUAWEI_PASS", ""),
        "station_code": os.environ.get("HUAWEI_STATION", ""),
    }


def use_simulator() -> bool:
    return get_mode().lower() == "simulator"

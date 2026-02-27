"""SQLite repository for weather, energy prices, equipment, consumption, ERSE tariffs."""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Generator, List, Optional

SCHEMA_PATH = Path(__file__).parent / "schema.sql"
SEEDS_DIR = Path(__file__).parent / "seeds"
SEED_FILES = [
    "erse_tariff_definitions.sql",
    "portuguese_holidays.sql",
    "grid_tariff_costs.sql",
    "site_settings.sql",
]


def _get_db_path(base_path: Optional[str] = None) -> str:
    """Resolve SQLite DB path. Uses base_path or config default, creates dir if needed."""
    if base_path:
        path = Path(base_path)
    else:
        path = Path(__file__).parent.parent.parent / "data"
    path.mkdir(parents=True, exist_ok=True)
    return str(path / "energy_monitor.db")


@contextmanager
def _connection(db_path: str) -> Generator[sqlite3.Connection, None, None]:
    """Context manager for SQLite connection with row_factory and commit/rollback."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


class Repository:
    """SQLite data access for weather, prices, equipment, consumption, ERSE tariffs."""

    def __init__(self, db_path: Optional[str] = None):
        """Init DB, run schema and seed if empty."""
        self.db_path = _get_db_path(db_path)
        self._init_db()

    def _init_db(self) -> None:
        """Create tables from schema.sql and run seed files when tables are empty."""
        with _connection(self.db_path) as conn:
            with open(SCHEMA_PATH, encoding="utf-8") as f:
                conn.executescript(f.read())
            cur = conn.execute("SELECT COUNT(*) FROM erse_tariff_definitions")
            if cur.fetchone()[0] == 0:
                for name in SEED_FILES:
                    path = SEEDS_DIR / name
                    if path.exists():
                        with open(path, encoding="utf-8") as f:
                            conn.executescript(f.read())
            else:
                for name in ["portuguese_holidays", "grid_tariff_costs", "site_settings"]:
                    try:
                        cur = conn.execute(f"SELECT COUNT(*) FROM {name}")
                        if cur.fetchone()[0] == 0:
                            path = SEEDS_DIR / f"{name}.sql"
                            if path.exists():
                                with open(path, encoding="utf-8") as f:
                                    conn.executescript(f.read())
                    except sqlite3.OperationalError:
                        pass

    def run_retention(self, retention_days: int = 7) -> int:
        """Delete time-series data older than retention_days.

        Returns:
            Total number of rows deleted across weather, energy_prices, equipment_snapshots,
            three_phase_metrics, consumption.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
        total = 0
        with _connection(self.db_path) as conn:
            for table in ["weather", "energy_prices", "equipment_snapshots", "three_phase_metrics", "consumption"]:
                cur = conn.execute(f"DELETE FROM {table} WHERE timestamp < ?", (cutoff,))
                total += cur.rowcount
        return total

    def insert_weather(self, timestamp: str, data: dict) -> None:
        """Insert or replace single weather row."""
        with _connection(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO weather (
                    timestamp, temperature_c, relative_humidity, cloud_cover,
                    shortwave_radiation_wm2, precipitation_mm, wind_speed_kmh, weather_code
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    timestamp,
                    data.get("temperature_c"),
                    data.get("relative_humidity"),
                    data.get("cloud_cover"),
                    data.get("shortwave_radiation_wm2"),
                    data.get("precipitation_mm"),
                    data.get("wind_speed_kmh"),
                    data.get("weather_code"),
                ),
            )

    def insert_weather_batch(self, rows: List[dict]) -> None:
        """Insert or replace batch of weather rows."""
        with _connection(self.db_path) as conn:
            for r in rows:
                conn.execute(
                    """INSERT OR REPLACE INTO weather (
                        timestamp, temperature_c, relative_humidity, cloud_cover,
                        shortwave_radiation_wm2, precipitation_mm, wind_speed_kmh, weather_code
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        r.get("timestamp"),
                        r.get("temperature_c"),
                        r.get("relative_humidity"),
                        r.get("cloud_cover"),
                        r.get("shortwave_radiation_wm2"),
                        r.get("precipitation_mm"),
                        r.get("wind_speed_kmh"),
                        r.get("weather_code"),
                    ),
                )

    def get_weather(self, days: int = 7) -> List[dict]:
        """Return weather rows from last N days, ordered by timestamp."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                "SELECT * FROM weather WHERE timestamp >= ? ORDER BY timestamp",
                (cutoff,),
            )
            return [dict(row) for row in cur.fetchall()]

    def insert_energy_price(self, timestamp: str, spot_price_eur_mwh: float, source: str) -> None:
        """Insert or replace single energy price row (source: entsoe | esios)."""
        with _connection(self.db_path) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO energy_prices (timestamp, spot_price_eur_mwh, source) VALUES (?, ?, ?)",
                (timestamp, spot_price_eur_mwh, source),
            )

    def insert_energy_prices_batch(self, rows: List[dict]) -> None:
        """Insert or replace batch of energy price rows."""
        with _connection(self.db_path) as conn:
            for r in rows:
                conn.execute(
                    "INSERT OR REPLACE INTO energy_prices (timestamp, spot_price_eur_mwh, source) VALUES (?, ?, ?)",
                    (r["timestamp"], r["spot_price_eur_mwh"], r["source"]),
                )

    def get_energy_prices(self, days: int = 2) -> List[dict]:
        """Return energy price rows from last N days, ordered by timestamp."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                "SELECT * FROM energy_prices WHERE timestamp >= ? ORDER BY timestamp",
                (cutoff,),
            )
            return [dict(row) for row in cur.fetchall()]

    def insert_equipment_snapshot(
        self,
        timestamp: str,
        equipment_id: str,
        type: str,
        power_w: Optional[float] = None,
        soc_percent: Optional[float] = None,
        raw_json: Optional[str] = None,
    ) -> None:
        """Insert equipment snapshot (type: solar | battery | grid | load | ev | heat_pump)."""
        with _connection(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO equipment_snapshots
                (timestamp, equipment_id, type, power_w, soc_percent, raw_json)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (timestamp, equipment_id, type, power_w, soc_percent, raw_json),
            )

    def insert_three_phase_metrics(
        self,
        timestamp: str,
        equipment_id: str,
        l1_voltage_v: Optional[float] = None,
        l2_voltage_v: Optional[float] = None,
        l3_voltage_v: Optional[float] = None,
        l1_current_a: Optional[float] = None,
        l2_current_a: Optional[float] = None,
        l3_current_a: Optional[float] = None,
        l1_power_w: Optional[float] = None,
        l2_power_w: Optional[float] = None,
        l3_power_w: Optional[float] = None,
        total_power_w: Optional[float] = None,
        frequency_hz: Optional[float] = None,
        power_factor: Optional[float] = None,
    ) -> None:
        """Insert three-phase metrics row for equipment."""
        with _connection(self.db_path) as conn:
            conn.execute(
                """INSERT INTO three_phase_metrics (
                    timestamp, equipment_id, l1_voltage_v, l2_voltage_v, l3_voltage_v,
                    l1_current_a, l2_current_a, l3_current_a,
                    l1_power_w, l2_power_w, l3_power_w, total_power_w,
                    frequency_hz, power_factor
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    timestamp,
                    equipment_id,
                    l1_voltage_v,
                    l2_voltage_v,
                    l3_voltage_v,
                    l1_current_a,
                    l2_current_a,
                    l3_current_a,
                    l1_power_w,
                    l2_power_w,
                    l3_power_w,
                    total_power_w,
                    frequency_hz,
                    power_factor,
                ),
            )

    def get_three_phase_metrics(self, equipment_id: str, hours: int = 24) -> List[dict]:
        """Return 3-phase metrics for equipment from last N hours, newest first."""
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                """SELECT * FROM three_phase_metrics
                WHERE equipment_id = ? AND timestamp >= ?
                ORDER BY timestamp DESC""",
                (equipment_id, cutoff),
            )
            return [dict(row) for row in cur.fetchall()]

    def insert_consumption(self, data: dict) -> None:
        """Insert or replace consumption row (load, grid, solar, battery)."""
        with _connection(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO consumption (
                    timestamp, building_load_kw, grid_kw, solar_kw, battery_kw,
                    battery_soc, ev_kw, heat_pump_kw
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    data.get("timestamp"),
                    data.get("building_load_kw"),
                    data.get("grid_kw"),
                    data.get("solar_kw"),
                    data.get("battery_kw"),
                    data.get("battery_soc"),
                    data.get("ev_kw"),
                    data.get("heat_pump_kw"),
                ),
            )

    def get_consumption(self, days: int = 7) -> List[dict]:
        """Return consumption rows from last N days, ordered by timestamp."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                "SELECT * FROM consumption WHERE timestamp >= ? ORDER BY timestamp",
                (cutoff,),
            )
            return [dict(row) for row in cur.fetchall()]

    def insert_usage_profile(
        self,
        profile_id: str,
        day_type: str,
        slot_15min: int,
        hour: int,
        typical_load_kw: float,
        typical_solar_kw: Optional[float] = None,
        typical_battery_kw: Optional[float] = None,
        typical_grid_kw: Optional[float] = None,
    ) -> None:
        """Insert or replace usage profile row (profile_id, day_type, slot_15min)."""
        with _connection(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO usage_profiles (
                    profile_id, day_type, hour, slot_15min,
                    typical_load_kw, typical_solar_kw, typical_battery_kw, typical_grid_kw
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    profile_id,
                    day_type,
                    hour,
                    slot_15min,
                    typical_load_kw,
                    typical_solar_kw,
                    typical_battery_kw,
                    typical_grid_kw,
                ),
            )

    def get_usage_profiles(self, profile_id: Optional[str] = None) -> List[dict]:
        """Return usage profiles, optionally filtered by profile_id."""
        with _connection(self.db_path) as conn:
            if profile_id:
                cur = conn.execute(
                    "SELECT * FROM usage_profiles WHERE profile_id = ? ORDER BY day_type, slot_15min",
                    (profile_id,),
                )
            else:
                cur = conn.execute("SELECT * FROM usage_profiles ORDER BY profile_id, day_type, slot_15min")
            return [dict(row) for row in cur.fetchall()]

    def get_erse_tariff_definitions(self, tariff_type: Optional[str] = None) -> List[dict]:
        """Return ERSE tariff definitions, optionally filtered by tariff_type."""
        with _connection(self.db_path) as conn:
            if tariff_type:
                cur = conn.execute(
                    "SELECT * FROM erse_tariff_definitions WHERE tariff_type = ? ORDER BY valid_from",
                    (tariff_type,),
                )
            else:
                cur = conn.execute("SELECT * FROM erse_tariff_definitions ORDER BY tariff_type, valid_from")
            return [dict(row) for row in cur.fetchall()]

    def get_active_erse_tariff(self, tariff_type: str, at: datetime) -> Optional[dict]:
        """Return tariff valid at given datetime (valid_from <= date <= valid_to)."""
        ts = at.isoformat()[:10]
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                """SELECT * FROM erse_tariff_definitions
                WHERE tariff_type = ? AND valid_from <= ? AND valid_to >= ?
                ORDER BY valid_from DESC LIMIT 1""",
                (tariff_type, ts, ts),
            )
            row = cur.fetchone()
            return dict(row) if row else None

    def insert_erse_tariff(self, data: dict) -> int:
        """Insert ERSE tariff definition. Returns new row id."""
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                """INSERT INTO erse_tariff_definitions (
                    tariff_type, valid_from, valid_to,
                    loss_factor, buy_spread_eur_kwh, vat_rate, export_multiplier
                ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    data["tariff_type"],
                    data["valid_from"],
                    data["valid_to"],
                    data.get("loss_factor", 1.08),
                    data.get("buy_spread_eur_kwh", 0.005),
                    data.get("vat_rate", 1.23),
                    data.get("export_multiplier", 0.8),
                ),
            )
            return cur.lastrowid or 0

    def update_erse_tariff(self, id: int, data: dict) -> None:
        """Update ERSE tariff by id. Merges with existing; only provided fields updated."""
        with _connection(self.db_path) as conn:
            cur = conn.execute("SELECT * FROM erse_tariff_definitions WHERE id = ?", (id,))
            row = cur.fetchone()
            if not row:
                return
            existing = dict(row)
            merged = {
                "tariff_type": data.get("tariff_type") or existing.get("tariff_type"),
                "valid_from": data.get("valid_from") or existing.get("valid_from"),
                "valid_to": data.get("valid_to") or existing.get("valid_to"),
                "loss_factor": data.get("loss_factor") if "loss_factor" in data else existing.get("loss_factor", 1.08),
                "buy_spread_eur_kwh": data.get("buy_spread_eur_kwh") if "buy_spread_eur_kwh" in data else existing.get("buy_spread_eur_kwh", 0.005),
                "vat_rate": data.get("vat_rate") if "vat_rate" in data else existing.get("vat_rate", 1.23),
                "export_multiplier": data.get("export_multiplier") if "export_multiplier" in data else existing.get("export_multiplier", 0.8),
            }
            conn.execute(
                """UPDATE erse_tariff_definitions SET
                    tariff_type=?, valid_from=?, valid_to=?,
                    loss_factor=?, buy_spread_eur_kwh=?, vat_rate=?, export_multiplier=?
                WHERE id=?""",
                (
                    merged["tariff_type"],
                    merged["valid_from"],
                    merged["valid_to"],
                    merged["loss_factor"],
                    merged["buy_spread_eur_kwh"],
                    merged["vat_rate"],
                    merged["export_multiplier"],
                    id,
                ),
            )

    def delete_erse_tariff(self, id: int) -> None:
        """Delete ERSE tariff definition by id."""
        with _connection(self.db_path) as conn:
            conn.execute("DELETE FROM erse_tariff_definitions WHERE id = ?", (id,))

    def is_holiday(self, date_str: str) -> bool:
        """Return True if date (YYYY-MM-DD) is a Portuguese holiday."""
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                "SELECT 1 FROM portuguese_holidays WHERE date = ?",
                (date_str[:10],),
            )
            return cur.fetchone() is not None

    def _parse_time_minutes(self, s: str) -> int:
        """Parse HH:MM to minutes since midnight. 24:00 -> 1440."""
        parts = str(s or "00:00").strip().split(":")
        h = int(parts[0]) if parts else 0
        m = int(parts[1]) if len(parts) > 1 else 0
        if h == 24 and m == 0:
            return 1440
        return h * 60 + m

    def _minutes_in_range(self, minutes_since_midnight: int, start_min: int, end_min: int) -> bool:
        """Check if minutes_since_midnight falls in [start_min, end_min). Handles wrap-around."""
        if start_min <= end_min:
            return start_min <= minutes_since_midnight < end_min
        return minutes_since_midnight >= start_min or minutes_since_midnight < end_min

    def get_grid_access(
        self,
        tariff_type: str,
        voltage_level: str,
        season: str,
        day_of_week: str,
        hour: int,
        minute: int = 0,
    ) -> Optional[float]:
        """Return grid_access_eur_kwh for (tariff_type, voltage_level, season, day_of_week, time).

        Finds row in grid_tariff_costs where (hour, minute) falls in [start_time, end_time).
        Uses minute-level resolution for four_rate slots (e.g. 10:30 boundaries).
        """
        minutes_since_midnight = hour * 60 + minute
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                """SELECT start_time, end_time, grid_access_eur_kwh FROM grid_tariff_costs
                WHERE tariff_type = ? AND voltage_level = ? AND season = ? AND day_of_week = ?""",
                (tariff_type, voltage_level, season, day_of_week),
            )
            for row in cur.fetchall():
                start_min = self._parse_time_minutes(row["start_time"])
                end_min = self._parse_time_minutes(row["end_time"])
                if self._minutes_in_range(minutes_since_midnight, start_min, end_min):
                    return float(row["grid_access_eur_kwh"])
        return None

    def get_slot_name(
        self,
        tariff_type: str,
        voltage_level: str,
        season: str,
        day_of_week: str,
        hour: int,
        minute: int = 0,
    ) -> Optional[str]:
        """Return slot_name for (tariff_type, voltage_level, season, day_of_week, time).

        Finds row in grid_tariff_costs where (hour, minute) falls in [start_time, end_time).
        Uses minute-level resolution for four_rate slots (e.g. 10:30 boundaries).
        """
        minutes_since_midnight = hour * 60 + minute
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                """SELECT start_time, end_time, slot_name FROM grid_tariff_costs
                WHERE tariff_type = ? AND voltage_level = ? AND season = ? AND day_of_week = ?""",
                (tariff_type, voltage_level, season, day_of_week),
            )
            for row in cur.fetchall():
                start_min = self._parse_time_minutes(row["start_time"])
                end_min = self._parse_time_minutes(row["end_time"])
                if self._minutes_in_range(minutes_since_midnight, start_min, end_min):
                    return str(row["slot_name"])
        return None

    def _get_tariff_param(
        self, tariff_type: str, at: datetime, column: str, default: float
    ) -> float:
        """Return column value from erse_tariff_definitions for tariff valid at datetime."""
        ts = at.isoformat()[:10]
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                f"""SELECT {column} FROM erse_tariff_definitions
                WHERE tariff_type = ? AND valid_from <= ? AND valid_to >= ?
                ORDER BY valid_from DESC LIMIT 1""",
                (tariff_type, ts, ts),
            )
            row = cur.fetchone()
            val = row[column] if row and row[column] is not None else None
            return float(val) if val is not None else default

    def get_loss_factor(self, tariff_type: str, at: datetime) -> float:
        """Return loss_factor from erse_tariff_definitions for tariff valid at datetime."""
        return self._get_tariff_param(tariff_type, at, "loss_factor", 1.08)

    def get_buy_spread(self, tariff_type: str, at: datetime) -> float:
        """Return buy_spread_eur_kwh from erse_tariff_definitions for tariff valid at datetime."""
        return self._get_tariff_param(tariff_type, at, "buy_spread_eur_kwh", 0.005)

    def get_vat_rate(self, tariff_type: str, at: datetime) -> float:
        """Return vat_rate from erse_tariff_definitions for tariff valid at datetime."""
        return self._get_tariff_param(tariff_type, at, "vat_rate", 1.23)

    def get_export_multiplier(self, tariff_type: str, at: datetime) -> float:
        """Return export_multiplier from erse_tariff_definitions for tariff valid at datetime."""
        return self._get_tariff_param(tariff_type, at, "export_multiplier", 0.8)

    def get_site_settings(self) -> dict:
        """Return site settings as dict (voltage_level, contracted_power_kva, assumed_daily_kwh, tariff_type)."""
        with _connection(self.db_path) as conn:
            cur = conn.execute("SELECT key, value FROM site_settings")
            rows = cur.fetchall()
        result = {
            "voltage_level": "medium_voltage",
            "contracted_power_kva": 250.0,
            "assumed_daily_kwh": 500.0,
            "tariff_type": "three_rate",
        }
        for row in rows:
            k, v = row["key"], row["value"]
            if k == "voltage_level":
                result[k] = v
            elif k == "contracted_power_kva":
                try:
                    result[k] = float(v)
                except (ValueError, TypeError):
                    pass
            elif k == "assumed_daily_kwh":
                try:
                    result[k] = float(v)
                except (ValueError, TypeError):
                    pass
            elif k == "tariff_type":
                result[k] = v
        return result

    def set_site_setting(self, key: str, value: str) -> None:
        """Set site setting key=value."""
        with _connection(self.db_path) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)",
                (key, str(value)),
            )

    def get_spot_price_for_timestamp(self, timestamp: datetime) -> Optional[float]:
        """Return spot_price_eur_mwh for timestamp, or None if no data. Uses nearest prior price."""
        ts = timestamp.isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                """SELECT spot_price_eur_mwh FROM energy_prices
                WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1""",
                (ts,),
            )
            row = cur.fetchone()
            return float(row["spot_price_eur_mwh"]) if row else None


_repo: Optional[Repository] = None


def get_repository(db_path: Optional[str] = None) -> Repository:
    """Return singleton Repository. Uses get_database_path() if db_path not provided."""
    global _repo
    if _repo is None:
        path = db_path
        if path is None:
            try:
                from ..config import get_database_path
                path = get_database_path()
            except ImportError:
                path = None
        _repo = Repository(path)
    return _repo

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Generator, List, Optional

SCHEMA_PATH = Path(__file__).parent / "schema.sql"
SEEDS_PATH = Path(__file__).parent / "seeds" / "erse_tariff_definitions.sql"


def _get_db_path(base_path: Optional[str] = None) -> str:
    if base_path:
        path = Path(base_path)
    else:
        path = Path(__file__).parent.parent.parent / "data"
    path.mkdir(parents=True, exist_ok=True)
    return str(path / "energy_monitor.db")


@contextmanager
def _connection(db_path: str) -> Generator[sqlite3.Connection, None, None]:
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
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = _get_db_path(db_path)
        self._init_db()

    def _init_db(self) -> None:
        with _connection(self.db_path) as conn:
            with open(SCHEMA_PATH, encoding="utf-8") as f:
                conn.executescript(f.read())
            if os.path.exists(SEEDS_PATH):
                # Only seed if erse_tariff_definitions is empty
                cur = conn.execute("SELECT COUNT(*) FROM erse_tariff_definitions")
                if cur.fetchone()[0] == 0:
                    with open(SEEDS_PATH, encoding="utf-8") as f:
                        conn.executescript(f.read())

    def run_retention(self, retention_days: int = 7) -> int:
        """Delete data older than retention_days. Returns number of rows deleted."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
        total = 0
        with _connection(self.db_path) as conn:
            for table in ["weather", "energy_prices", "equipment_snapshots", "three_phase_metrics", "consumption"]:
                cur = conn.execute(f"DELETE FROM {table} WHERE timestamp < ?", (cutoff,))
                total += cur.rowcount
        return total

    # --- Weather ---
    def insert_weather(self, timestamp: str, data: dict) -> None:
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
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                "SELECT * FROM weather WHERE timestamp >= ? ORDER BY timestamp",
                (cutoff,),
            )
            return [dict(row) for row in cur.fetchall()]

    # --- Energy prices ---
    def insert_energy_price(self, timestamp: str, spot_price_eur_mwh: float, source: str) -> None:
        with _connection(self.db_path) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO energy_prices (timestamp, spot_price_eur_mwh, source) VALUES (?, ?, ?)",
                (timestamp, spot_price_eur_mwh, source),
            )

    def insert_energy_prices_batch(self, rows: List[dict]) -> None:
        with _connection(self.db_path) as conn:
            for r in rows:
                conn.execute(
                    "INSERT OR REPLACE INTO energy_prices (timestamp, spot_price_eur_mwh, source) VALUES (?, ?, ?)",
                    (r["timestamp"], r["spot_price_eur_mwh"], r["source"]),
                )

    def get_energy_prices(self, days: int = 2) -> List[dict]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                "SELECT * FROM energy_prices WHERE timestamp >= ? ORDER BY timestamp",
                (cutoff,),
            )
            return [dict(row) for row in cur.fetchall()]

    # --- Equipment snapshots ---
    def insert_equipment_snapshot(
        self,
        timestamp: str,
        equipment_id: str,
        type: str,
        power_w: Optional[float] = None,
        soc_percent: Optional[float] = None,
        raw_json: Optional[str] = None,
    ) -> None:
        with _connection(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO equipment_snapshots
                (timestamp, equipment_id, type, power_w, soc_percent, raw_json)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (timestamp, equipment_id, type, power_w, soc_percent, raw_json),
            )

    # --- Three-phase metrics ---
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
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                """SELECT * FROM three_phase_metrics
                WHERE equipment_id = ? AND timestamp >= ?
                ORDER BY timestamp DESC""",
                (equipment_id, cutoff),
            )
            return [dict(row) for row in cur.fetchall()]

    # --- Consumption ---
    def insert_consumption(self, data: dict) -> None:
        with _connection(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO consumption (
                    timestamp, building_load_kw, grid_kw, solar_kw, battery_kw,
                    battery_soc, ev_kw, heat_pump_kw,
                    spot_price_eur_mwh, buy_price_eur_kwh, export_price_eur_kwh, tariff
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    data.get("timestamp"),
                    data.get("building_load_kw"),
                    data.get("grid_kw"),
                    data.get("solar_kw"),
                    data.get("battery_kw"),
                    data.get("battery_soc"),
                    data.get("ev_kw"),
                    data.get("heat_pump_kw"),
                    data.get("spot_price_eur_mwh"),
                    data.get("buy_price_eur_kwh"),
                    data.get("export_price_eur_kwh"),
                    data.get("tariff"),
                ),
            )

    def get_consumption(self, days: int = 7) -> List[dict]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                "SELECT * FROM consumption WHERE timestamp >= ? ORDER BY timestamp",
                (cutoff,),
            )
            return [dict(row) for row in cur.fetchall()]

    # --- Usage profiles ---
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
        with _connection(self.db_path) as conn:
            if profile_id:
                cur = conn.execute(
                    "SELECT * FROM usage_profiles WHERE profile_id = ? ORDER BY day_type, slot_15min",
                    (profile_id,),
                )
            else:
                cur = conn.execute("SELECT * FROM usage_profiles ORDER BY profile_id, day_type, slot_15min")
            return [dict(row) for row in cur.fetchall()]

    # --- ERSE tariff definitions ---
    def get_erse_tariff_definitions(self, tariff_type: Optional[str] = None) -> List[dict]:
        with _connection(self.db_path) as conn:
            if tariff_type:
                cur = conn.execute(
                    "SELECT * FROM erse_tariff_definitions WHERE tariff_type = ? ORDER BY valid_from",
                    (tariff_type,),
                )
            else:
                cur = conn.execute("SELECT * FROM erse_tariff_definitions ORDER BY tariff_type, valid_from")
            rows = cur.fetchall()
            out = []
            for row in rows:
                d = dict(row)
                if d.get("peak_hours_json"):
                    try:
                        d["peak_hours"] = json.loads(d["peak_hours_json"])
                    except json.JSONDecodeError:
                        d["peak_hours"] = {}
                out.append(d)
            return out

    def get_active_erse_tariff(self, tariff_type: str, at: datetime) -> Optional[dict]:
        ts = at.isoformat()
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                """SELECT * FROM erse_tariff_definitions
                WHERE tariff_type = ? AND valid_from <= ? AND valid_to >= ?
                ORDER BY valid_from DESC LIMIT 1""",
                (tariff_type, ts[:10], ts[:10]),
            )
            row = cur.fetchone()
            if row:
                d = dict(row)
                if d.get("peak_hours_json"):
                    try:
                        d["peak_hours"] = json.loads(d["peak_hours_json"])
                    except json.JSONDecodeError:
                        d["peak_hours"] = {}
                return d
            return None

    def insert_erse_tariff(self, data: dict) -> int:
        with _connection(self.db_path) as conn:
            cur = conn.execute(
                """INSERT INTO erse_tariff_definitions (
                    tariff_type, valid_from, valid_to, peak_hours_json,
                    access_charge_peak, access_charge_off_peak, access_charge_super_off_peak,
                    export_multiplier
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    data["tariff_type"],
                    data["valid_from"],
                    data["valid_to"],
                    json.dumps(data.get("peak_hours", {})),
                    data.get("access_charge_peak"),
                    data.get("access_charge_off_peak"),
                    data.get("access_charge_super_off_peak"),
                    data.get("export_multiplier", 0.8),
                ),
            )
            return cur.lastrowid or 0

    def update_erse_tariff(self, id: int, data: dict) -> None:
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
                "access_charge_peak": data.get("access_charge_peak") if "access_charge_peak" in data else existing.get("access_charge_peak"),
                "access_charge_off_peak": data.get("access_charge_off_peak") if "access_charge_off_peak" in data else existing.get("access_charge_off_peak"),
                "access_charge_super_off_peak": data.get("access_charge_super_off_peak") if "access_charge_super_off_peak" in data else existing.get("access_charge_super_off_peak"),
                "export_multiplier": data.get("export_multiplier") if "export_multiplier" in data else existing.get("export_multiplier", 0.8),
            }
            peak_json = json.dumps(data["peak_hours"]) if "peak_hours" in data and data["peak_hours"] is not None else existing.get("peak_hours_json") or "{}"
            conn.execute(
                """UPDATE erse_tariff_definitions SET
                    tariff_type=?, valid_from=?, valid_to=?, peak_hours_json=?,
                    access_charge_peak=?, access_charge_off_peak=?, access_charge_super_off_peak=?,
                    export_multiplier=?
                WHERE id=?""",
                (
                    merged["tariff_type"],
                    merged["valid_from"],
                    merged["valid_to"],
                    peak_json,
                    merged["access_charge_peak"],
                    merged["access_charge_off_peak"],
                    merged["access_charge_super_off_peak"],
                    merged["export_multiplier"],
                    id,
                ),
            )

    def delete_erse_tariff(self, id: int) -> None:
        with _connection(self.db_path) as conn:
            conn.execute("DELETE FROM erse_tariff_definitions WHERE id = ?", (id,))


_repo: Optional[Repository] = None


def get_repository(db_path: Optional[str] = None) -> Repository:
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

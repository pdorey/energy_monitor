"""7-day CSV-driven energy simulator with weekday/weekend profiles and 3-phase metrics."""
from __future__ import annotations

import csv
import os
import random
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Deque, Dict, List, Optional

from .models import (
    Snapshot,
    SolarMetrics,
    BatteryMetrics,
    GridMetrics,
    LoadMetrics,
    Overview,
    EquipmentItem,
    TimeseriesPoint,
    AnalyticsResponse,
    AnalyticsSeries,
    ThreePhaseMetrics,
)


def _parse_float(row: dict, field: str) -> float:
    """Parse float from CSV row field. Returns 0.0 on missing or invalid."""
    val = (row.get(field) or "").strip()
    try:
        return float(val) if val else 0.0
    except ValueError:
        return 0.0


def _synthetic_three_phase(total_power_w: float) -> ThreePhaseMetrics:
    """Generate balanced 3-phase metrics with small random imbalance.

    Args:
        total_power_w: Total power to distribute across L1, L2, L3.

    Returns:
        ThreePhaseMetrics with voltages, currents, powers, frequency, power factor.
    """
    base = total_power_w / 3.0
    imbalance = 0.08
    l1 = base * (1 + random.uniform(-imbalance, imbalance))
    l2 = base * (1 + random.uniform(-imbalance, imbalance))
    l3 = total_power_w - l1 - l2
    v = 230.0 + random.uniform(-3, 3)
    return ThreePhaseMetrics(
        l1_voltage_v=v,
        l2_voltage_v=v + random.uniform(-1, 1),
        l3_voltage_v=v + random.uniform(-1, 1),
        l1_current_a=l1 / v if v > 0 else 0,
        l2_current_a=l2 / v if v > 0 else 0,
        l3_current_a=l3 / v if v > 0 else 0,
        l1_power_w=l1,
        l2_power_w=l2,
        l3_power_w=l3,
        total_power_w=total_power_w,
        frequency_hz=50.0 + random.uniform(-0.05, 0.05),
        power_factor=0.98 + random.uniform(0, 0.02),
    )


class Simulator:
    """
    7-day energy simulator with weekday/weekend profiles.

    Uses Consumption.csv as base (96 rows, 15-min intervals = 24h weekday).
    - Mon-Fri: weekday profile from CSV, randomized
    - Sat-Sun: weekend profile (reduced load ~40% for office building)
    - Equipment: solar, battery, grid, load, EV charger, heat pump
    - 3-phase: synthetic L1/L2/L3 for grid and load
    """

    BATTERY_CAPACITY_KWH = 400.0
    SLOTS_PER_DAY = 96
    DAYS = 7
    TOTAL_SLOTS = SLOTS_PER_DAY * DAYS

    def __init__(self, history_hours: int = 24, step_seconds: int = 900) -> None:
        """Load Consumption.csv, init slot index and history deques."""
        here = os.path.dirname(__file__)
        candidates = [
            os.path.abspath(os.path.join(here, "..", "..")),
            os.path.abspath(os.path.join(here, "..")),
            os.getcwd(),
        ]
        root_dir = candidates[0]
        for candidate in candidates:
            if os.path.exists(os.path.join(candidate, "Consumption.csv")):
                root_dir = candidate
                break

        consumption_csv = os.path.join(root_dir, "Consumption.csv")
        self._weekday_rows: list[dict] = []
        self._csv_path = consumption_csv

        if os.path.exists(consumption_csv):
            try:
                with open(consumption_csv, newline="", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        if not any(row.values()):
                            continue
                        row_clean = {
                            (k or "").strip().lstrip("\ufeff"): v for k, v in row.items()
                        }
                        self._weekday_rows.append(row_clean)
                print(f"[Simulator] Loaded {len(self._weekday_rows)} weekday rows from {consumption_csv}")
            except Exception as e:
                print(f"[Simulator] ERROR loading CSV: {e}")
        else:
            print(f"[Simulator] WARNING: Consumption.csv not found at {consumption_csv}")

        self._slot = 0
        self._last_slot = 0  # slot of last processed row (used by get_current_row)
        self._last_processed_row: Optional[dict] = None
        self._last_snapshot: Optional[Snapshot] = None
        self.battery_soc = 91.0
        if self._weekday_rows:
            soc_raw = (self._weekday_rows[0].get("BATTERY SOC") or "").strip().rstrip("%")
            if soc_raw:
                try:
                    self.battery_soc = float(soc_raw)
                except ValueError:
                    pass

        max_points = int(history_hours * 3600 / step_seconds)
        self.history: Dict[str, Deque[TimeseriesPoint]] = {
            "solar_kw": deque(maxlen=max_points),
            "battery_soc": deque(maxlen=max_points),
            "grid_kw": deque(maxlen=max_points),
            "load_kw": deque(maxlen=max_points),
        }

    def _is_weekend(self, slot: int) -> bool:
        """True if slot falls on Saturday or Sunday (day 5 or 6)."""
        day = slot // self.SLOTS_PER_DAY
        return day >= 5  # Saturday=5, Sunday=6

    def _get_row_for_slot(self, slot: int) -> Optional[dict]:
        """Get CSV row for slot (wraps to 96 rows). Returns None if no data."""
        if not self._weekday_rows:
            return None
        csv_idx = slot % self.SLOTS_PER_DAY
        row = self._weekday_rows[csv_idx].copy()
        return row

    def _apply_randomization(self, val: float) -> float:
        """Apply ±10% random variation to value."""
        return val * (1 + random.uniform(-0.1, 0.1))

    def _get_current_row(self) -> Optional[dict]:
        """Compute current row with weekend scaling, EV, heat pump, randomization."""
        slot = self._slot
        row = self._get_row_for_slot(slot)
        if row is None:
            return None
        is_weekend = self._is_weekend(slot)
        csv_idx = slot % self.SLOTS_PER_DAY
        slot_in_day = csv_idx % 24 * 4 + (csv_idx // 24)  # rough hour*4 for 15-min
        hour_frac = csv_idx / self.SLOTS_PER_DAY  # 0..1 for time of day

        building_load_kw = _parse_float(row, "BUILDING LOAD PWR")
        grid_kw = _parse_float(row, "GRID PWR")
        battery_kw = _parse_float(row, "BATTERY PWR")
        solar_kw = _parse_float(row, "SOLAR PWR")

        if is_weekend:
            building_load_kw *= 0.4
            solar_kw *= 1.0  # same solar curve
            battery_kw *= 0.5
            grid_kw = building_load_kw - solar_kw - battery_kw

        building_load_kw = max(0, self._apply_randomization(building_load_kw))
        solar_kw = max(0, self._apply_randomization(solar_kw))
        battery_kw = self._apply_randomization(battery_kw)
        grid_kw = self._apply_randomization(building_load_kw - solar_kw - battery_kw) if is_weekend else self._apply_randomization(grid_kw)

        soc_raw = (row.get("BATTERY SOC") or "").strip().rstrip("%")
        if soc_raw:
            try:
                self.battery_soc = float(soc_raw)
                if is_weekend:
                    self.battery_soc *= (0.9 + random.uniform(0, 0.1))
            except ValueError:
                pass
        self.battery_soc = max(0, min(100, self.battery_soc))

        # EV: charging during office hours (slots 32-72 = 8h-18h), ~20kW when charging
        ev_kw = 0.0
        if 32 <= csv_idx <= 72 and not is_weekend:
            ev_kw = 15.0 + random.uniform(-5, 5)
        ev_kw = max(0, ev_kw)

        # Heat pump: HVAC ~15% of load, cooling in afternoon
        heat_pump_kw = building_load_kw * 0.15
        if hour_frac > 0.4:  # afternoon
            heat_pump_kw *= 1.2
        heat_pump_kw = max(0, self._apply_randomization(heat_pump_kw))

        return {
            "building_load_kw": building_load_kw,
            "grid_kw": grid_kw,
            "battery_kw": battery_kw,
            "solar_kw": solar_kw,
            "battery_soc": self.battery_soc,
            "ev_kw": ev_kw,
            "heat_pump_kw": heat_pump_kw,
            "spot_price": _parse_float(row, "SPOT PRICE"),
            "tariff": (row.get("TARIFF") or "").strip(),
        }

    def get_current_slot_info(self) -> tuple[str, int]:
        """Return (day_of_week, hour) for current slot. day_of_week: weekday|saturday|sunday."""
        slot = self._last_slot
        day = slot // self.SLOTS_PER_DAY
        csv_idx = slot % self.SLOTS_PER_DAY
        hour = (csv_idx // 4) % 24
        if day >= 5:
            dow = "sunday" if day == 6 else "saturday"
        else:
            dow = "weekday"
        return (dow, hour)

    def get_current_row(self) -> Optional[dict]:
        """Row for /api/consumption-data. Format compatible with CSV columns (TIME, PATH, etc)."""
        if self._last_processed_row is None:
            return None
        slot = self._last_slot
        csv_idx = slot % self.SLOTS_PER_DAY
        hour = (csv_idx // 4) % 24
        minute = (csv_idx % 4) * 15
        time_str = f"{hour:02d}:{minute:02d}"
        r = self._last_processed_row
        raw = self._get_row_for_slot(slot)
        path_val = (raw.get("PATH") or "a").strip() if raw else "a"
        return {
            "TIME": time_str,
            "PATH": path_val,
            "BUILDING LOAD PWR": str(r["building_load_kw"]),
            "BUILDING LOAD LABEL": (raw.get("BUILDING LOAD LABEL") or "Grid only").strip() if raw else "Grid only",
            "GRID PWR": str(r["grid_kw"]),
            "GRID LABEL": (raw.get("GRID LABEL") or "Importing").strip() if raw else "Importing",
            "BATTERY PWR": str(r["battery_kw"]),
            "BATTERY LABEL": (raw.get("BATTERY LABEL") or "Idle").strip() if raw else "Idle",
            "BATTERY SOC": f"{r['battery_soc']:.0f}%",
            "SOLAR PWR": str(r["solar_kw"]),
            "SOLAR LABEL": (raw.get("SOLAR LABEL") or ("Active" if r["solar_kw"] > 0 else "Inactive")).strip() if raw else ("Active" if r["solar_kw"] > 0 else "Inactive"),
            "BUILDING CONSUMPTION": (raw.get("BUILDING CONSUMPTION") or "0").strip() if raw else "0",
            "GRID ENERGY": (raw.get("GRID ENERGY") or "0").strip() if raw else "0",
            "SOLAR PRODUCTION": (raw.get("SOLAR PRODUCTION") or "0").strip() if raw else "0",
            "BATTERY": (raw.get("BATTERY") or "0").strip() if raw else "0",
            "SPOT PRICE": str(r["spot_price"]),
            "TARIFF": r["tariff"],
            "BUY PRICE": (raw.get("BUY PRICE") or str(r["spot_price"] * 3.2)).strip() if raw else str(r["spot_price"] * 3.2),
            "EXPORT PRICE": (raw.get("EXPORT PRICE") or str(r["spot_price"] * 0.8)).strip() if raw else str(r["spot_price"] * 0.8),
        }

    def get_all_rows(self) -> list[dict]:
        """Return copy of all weekday CSV rows (96 rows)."""
        return self._weekday_rows.copy() if self._weekday_rows else []

    def generate_snapshot(self) -> Snapshot:
        """Advance slot, compute current row, build Snapshot with solar/battery/grid/load/3-phase."""
        now = datetime.now(timezone.utc)
        self._last_slot = self._slot
        row = self._get_current_row()
        self._last_processed_row = row
        self._slot = (self._slot + 1) % self.TOTAL_SLOTS

        if row is None:
            row = {
                "building_load_kw": 0.0,
                "grid_kw": 0.0,
                "battery_kw": 0.0,
                "solar_kw": 0.0,
                "battery_soc": self.battery_soc,
                "ev_kw": 0.0,
                "heat_pump_kw": 0.0,
                "spot_price": 0.0,
                "tariff": "",
            }

        building_load_w = row["building_load_kw"] * 1000.0
        grid_w = row["grid_kw"] * 1000.0
        battery_w = row["battery_kw"] * 1000.0
        pv_w = row["solar_kw"] * 1000.0

        solar = SolarMetrics(
            power_w=pv_w,
            voltage_v=230.0 + random.uniform(-2, 2),
            current_a=pv_w / 230.0 if pv_w > 0 else 0.0,
        )
        battery = BatteryMetrics(
            power_w=battery_w,
            soc_percent=row["battery_soc"],
            capacity_kwh=self.BATTERY_CAPACITY_KWH,
            voltage_v=400.0 + random.uniform(-5, 5),
            temperature_c=25.0 + abs(battery_w) / 1000.0,
        )
        grid = GridMetrics(
            power_w=grid_w,
            voltage_v=230.0 + random.uniform(-2, 2),
            current_a=abs(grid_w) / 230.0 if grid_w != 0 else 0.0,
            frequency_hz=50.0 + random.uniform(-0.05, 0.05),
        )
        load = LoadMetrics(
            power_w=building_load_w,
            voltage_v=230.0 + random.uniform(-2, 2),
            current_a=building_load_w / 230.0 if building_load_w > 0 else 0.0,
        )

        three_phase = {
            "grid": _synthetic_three_phase(grid_w).model_dump(),
            "load": _synthetic_three_phase(building_load_w).model_dump(),
        }
        ev = {
            "power_w": row["ev_kw"] * 1000,
            "soc_percent": 0.0,
            "charging_state": 2 if row["ev_kw"] > 0 else 0,
        }
        heat_pump = {
            "power_w": row["heat_pump_kw"] * 1000,
            "mode": "cool" if now.hour >= 12 else "heat",
            "setpoint_c": 22.0,
        }

        snapshot = Snapshot(
            timestamp=now,
            solar=solar,
            battery=battery,
            grid=grid,
            load=load,
            three_phase=three_phase,
            ev=ev,
            heat_pump=heat_pump,
        )

        self.history["solar_kw"].append(TimeseriesPoint(t=now, v=snapshot.solar.power_w / 1000.0))
        self.history["battery_soc"].append(TimeseriesPoint(t=now, v=snapshot.battery.soc_percent))
        self.history["grid_kw"].append(TimeseriesPoint(t=now, v=snapshot.grid.power_w / 1000.0))
        self.history["load_kw"].append(TimeseriesPoint(t=now, v=snapshot.load.power_w / 1000.0))

        self._last_snapshot = snapshot
        return snapshot

    def build_overview(self, snapshot: Snapshot, uptime_seconds: int) -> Overview:
        """Build Overview from snapshot (equipment count, uptime, solar, battery, grid, load)."""
        return Overview(
            timestamp=snapshot.timestamp,
            total_equipment=6,
            online_equipment=6,
            uptime_seconds=uptime_seconds,
            solar_kw=snapshot.solar.power_w / 1000.0,
            battery_kw=snapshot.battery.power_w / 1000.0,
            battery_soc_percent=snapshot.battery.soc_percent,
            grid_kw=snapshot.grid.power_w / 1000.0,
            load_kw=snapshot.load.power_w / 1000.0,
        )

    def build_equipment(self, snapshot: Snapshot) -> List[EquipmentItem]:
        """Build list of EquipmentItem from snapshot (solar, battery, grid, load, EV, heat pump)."""
        ev_pwr = snapshot.ev.get("power_w", 0) if snapshot.ev else 0
        hp_pwr = snapshot.heat_pump.get("power_w", 0) if snapshot.heat_pump else 0
        return [
            EquipmentItem(
                equipment_id="solar_001",
                name="Solar Inverter",
                type="solar",
                status="online",
                location="Rooftop",
                metrics={
                    "power_w": snapshot.solar.power_w,
                    "voltage_v": snapshot.solar.voltage_v,
                    "current_a": snapshot.solar.current_a,
                },
            ),
            EquipmentItem(
                equipment_id="battery_001",
                name="Battery System",
                type="battery",
                status="online",
                location="Battery Room",
                metrics={
                    "power_w": snapshot.battery.power_w,
                    "soc_percent": snapshot.battery.soc_percent,
                    "capacity_kwh": snapshot.battery.capacity_kwh,
                    "temperature_c": snapshot.battery.temperature_c,
                },
            ),
            EquipmentItem(
                equipment_id="grid_001",
                name="Grid Connection",
                type="grid",
                status="online",
                location="Main Panel",
                metrics={
                    "power_w": snapshot.grid.power_w,
                    "voltage_v": snapshot.grid.voltage_v,
                    "frequency_hz": snapshot.grid.frequency_hz,
                },
            ),
            EquipmentItem(
                equipment_id="load_001",
                name="Building Load",
                type="load",
                status="online",
                location="Building",
                metrics={
                    "power_w": snapshot.load.power_w,
                    "voltage_v": snapshot.load.voltage_v,
                },
            ),
            EquipmentItem(
                equipment_id="ev_001",
                name="EV Charger",
                type="ev",
                status="online",
                location="Parking",
                metrics={
                    "power_w": ev_pwr,
                    "charging_state": snapshot.ev.get("charging_state", 0) if snapshot.ev else 0,
                },
            ),
            EquipmentItem(
                equipment_id="heat_pump_001",
                name="Heat Pump HVAC",
                type="heat_pump",
                status="online",
                location="HVAC Room",
                metrics={
                    "power_w": hp_pwr,
                    "mode": snapshot.heat_pump.get("mode", "idle") if snapshot.heat_pump else "idle",
                    "setpoint_c": snapshot.heat_pump.get("setpoint_c", 22) if snapshot.heat_pump else 22,
                },
            ),
        ]

    def build_analytics(self, hours: int, resolution_minutes: int) -> AnalyticsResponse:
        """Build AnalyticsResponse from history deques, downsampled to resolution_minutes."""
        now = datetime.now(timezone.utc)
        from_ts = now - timedelta(hours=hours)

        def downsample(points: Deque[TimeseriesPoint]) -> List[TimeseriesPoint]:
            if not points:
                return []
            bucket_size = timedelta(minutes=resolution_minutes)
            buckets: Dict[int, List[float]] = {}
            bucket_times: Dict[int, datetime] = {}

            for p in points:
                if p.t < from_ts:
                    continue
                idx = int((p.t - from_ts).total_seconds() // bucket_size.total_seconds())
                buckets.setdefault(idx, []).append(p.v)
                bucket_times.setdefault(idx, p.t)

            out: List[TimeseriesPoint] = []
            for idx in sorted(buckets.keys()):
                vals = buckets[idx]
                out.append(TimeseriesPoint(t=bucket_times[idx], v=sum(vals) / len(vals)))
            return out

        series = [
            AnalyticsSeries(metric="solar_kw", points=downsample(self.history["solar_kw"])),
            AnalyticsSeries(metric="battery_soc", points=downsample(self.history["battery_soc"])),
            AnalyticsSeries(metric="grid_kw", points=downsample(self.history["grid_kw"])),
            AnalyticsSeries(metric="load_kw", points=downsample(self.history["load_kw"])),
        ]

        return AnalyticsResponse(from_ts=from_ts, to_ts=now, series=series)

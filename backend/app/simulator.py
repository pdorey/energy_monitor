from __future__ import annotations

import csv
import os
import random
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Deque, Dict, List

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
)


class Simulator:
    """
    CSV‑driven energy simulator.

    All building, grid, battery, solar power and battery SOC values come directly
    from `Consumption.csv` in 15‑minute steps over a 24‑hour period. When the
    last row is reached, the simulator loops back to the first row and repeats
    the 24‑hour cycle indefinitely (time‑compressed according to `time_compression`).
    """

    BATTERY_CAPACITY_KWH = 400.0

    def __init__(self, history_hours: int = 24, step_seconds: int = 2) -> None:
        self.battery_soc = 60.0
        self.start_time = datetime.now(timezone.utc)
        self.last_update = self.start_time
        self.step_seconds = step_seconds
        # Compress 24 hours into 2 minutes: 24 * 3600 / 120 = 720x speedup
        self.time_compression = 720.0

        max_points = int(history_hours * 3600 / step_seconds)
        self.history: Dict[str, Deque[TimeseriesPoint]] = {
            "solar_kw": deque(maxlen=max_points),
            "battery_soc": deque(maxlen=max_points),
            "grid_kw": deque(maxlen=max_points),
            "load_kw": deque(maxlen=max_points),
        }

        # Path to consumption CSV (15‑minute rows, full 24h)
        root_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..")
        self._consumption_csv = os.path.join(root_dir, "Consumption.csv")

    # --- internal helpers -------------------------------------------------

    def _load_consumption_rows(self) -> list[dict]:
        """Load all rows from Consumption.csv (reloaded each time to pick up edits)."""
        if not os.path.exists(self._consumption_csv):
            return []
        try:
            with open(self._consumption_csv, newline="") as f:
                reader = csv.DictReader(f)
                return [row for row in reader if any(row.values())]
        except Exception:
            return []

    def _get_consumption_row(self, t: datetime) -> dict | None:
        """
        Return the current 15‑minute interval row from Consumption.csv, if loaded.

        Index is based purely on elapsed simulated time, modulo the number of rows,
        so we repeat the 24‑hour pattern indefinitely.
        """
        rows = self._load_consumption_rows()
        if not rows:
            return None

        elapsed_seconds = (t - self.start_time).total_seconds()
        simulated_seconds = elapsed_seconds * self.time_compression
        # 900 seconds = 15 minutes
        idx = int(simulated_seconds / 900.0) % len(rows)
        return rows[idx]

    # --- public API -------------------------------------------------------

    def generate_snapshot(self) -> Snapshot:
        now = datetime.now(timezone.utc)
        self.last_update = now
        row = self._get_consumption_row(now)

        # Defaults if CSV is missing
        building_load_w = 0.0
        grid_w = 0.0
        battery_w = 0.0
        pv_w = 0.0

        if row is not None:
            def parse_float(field: str) -> float:
                val = (row.get(field) or "").strip()
                try:
                    return float(val) if val else 0.0
                except ValueError:
                    return 0.0

            # kW values from CSV
            building_load_kw = parse_float("BUILDING LOAD PWR")
            grid_kw = parse_float("GRID PWR")
            battery_kw = parse_float("BATTERY PWR")
            solar_kw = parse_float("SOLAR PWR")

            building_load_w = building_load_kw * 1000.0
            grid_w = grid_kw * 1000.0
            battery_w = battery_kw * 1000.0
            pv_w = solar_kw * 1000.0

            # Battery SOC from CSV (e.g. "91%")
            soc_raw = (row.get("BATTERY SOC") or "").strip()
            if soc_raw.endswith("%"):
                soc_raw = soc_raw[:-1]
            if soc_raw:
                try:
                    self.battery_soc = float(soc_raw)
                except ValueError:
                    pass

        # Slight randomness only for voltages/temperature for realism
        solar = SolarMetrics(
            power_w=pv_w,
            voltage_v=230.0 + random.uniform(-2, 2),
            current_a=pv_w / 230.0 if pv_w > 0 else 0.0,
        )
        battery = BatteryMetrics(
            power_w=battery_w,
            soc_percent=self.battery_soc,
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

        snapshot = Snapshot(
            timestamp=now,
            solar=solar,
            battery=battery,
            grid=grid,
            load=load,
        )

        # store in history (kW, SOC)
        self.history["solar_kw"].append(TimeseriesPoint(t=now, v=snapshot.solar.power_w / 1000.0))
        self.history["battery_soc"].append(TimeseriesPoint(t=now, v=snapshot.battery.soc_percent))
        self.history["grid_kw"].append(TimeseriesPoint(t=now, v=snapshot.grid.power_w / 1000.0))
        self.history["load_kw"].append(TimeseriesPoint(t=now, v=snapshot.load.power_w / 1000.0))

        return snapshot

    def build_overview(self, snapshot: Snapshot, uptime_seconds: int) -> Overview:
        return Overview(
            timestamp=snapshot.timestamp,
            total_equipment=4,
            online_equipment=4,
            uptime_seconds=uptime_seconds,
            solar_kw=snapshot.solar.power_w / 1000.0,
            battery_kw=snapshot.battery.power_w / 1000.0,
            battery_soc_percent=snapshot.battery.soc_percent,
            grid_kw=snapshot.grid.power_w / 1000.0,
            load_kw=snapshot.load.power_w / 1000.0,
        )

    def build_equipment(self, snapshot: Snapshot) -> List[EquipmentItem]:
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
        ]

    def build_analytics(self, hours: int, resolution_minutes: int) -> AnalyticsResponse:
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


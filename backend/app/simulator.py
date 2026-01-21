from __future__ import annotations

import csv
import math
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
    """In-memory synthetic energy simulator for demo use."""

    # config
    BATTERY_CAPACITY_KWH = 400.0
    BATTERY_MIN_SOC = 10.0
    BATTERY_MAX_SOC = 95.0
    BATTERY_CHARGE_MAX_W = 400_000.0
    BATTERY_DISCHARGE_MAX_W = 400_000.0

    PV_PEAK_JAN_W = 35_000.0
    PV_PEAK_JUN_W = 55_000.0

    OFFICE_BASE_LOAD_W = 15_000.0
    OFFICE_PEAK_LOAD_W = 80_000.0

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

        # Pre-load consumption CSV if available
        root_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..")
        consumption_csv = os.path.join(root_dir, "Consumption.csv")
        self._consumption_rows: list[dict] = []
        if os.path.exists(consumption_csv):
            try:
                with open(consumption_csv, newline="") as f:
                    reader = csv.DictReader(f)
                    self._consumption_rows = [row for row in reader if any(row.values())]
            except Exception:
                # Fallback to synthetic profiles if CSV cannot be read
                self._consumption_rows = []

    # --- internal helpers -------------------------------------------------

    @staticmethod
    def _is_january(dt: datetime) -> bool:
        return dt.month == 1

    def _pv_profile_w(self, t: datetime, peak_jan: float, peak_jun: float) -> float:
        # Calculate simulated hour (0-23) based on elapsed time since start
        elapsed_seconds = (t - self.start_time).total_seconds()
        simulated_hour = (elapsed_seconds * self.time_compression / 3600.0) % 24.0
        
        # Solar production: sunrise around 6am, sunset around 7pm
        if simulated_hour < 6 or simulated_hour > 19:
            return 0.0

        peak = peak_jan if t.month in (11, 12, 1, 2) else peak_jun
        # Smooth curve from sunrise to sunset
        x = (simulated_hour - 6) / 13.0 * math.pi
        bell = max(0.0, math.sin(x))
        return peak * bell

    def _office_load_profile_w(self, t: datetime) -> float:
        # Calculate simulated hour (0-23) based on elapsed time since start
        elapsed_seconds = (t - self.start_time).total_seconds()
        simulated_hour = (elapsed_seconds * self.time_compression / 3600.0) % 24.0
        
        base = self.OFFICE_BASE_LOAD_W
        peak = self.OFFICE_PEAK_LOAD_W

        # Night: residual power usage (base load)
        if 0 <= simulated_hour < 6:
            load = base
        # Morning ramp-up
        elif 6 <= simulated_hour < 9:
            frac = (simulated_hour - 6) / 3.0
            load = base + frac * (peak * 0.85 - base)
        # Working day (9am-5pm)
        elif 9 <= simulated_hour < 17:
            x = (simulated_hour - 9) / 8.0
            hump = 0.1 * peak * (1 - ((x - 0.75) / 0.75) ** 2)
            load = peak * 0.9 + max(0.0, hump)
        # Evening ramp-down
        elif 17 <= simulated_hour < 20:
            frac = (20 - simulated_hour) / 3.0
            load = base + frac * (peak * 0.8 - base)
        # Night: residual power usage
        else:
            load = base

        if self._is_january(t):
            load *= 1.1

        return load

    @staticmethod
    def _weather_factor(t: datetime) -> float:
        day = t.timetuple().tm_yday
        if day % 7 == 2:
            return 0.1  # rainy
        if day % 3 == 1:
            return 0.5  # cloudy
        return 1.0     # clear

    def _compute_battery_and_grid(self, building_load_w: float, pv_w: float, dt_hours: float, t: datetime) -> tuple[float, float]:
        # Calculate simulated hour for cheap energy hours logic
        elapsed_seconds = (t - self.start_time).total_seconds()
        simulated_hour = (elapsed_seconds * self.time_compression / 3600.0) % 24.0
        
        net_without_batt = building_load_w - pv_w
        battery_w = 0.0
        grid_w = 0.0

        # Cheap energy hours (12-2pm): prioritize charging battery from grid
        is_cheap_hours = 12 <= simulated_hour < 14
        if is_cheap_hours and self.battery_soc < self.BATTERY_MAX_SOC:
            # Charge battery from grid during cheap hours
            max_charge = self.BATTERY_CHARGE_MAX_W
            if self.battery_soc >= 60.0:
                max_charge *= 0.5
            # Use up to 15kW from grid for charging during cheap hours
            grid_charge_w = min(max_charge, 15_000.0)
            battery_w = grid_charge_w
            delta_soc = (grid_charge_w * dt_hours) / (self.BATTERY_CAPACITY_KWH * 1000) * 100.0
            self.battery_soc = min(self.BATTERY_MAX_SOC, self.battery_soc + delta_soc)
            # Grid supplies building load plus battery charging
            grid_w = building_load_w + grid_charge_w
        elif net_without_batt <= 0:
            # Surplus: solar exceeds building load
            surplus = -net_without_batt
            if self.battery_soc < self.BATTERY_MAX_SOC:
                max_charge = self.BATTERY_CHARGE_MAX_W
                if self.battery_soc >= 60.0:
                    max_charge *= 0.5
                charge_w = min(surplus, max_charge)
                battery_w = charge_w
                surplus -= charge_w
                delta_soc = (charge_w * dt_hours) / (self.BATTERY_CAPACITY_KWH * 1000) * 100.0
                self.battery_soc = min(self.BATTERY_MAX_SOC, self.battery_soc + delta_soc)
            grid_w = -surplus if surplus > 0 else 0.0
        else:
            # Deficit: building load exceeds solar
            deficit = net_without_batt
            if self.battery_soc > self.BATTERY_MIN_SOC:
                max_discharge = self.BATTERY_DISCHARGE_MAX_W
                if self.battery_soc <= 40.0:
                    max_discharge *= 0.5
                discharge_w = min(deficit, max_discharge)
                battery_w = -discharge_w
                deficit -= discharge_w
                delta_soc = (discharge_w * dt_hours) / (self.BATTERY_CAPACITY_KWH * 1000) * 100.0
                self.battery_soc = max(self.BATTERY_MIN_SOC, self.battery_soc - delta_soc)
            grid_w = deficit

        if abs(grid_w) < 100.0:
            grid_w = 100.0 if grid_w >= 0 else -100.0

        return battery_w, grid_w

    # --- public API -------------------------------------------------------

    def _get_consumption_row(self, t: datetime) -> dict | None:
        """Return the current 15-minute interval row from Consumption.csv, if loaded."""
        if not self._consumption_rows:
            return None

        elapsed_seconds = (t - self.start_time).total_seconds()
        simulated_seconds = elapsed_seconds * self.time_compression
        # 900 seconds = 15 minutes
        idx = int(simulated_seconds / 900.0) % len(self._consumption_rows)
        return self._consumption_rows[idx]

    def generate_snapshot(self) -> Snapshot:
        now = datetime.now(timezone.utc)
        dt_hours = max(self.step_seconds / 3600.0, (now - self.last_update).total_seconds() / 3600.0)
        self.last_update = now
        row = self._get_consumption_row(now)

        if row is not None:
            # Use CSV-driven consumption data (kW in CSV, convert to W)
            def parse_float(field: str) -> float:
                val = (row.get(field) or "").strip()
                try:
                    return float(val) if val else 0.0
                except ValueError:
                    return 0.0

            building_load_kw = parse_float("BUILDING LOAD PWR")
            grid_kw = parse_float("GRID PWR")
            battery_kw = parse_float("BATTERY PWR")
            solar_kw = parse_float("SOLAR PWR")

            building_load_w = building_load_kw * 1000.0
            grid_w = grid_kw * 1000.0
            battery_w = battery_kw * 1000.0
            pv_w = solar_kw * 1000.0

            # Update SOC based on battery power sign
            if battery_w != 0.0:
                # Positive battery_w in CSV = charging, negative = discharging
                delta_soc = (abs(battery_w) * dt_hours) / (self.BATTERY_CAPACITY_KWH * 1000.0) * 100.0
                if battery_w > 0:
                    self.battery_soc = min(self.BATTERY_MAX_SOC, self.battery_soc + delta_soc)
                else:
                    self.battery_soc = max(self.BATTERY_MIN_SOC, self.battery_soc - delta_soc)
        else:
            # Fallback to synthetic profiles
            building_load_w = self._office_load_profile_w(now)
            pv_clear_w = self._pv_profile_w(now, self.PV_PEAK_JAN_W, self.PV_PEAK_JUN_W)
            weather_factor = self._weather_factor(now)
            pv_w = pv_clear_w * weather_factor

            battery_w, grid_w = self._compute_battery_and_grid(building_load_w, pv_w, dt_hours, now)

        # add a bit of noise
        def jitter(value: float, pct: float = 0.02) -> float:
            if value == 0:
                return 0.0
            d = abs(value) * pct
            return value + random.uniform(-d, d)

        # For CSV-driven mode, we keep exact values; for synthetic mode, we add jitter.
        if row is None:
            pv_w = max(0.0, jitter(pv_w))
            building_load_w = max(0.0, jitter(building_load_w))
            battery_w = jitter(battery_w)
            grid_w = jitter(grid_w)

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

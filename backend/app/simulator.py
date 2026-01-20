from __future__ import annotations

import math
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
    BATTERY_CAPACITY_KWH = 60.0
    BATTERY_MIN_SOC = 10.0
    BATTERY_MAX_SOC = 95.0
    BATTERY_CHARGE_MAX_W = 20_000.0
    BATTERY_DISCHARGE_MAX_W = 20_000.0

    PV_PEAK_JAN_W = 35_000.0
    PV_PEAK_JUN_W = 55_000.0

    OFFICE_BASE_LOAD_W = 15_000.0
    OFFICE_PEAK_LOAD_W = 80_000.0

    def __init__(self, history_hours: int = 24, step_seconds: int = 2) -> None:
        self.battery_soc = 60.0
        self.last_update = datetime.now(timezone.utc)
        self.step_seconds = step_seconds

        max_points = int(history_hours * 3600 / step_seconds)
        self.history: Dict[str, Deque[TimeseriesPoint]] = {
            "solar_kw": deque(maxlen=max_points),
            "battery_soc": deque(maxlen=max_points),
            "grid_kw": deque(maxlen=max_points),
            "load_kw": deque(maxlen=max_points),
        }

    # --- internal helpers -------------------------------------------------

    @staticmethod
    def _is_january(dt: datetime) -> bool:
        return dt.month == 1

    @staticmethod
    def _pv_profile_w(t: datetime, peak_jan: float, peak_jun: float) -> float:
        hour = t.hour + t.minute / 60.0
        if hour < 8 or hour > 18:
            return 0.0

        peak = peak_jan if t.month in (11, 12, 1, 2) else peak_jun
        x = (hour - 8) / 10.0 * math.pi
        bell = max(0.0, math.sin(x))
        return peak * bell

    def _office_load_profile_w(self, t: datetime) -> float:
        hour = t.hour + t.minute / 60.0
        base = self.OFFICE_BASE_LOAD_W
        peak = self.OFFICE_PEAK_LOAD_W

        if 0 <= hour < 6:
            load = base
        elif 6 <= hour < 9:
            frac = (hour - 6) / 3.0
            load = base + frac * (peak * 0.85 - base)
        elif 9 <= hour < 17:
            x = (hour - 9) / 8.0
            hump = 0.1 * peak * (1 - ((x - 0.75) / 0.75) ** 2)
            load = peak * 0.9 + max(0.0, hump)
        elif 17 <= hour < 20:
            frac = (20 - hour) / 3.0
            load = base + frac * (peak * 0.8 - base)
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

    def _compute_battery_and_grid(self, building_load_w: float, pv_w: float, dt_hours: float) -> tuple[float, float]:
        net_without_batt = building_load_w - pv_w
        battery_w = 0.0
        grid_w = 0.0

        if net_without_batt <= 0:
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

    def generate_snapshot(self) -> Snapshot:
        now = datetime.now(timezone.utc)
        dt_hours = max(self.step_seconds / 3600.0, (now - self.last_update).total_seconds() / 3600.0)
        self.last_update = now

        building_load_w = self._office_load_profile_w(now)
        pv_clear_w = self._pv_profile_w(now, self.PV_PEAK_JAN_W, self.PV_PEAK_JUN_W)
        weather_factor = self._weather_factor(now)
        pv_w = pv_clear_w * weather_factor

        battery_w, grid_w = self._compute_battery_and_grid(building_load_w, pv_w, dt_hours)

        # add a bit of noise
        def jitter(value: float, pct: float = 0.02) -> float:
            if value == 0:
                return 0.0
            d = abs(value) * pct
            return value + random.uniform(-d, d)

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

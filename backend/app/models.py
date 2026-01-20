from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal
from pydantic import BaseModel


EquipmentType = Literal["solar", "battery", "grid", "load"]


class SolarMetrics(BaseModel):
    power_w: float
    voltage_v: float
    current_a: float


class BatteryMetrics(BaseModel):
    power_w: float           # +charge / -discharge
    soc_percent: float
    capacity_kwh: float
    voltage_v: float
    temperature_c: float


class GridMetrics(BaseModel):
    power_w: float           # +import / -export
    voltage_v: float
    current_a: float
    frequency_hz: float


class LoadMetrics(BaseModel):
    power_w: float
    voltage_v: float
    current_a: float


class Snapshot(BaseModel):
    timestamp: datetime
    solar: SolarMetrics
    battery: BatteryMetrics
    grid: GridMetrics
    load: LoadMetrics


class Overview(BaseModel):
    timestamp: datetime
    total_equipment: int
    online_equipment: int
    uptime_seconds: int
    solar_kw: float
    battery_kw: float
    battery_soc_percent: float
    grid_kw: float
    load_kw: float


class EquipmentItem(BaseModel):
    equipment_id: str
    name: str
    type: EquipmentType
    status: Literal["online", "offline", "fault"]
    location: str
    metrics: Dict[str, float]


class TimeseriesPoint(BaseModel):
    t: datetime
    v: float


class AnalyticsSeries(BaseModel):
    metric: Literal["solar_kw", "battery_soc", "grid_kw", "load_kw"]
    points: List[TimeseriesPoint]


class AnalyticsResponse(BaseModel):
    from_ts: datetime
    to_ts: datetime
    series: List[AnalyticsSeries]

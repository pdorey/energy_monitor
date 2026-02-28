/**
 * Energy Profile chart: instant power (kW) per 15-min slot.
 * Four series: building consumption (grey), grid import (red), battery consumption (green), solar production (yellow).
 * Progressive reveal as time moves in the energy flow diagram.
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface IntradayPoint {
  time: string;
  cumulative_grid_energy: number;
  cumulative_solar_energy: number;
  cumulative_battery_energy: number;
  cumulative_building_load: number;
}

interface ProfilePoint {
  time: string;
  building_kw: number;
  grid_import_kw: number;
  battery_kw: number;
  solar_kw: number;
}

interface EnergyProfileChartProps {
  data: IntradayPoint[];
  currentTime?: string;
}

/** Convert cumulative 15-min data to instant power (kW) per slot. Power = delta_kWh / 0.25h = 4 * delta. */
function toInstantProfile(data: IntradayPoint[]): ProfilePoint[] {
  if (data.length === 0) return [];
  const out: ProfilePoint[] = [];
  for (let i = 0; i < data.length; i++) {
    const prev = i > 0 ? data[i - 1] : {
      cumulative_grid_energy: 0,
      cumulative_solar_energy: 0,
      cumulative_battery_energy: 0,
      cumulative_building_load: 0,
    };
    const d = data[i];
    const deltaGrid = d.cumulative_grid_energy - prev.cumulative_grid_energy;
    const deltaSolar = d.cumulative_solar_energy - prev.cumulative_solar_energy;
    const deltaBattery = d.cumulative_battery_energy - prev.cumulative_battery_energy;
    const deltaBuilding = d.cumulative_building_load - prev.cumulative_building_load;
    const kw = 4; // 1 kWh in 15 min = 4 kW average
    out.push({
      time: d.time,
      building_kw: Math.max(0, deltaBuilding * kw),
      grid_import_kw: Math.max(0, deltaGrid * kw),
      battery_kw: Math.max(0, deltaBattery * kw),
      solar_kw: Math.max(0, deltaSolar * kw),
    });
  }
  return out;
}

export function EnergyProfileChart({ data, currentTime }: EnergyProfileChartProps) {
  const { t } = useTranslation();
  const [chartData, setChartData] = useState<ProfilePoint[]>([]);

  const timeToMinutes = (timeStr: string): number => {
    const [h, m] = (timeStr || "00:00").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  useEffect(() => {
    if (data.length === 0) {
      setChartData([]);
      return;
    }
    const profile = toInstantProfile(data);
    if (!currentTime) {
      setChartData(profile);
      return;
    }
    const currentMinutes = timeToMinutes(currentTime);
    const masked = profile.map((p) => {
      const pm = timeToMinutes(p.time);
      if (pm <= currentMinutes) return p;
      return {
        time: p.time,
        building_kw: NaN,
        grid_import_kw: NaN,
        battery_kw: NaN,
        solar_kw: NaN,
      };
    });
    setChartData(masked);
  }, [data, currentTime]);

  if (!data || data.length < 4) {
    return (
      <div className="bg-slate-800/60 rounded-lg p-3 min-h-[140px] flex items-center justify-center border-2 border-dashed border-slate-600">
        <span className="text-slate-500 text-sm">{t("energyProfile.noData")}</span>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-lg">
          <p className="text-slate-300 text-xs font-semibold mb-1">{label}</p>
          {payload.map((entry: any) => (
            <p key={entry.dataKey} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === "number" && !isNaN(entry.value) ? entry.value.toFixed(2) : "—"} kW
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-800/60 rounded-lg p-3 min-h-0 min-w-0 overflow-hidden flex flex-col h-full">
      <h3 className="text-sm font-semibold text-slate-300 mb-2 shrink-0">
        {t("energyProfile.title")}
      </h3>
      <div className="w-full flex-1 min-h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 9 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 9 }}
              label={{ value: "kW", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: "#94a3b8" }} iconType="line" iconSize={8} />
            <Line
              type="monotone"
              dataKey="building_kw"
              name={t("energyProfile.buildingConsumption")}
              stroke="#94a3b8"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="grid_import_kw"
              name={t("energyProfile.gridImport")}
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="battery_kw"
              name={t("energyProfile.batteryConsumption")}
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="solar_kw"
              name={t("energyProfile.solarProduction")}
              stroke="#eab308"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

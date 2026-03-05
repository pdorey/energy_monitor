/**
 * Analytics charts: cumulative energy (15-min bars) and daily price evolution.
 * Cumulative Energy: progressive reveal based on currentTime from simulator.
 * Daily Price: full data (no animation - prices known from previous day).
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/** Single intraday data point from /api/intraday-analytics. */
interface IntradayDataPoint {
  time: string;
  cumulative_grid_energy: number;
  cumulative_solar_energy: number;
  cumulative_battery_energy: number;
  cumulative_building_load: number;
  spot_price: number;
  buy_price: number;
  export_price: number;
}

/** Props for AnalyticsCharts. */
interface AnalyticsChartsProps {
  data: IntradayDataPoint[];
  currentTime?: string; // Current time from simulator (e.g., "12:30")
}

export function AnalyticsCharts({ data, currentTime }: AnalyticsChartsProps) {
  const { t } = useTranslation();
  const [energyData, setEnergyData] = useState<IntradayDataPoint[]>([]);

  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = (timeStr || "00:00").split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  };

  // Cumulative Energy: progressive reveal - only show bars up to currentTime
  useEffect(() => {
    if (data.length === 0) {
      setEnergyData([]);
      return;
    }
    if (!currentTime) {
      setEnergyData(data);
      return;
    }
    const currentMinutes = timeToMinutes(currentTime);
    const masked = data.map((d) => {
      const pm = timeToMinutes(d.time);
      if (pm <= currentMinutes) return d;
      return {
        ...d,
        cumulative_grid_energy: 0,
        cumulative_solar_energy: 0,
        cumulative_battery_energy: 0,
        cumulative_building_load: 0,
      };
    });
    setEnergyData(masked);
  }, [data, currentTime]);

  const barData = energyData.length > 0 ? energyData : data;

  const EnergyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-slate-300 mb-2 font-semibold">{`${t("priceChart.time")}: ${label}`}</p>
              {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${(entry.value ?? 0).toFixed(2)} kWh`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const PriceTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-slate-300 mb-2 font-semibold">{`${t("priceChart.time")}: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${(entry.value ?? 0).toFixed(2)} €/MWh`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Chart 1: Cumulative Energy Consumption - 15-min interval stacked bars */}
      <div className="bg-slate-800/60 rounded-lg p-4 sm:p-6 min-w-0 overflow-hidden">
        <h3 className="text-base sm:text-lg font-semibold text-slate-300 mb-3 sm:mb-4">
          {t("analyticsCharts.consumptionTitle")}
        </h3>
        <div className="w-full h-[220px] sm:h-[270px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={barData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis
                dataKey="time"
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 9 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                label={{ value: t("analyticsCharts.energyYAxis"), angle: -90, position: "insideLeft", fill: "#94a3b8" }}
              />
              <Tooltip content={<EnergyTooltip />} />
              <Legend wrapperStyle={{ color: "#94a3b8" }} />
              <Bar dataKey="cumulative_grid_energy" name={t("analyticsCharts.gridEnergy")} stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
              <Bar dataKey="cumulative_solar_energy" name={t("analyticsCharts.solarEnergy")} stackId="a" fill="#fbbf24" radius={[0, 0, 0, 0]} />
              <Bar dataKey="cumulative_battery_energy" name={t("analyticsCharts.batteryEnergy")} stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Line type="monotone" dataKey="cumulative_building_load" name={t("analyticsCharts.buildingLoad")} stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Today's prices - full data, no animation */}
      <div className="bg-slate-800/60 rounded-lg p-4 sm:p-6 min-w-0 overflow-hidden">
        <h3 className="text-base sm:text-lg font-semibold text-slate-300 mb-3 sm:mb-4">
          {t("analyticsCharts.priceTitle")}
        </h3>
        <div className="w-full h-[220px] sm:h-[270px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis
                dataKey="time"
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 9 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                label={{ value: t("analyticsCharts.priceYAxis"), angle: -90, position: "insideLeft", fill: "#94a3b8" }}
              />
              <Tooltip content={<PriceTooltip />} />
              <Legend wrapperStyle={{ color: "#94a3b8" }} iconType="line" />
              <Line type="monotone" dataKey="spot_price" name={t("analyticsCharts.wholesalePrice")} stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="buy_price" name={t("analyticsCharts.buyPrice")} stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="export_price" name={t("analyticsCharts.exportPrice")} stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

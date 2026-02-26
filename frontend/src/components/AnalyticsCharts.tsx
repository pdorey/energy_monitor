/**
 * Analytics charts: cumulative energy and price timeseries.
 * Supports progressive reveal based on currentTime from simulator.
 */
import { useState, useEffect } from "react";
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

/** Renders cumulative energy and price charts. Nullifies future values when currentTime set. */
export function AnalyticsCharts({ data, currentTime }: AnalyticsChartsProps) {
  const [chartData, setChartData] = useState<IntradayDataPoint[]>([]);

  // Parse time string (e.g., "12:30") to minutes since midnight
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  // Prepare data: always include all time points for full x-axis, but nullify future values for animation
  useEffect(() => {
    if (data.length === 0) {
      setChartData([]);
      return;
    }

    if (!currentTime) {
      // If no current time, show all data
      setChartData(data);
      return;
    }

    const currentMinutes = timeToMinutes(currentTime);
    
    // Create data array with all time points, but nullify values after current time
    const fullData: IntradayDataPoint[] = data.map((point) => {
      const pointMinutes = timeToMinutes(point.time);
      
      if (pointMinutes <= currentMinutes) {
        // Show actual data up to current time
        return point;
      } else {
        // For future times, return null values (lines won't draw but x-axis will show full range)
        return {
          time: point.time,
          cumulative_grid_energy: NaN,
          cumulative_solar_energy: NaN,
          cumulative_battery_energy: NaN,
          cumulative_building_load: NaN,
          spot_price: NaN,
          buy_price: NaN,
          export_price: NaN,
        };
      }
    });
    
    setChartData(fullData);
  }, [currentTime, data]);

  // Format time for X-axis
  const formatTime = (time: string) => {
    return time;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-slate-300 mb-2 font-semibold">{`Time: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value.toFixed(2)} ${entry.dataKey.includes("price") ? "€/MWh" : "kWh"}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Chart 1: Cumulative Energy Consumption */}
      <div className="bg-slate-800/60 rounded-lg p-4 sm:p-6 min-w-0 overflow-hidden">
        <h3 className="text-base sm:text-lg font-semibold text-slate-300 mb-3 sm:mb-4">
          Cumulative Energy Consumption (24h)
        </h3>
        <div className="w-full h-[220px] sm:h-[270px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.length > 0 ? chartData : data} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickFormatter={formatTime}
              domain={['dataMin', 'dataMax']}
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              label={{ value: "Energy (kWh)", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ color: "#94a3b8" }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="cumulative_grid_energy"
              name="Grid Energy"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              animationDuration={500}
              isAnimationActive={true}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="cumulative_solar_energy"
              name="Solar Energy"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={false}
              animationDuration={500}
              isAnimationActive={true}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="cumulative_battery_energy"
              name="Battery Energy"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              animationDuration={500}
              isAnimationActive={true}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="cumulative_building_load"
              name="Building Load"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              animationDuration={500}
              isAnimationActive={true}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Price Evolution */}
      <div className="bg-slate-800/60 rounded-lg p-4 sm:p-6 min-w-0 overflow-hidden">
        <h3 className="text-base sm:text-lg font-semibold text-slate-300 mb-3 sm:mb-4">
          Daily Price Evolution (24h)
        </h3>
        <div className="w-full h-[220px] sm:h-[270px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.length > 0 ? chartData : data} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickFormatter={formatTime}
              domain={['dataMin', 'dataMax']}
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              label={{ value: "Price (€/MWh)", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ color: "#94a3b8" }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="spot_price"
              name="Wholesale Price"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              animationDuration={500}
              isAnimationActive={true}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="buy_price"
              name="Buy Price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              animationDuration={500}
              isAnimationActive={true}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="export_price"
              name="Export Price"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              animationDuration={500}
              isAnimationActive={true}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

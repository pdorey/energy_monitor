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

interface AnalyticsChartsProps {
  data: IntradayDataPoint[];
  currentTime?: string; // Current time from simulator (e.g., "12:30")
}

export function AnalyticsCharts({ data, currentTime }: AnalyticsChartsProps) {
  const [displayedData, setDisplayedData] = useState<IntradayDataPoint[]>([]);

  // Parse time string (e.g., "12:30") to minutes since midnight
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  // Find current index based on currentTime and prepare data for animation
  useEffect(() => {
    if (data.length === 0) {
      setDisplayedData([]);
      return;
    }

    if (!currentTime) {
      // If no current time, show all data
      setDisplayedData(data);
      return;
    }

    const currentMinutes = timeToMinutes(currentTime);
    const currentIdx = data.findIndex((point) => {
      const pointMinutes = timeToMinutes(point.time);
      return pointMinutes >= currentMinutes;
    });

    // If exact match not found, use the last index before current time
    const idx = currentIdx >= 0 ? currentIdx : data.length;
    
    // Create data array with all time points, but only populate values up to current time
    // This ensures x-axis shows full 24 hours but lines animate progressively
    const fullData: IntradayDataPoint[] = data.map((point, index) => {
      if (index <= idx) {
        // Show actual data up to current time
        return point;
      } else {
        // For future times, return null values (will be hidden by chart)
        return {
          time: point.time,
          cumulative_grid_energy: point.cumulative_grid_energy,
          cumulative_solar_energy: point.cumulative_solar_energy,
          cumulative_battery_energy: point.cumulative_battery_energy,
          cumulative_building_load: point.cumulative_building_load,
          spot_price: point.spot_price,
          buy_price: point.buy_price,
          export_price: point.export_price,
        };
      }
    });
    
    setDisplayedData(fullData);
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
    <div className="space-y-6">
      {/* Chart 1: Cumulative Energy Consumption */}
      <div className="bg-slate-800/60 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">
          Cumulative Energy Consumption (24h)
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={displayedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8" }}
              tickFormatter={formatTime}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8" }}
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
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Price Evolution */}
      <div className="bg-slate-800/60 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">
          Daily Price Evolution (24h)
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={displayedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8" }}
              tickFormatter={formatTime}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8" }}
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
              animationDuration={300}
            />
            <Line
              type="monotone"
              dataKey="buy_price"
              name="Buy Price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              animationDuration={300}
            />
            <Line
              type="monotone"
              dataKey="export_price"
              name="Export Price"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

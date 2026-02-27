/**
 * Price chart: wholesale (spot) as bars colored by tariff slot, buy and export as lines.
 */
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

export interface PriceDataPoint {
  time: string;
  spot_price: number;
  buy_price: number;
  export_price: number;
  slot_name?: string;
}

interface PriceChartProps {
  data: PriceDataPoint[];
}

/** Bar fill color by slot_name: green (super_off_peak), blue (off_peak), orange (standard), red (peak). */
function getSlotBarColor(slotName: string): string {
  const s = (slotName || "").toLowerCase().replace(/-/g, "_");
  if (s === "super_off_peak") return "#22c55e";
  if (s === "off_peak") return "#3b82f6";
  if (s === "standard") return "#f97316";
  if (s === "peak") return "#ef4444";
  return "#64748b";
}

export function PriceChart({ data }: PriceChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-slate-300 mb-2 font-semibold">{`Time: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${typeof entry.value === "number" && !isNaN(entry.value) ? entry.value.toFixed(2) : "—"} €/MWh`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-800/60 rounded-lg p-4 min-h-[200px] flex items-center justify-center border-2 border-dashed border-slate-600">
        <span className="text-slate-500 text-sm">No price data</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 rounded-lg p-4 min-h-[200px] min-w-0 overflow-hidden">
      <h3 className="text-base font-semibold text-slate-300 mb-1">
        Wholesale, Buy & Export Prices (24h)
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Buy Price = Wholesale + ERSE access charges
      </p>
      <div className="w-full h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 50, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              domain={["dataMin", "dataMax"]}
            />
            <YAxis
              yAxisId="left"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              label={{ value: "€/MWh (spot, export)", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#3b82f6"
              tick={{ fill: "#3b82f6", fontSize: 10 }}
              label={{ value: "€/MWh (buy)", angle: 90, position: "insideRight", fill: "#3b82f6" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: "#94a3b8" }} iconType="line" />
            <Bar dataKey="spot_price" name="Wholesale (spot)" fill="#64748b" radius={[2, 2, 0, 0]} yAxisId="left">
              {data.map((entry, index) => (
                <Cell key={index} fill={getSlotBarColor(entry.slot_name || "")} />
              ))}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="buy_price"
              name="Buy price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="export_price"
              name="Export price"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Price chart: wholesale (spot) as bars colored by tariff slot, buy and export as lines.
 */
import { useTranslation } from "react-i18next";
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
  Rectangle,
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

/** Four-rate weekday slot from minutes-since-midnight (fallback when backend slot_name missing). */
function getSlotFromMinutes(minutes: number, isWeekend: boolean, isSummer: boolean): string {
  if (isWeekend) return "super_off_peak";
  if (minutes < 6 * 60) return "super_off_peak";           // 00:00-06:00
  if (minutes < 8 * 60) return "off_peak";                 // 06:00-08:00
  if (isSummer) {
    if (minutes < 10.5 * 60) return "standard";           // 08:00-10:30
    if (minutes < 13 * 60) return "peak";                  // 10:30-13:00
    if (minutes < 19.5 * 60) return "standard";             // 13:00-19:30
    if (minutes < 21 * 60) return "peak";                   // 19:30-21:00
    if (minutes < 22 * 60) return "standard";              // 21:00-22:00
  } else {
    if (minutes < 9 * 60) return "standard";               // 08:00-09:00
    if (minutes < 10.5 * 60) return "peak";                // 09:00-10:30
    if (minutes < 18 * 60) return "standard";              // 10:30-18:00
    if (minutes < 20.5 * 60) return "peak";                // 18:00-20:30
    if (minutes < 22 * 60) return "standard";               // 20:30-22:00
  }
  return "off_peak";                                       // 22:00-24:00
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function PriceChart({ data }: PriceChartProps) {
  const { t } = useTranslation();
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload;
      const slotName = dataPoint?.slot_name ?? "—";
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-slate-300 mb-2 font-semibold">{`${t("priceChart.time")}: ${label}`}</p>
          <p className="text-xs text-slate-400 mb-2">Slot: {slotName}</p>
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
        <span className="text-slate-500 text-sm">{t("priceChart.noData")}</span>
      </div>
    );
  }

  // Precompute bar fill per slot. Use backend slot_name if present, else derive from time (four_rate).
  const now = new Date();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const isSummer = now.getMonth() >= 3 && now.getMonth() <= 9; // Apr-Oct
  const chartData = data.map((d) => {
    const slotName = d.slot_name ?? getSlotFromMinutes(parseTimeToMinutes(d.time), isWeekend, isSummer);
    return { ...d, slot_name: slotName, _barFill: getSlotBarColor(slotName) };
  });

  return (
    <div className="bg-slate-800/60 rounded-lg p-4 min-h-0 min-w-0 overflow-hidden flex flex-col h-full">
      <h3 className="text-base font-semibold text-slate-300 mb-1 shrink-0">
        {t("priceChart.title")}
      </h3>
      <p className="text-xs text-slate-500 mb-2 shrink-0">
        {t("priceChart.subtitle")}
      </p>
      <div className="w-full flex-1 min-h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              domain={["dataMin", "dataMax"]}
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              label={{ value: "€/MWh", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: "#94a3b8" }} iconType="line" />
            <Bar
              dataKey="spot_price"
              name={t("priceChart.wholesale")}
              fill="#64748b"
              radius={[2, 2, 0, 0]}
              shape={(props: unknown) => {
                const p = props as { x?: number; y?: number; width?: number; height?: number; payload?: { slot_name?: string; _barFill?: string }; slot_name?: string; _barFill?: string };
                const { x = 0, y = 0, width = 0, height = 0 } = p;
                const payload = p.payload ?? p;
                const fill = payload._barFill ?? getSlotBarColor(payload.slot_name ?? "");
                return <Rectangle x={x} y={y} width={width} height={height} fill={fill} radius={[2, 2, 0, 0]} />;
              }}
            />
            <Line
              type="monotone"
              dataKey="buy_price"
              name={t("priceChart.buyPrice")}
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="export_price"
              name={t("priceChart.exportPrice")}
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

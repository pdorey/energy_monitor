/**
 * Solar forecast for tomorrow: bar chart (hourly) + Total today / Total tomorrow cards.
 * Tomorrow forecast = today's hourly pattern + 2%.
 * Total Today animates with cumulative solar up to current simulator time.
 */
import { useTranslation } from "react-i18next";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface IntradayPoint {
  time: string;
  cumulative_solar_energy: number;
}

interface SolarForecastChartProps {
  data: IntradayPoint[];
  currentTime?: string;
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Derive hourly solar production (kWh) from cumulative 15-min data. */
function getHourlySolar(data: IntradayPoint[]): { hour: number; label: string; kWh: number }[] {
  const hourly: { hour: number; label: string; kWh: number }[] = [];
  for (let h = 0; h < 24; h++) {
    const startIdx = h * 4;
    const endIdx = Math.min((h + 1) * 4 - 1, data.length - 1);
    const prevCum = startIdx > 0 && startIdx - 1 < data.length
      ? data[startIdx - 1].cumulative_solar_energy
      : 0;
    const currCum = endIdx >= 0 && endIdx < data.length
      ? data[endIdx].cumulative_solar_energy
      : prevCum;
    const prod = Math.max(0, currCum - prevCum);
    hourly.push({
      hour: h,
      label: `${h.toString().padStart(2, "0")}:00`,
      kWh: prod,
    });
  }
  return hourly;
}

export function SolarForecastChart({ data, currentTime }: SolarForecastChartProps) {
  const { t } = useTranslation();
  if (!data || data.length < 4) {
    return (
      <div className="bg-slate-800/60 rounded-lg p-4 min-h-[180px] flex items-center justify-center border-2 border-dashed border-slate-600">
        <span className="text-slate-500 text-sm">{t("solarForecast.noData")}</span>
      </div>
    );
  }

  const hourlyToday = getHourlySolar(data);
  const fullDayTotal = data.length > 0
    ? data[data.length - 1].cumulative_solar_energy
    : hourlyToday.reduce((s, x) => s + x.kWh, 0);
  // Total today: cumulative solar up to currentTime (animates as day progresses)
  let totalToday: number;
  if (currentTime && data.length > 0) {
    const currentMin = parseTimeToMinutes(currentTime);
    const idx = data.findIndex((d) => parseTimeToMinutes(d.time) > currentMin);
    const slotIdx = idx >= 0 ? Math.max(0, idx - 1) : data.length - 1;
    totalToday = data[slotIdx].cumulative_solar_energy;
  } else {
    totalToday = fullDayTotal;
  }
  // Total tomorrow: static forecast (full-day total * 1.02), does not animate
  const totalTomorrow = fullDayTotal * 1.02;
  const hourlyTomorrow = hourlyToday.map((x) => ({
    ...x,
    kWh: Math.round(x.kWh * 1.02 * 100) / 100,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-slate-300 font-semibold">{label}</p>
          <p className="text-sm text-amber-300">{`${payload[0].value.toFixed(2)} kWh`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-800/60 rounded-lg p-4 min-h-0 min-w-0 overflow-hidden flex flex-col h-full">
      <h3 className="text-base font-semibold text-slate-300 mb-2 shrink-0">
        {t("solarForecast.title")}
      </h3>
      <div className="flex justify-center gap-2 mb-2 shrink-0">
        <div className="bg-slate-700/50 rounded px-2 py-1 w-[130px] min-w-[130px] text-center shrink-0">
          <div className="text-[10px] uppercase text-slate-400 leading-tight whitespace-nowrap">{t("solarForecast.totalToday")}</div>
          <div className="text-sm font-semibold text-amber-300 transition-all duration-300 whitespace-nowrap">
            {totalToday.toFixed(2)} <span className="text-xs">kWh</span>
          </div>
        </div>
        <div className="bg-slate-700/50 rounded px-2 py-1 w-[130px] min-w-[130px] text-center shrink-0">
          <div className="text-[10px] uppercase text-slate-400 leading-tight whitespace-nowrap">{t("solarForecast.totalTomorrow")}</div>
          <div className="text-sm font-semibold text-amber-300 whitespace-nowrap">
            {totalTomorrow.toFixed(2)} <span className="text-xs">kWh</span>
          </div>
        </div>
      </div>
      <div className="w-full flex-1 min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hourlyTomorrow} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="label"
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 9 }}
              interval={2}
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              label={{ value: "kWh", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="kWh" fill="#f59e0b" radius={[2, 2, 0, 0]} name={t("solarForecast.barName")} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Cost savings today: (cost if all building load from grid) - (actual grid cost).
 * Cumulative per 15-min slot, animates as simulator time progresses.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface IntradayPoint {
  time: string;
  cumulative_grid_energy: number;
  cumulative_building_load: number;
  buy_price: number;
}

interface AnalyticsCostSavingsCardProps {
  data: IntradayPoint[];
  currentTime?: string;
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Compute cumulative cost savings (€) up to currentTime. buy_price in €/MWh. */
function computeCumulativeSavings(data: IntradayPoint[], currentTime?: string): number {
  if (!data || data.length < 2) return 0;
  const currentMin = currentTime != null ? parseTimeToMinutes(currentTime) : 24 * 60;
  let total = 0;
  for (let i = 0; i < data.length; i++) {
    const pm = parseTimeToMinutes(data[i].time);
    if (pm > currentMin) break;
    const prev = i > 0 ? data[i - 1] : { cumulative_grid_energy: 0, cumulative_building_load: 0 };
    const deltaBuilding = data[i].cumulative_building_load - prev.cumulative_building_load;
    const deltaGrid = data[i].cumulative_grid_energy - prev.cumulative_grid_energy;
    const buyPriceEurPerKwh = (data[i].buy_price ?? 0) / 1000;
    const costIfAllGrid = deltaBuilding * buyPriceEurPerKwh;
    const actualGridCost = deltaGrid * buyPriceEurPerKwh;
    total += costIfAllGrid - actualGridCost;
  }
  return total;
}

export function AnalyticsCostSavingsCard({ data, currentTime }: AnalyticsCostSavingsCardProps) {
  const { t } = useTranslation();
  const savings = useMemo(() => computeCumulativeSavings(data, currentTime), [data, currentTime]);

  if (!data || data.length < 2) {
    return (
      <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
        <div className="text-xs uppercase text-slate-400">{t("analytics.costSavingsToday")}</div>
        <div className="mt-1 text-slate-500 text-sm">{t("analytics.costSavingsNoData")}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
      <div className="text-xs uppercase text-slate-400">{t("analytics.costSavingsToday")}</div>
      <div className={`mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold transition-all duration-300 ${savings >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {savings >= 0 ? "€" : "−€"}{Math.abs(savings).toFixed(2)}
      </div>
    </div>
  );
}

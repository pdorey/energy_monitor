/**
 * Cost savings today: (cost if all building load from grid) - (actual grid cost).
 * Decomposed into: solar savings, peak shaving, off-peak discharge, battery charge cost.
 * Total (large) + breakdown list below, cumulative up to currentTime.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface IntradayPoint {
  time: string;
  cumulative_grid_energy: number;
  cumulative_building_load: number;
  cumulative_solar_energy?: number;
  cumulative_battery_energy?: number;
  buy_price: number;
  slot_name?: string;
}

interface AnalyticsCostSavingsCardProps {
  data: IntradayPoint[];
  currentTime?: string;
}

interface Breakdown {
  total: number;
  solar: number;
  peakShaving: number;
  offPeakDischarge: number;
  batteryChargeCost: number;
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Compute cumulative cost savings and breakdown up to currentTime. buy_price in €/MWh. */
function computeBreakdown(data: IntradayPoint[], currentTime?: string): Breakdown {
  const result: Breakdown = { total: 0, solar: 0, peakShaving: 0, offPeakDischarge: 0, batteryChargeCost: 0 };
  if (!data || data.length < 2) return result;

  const currentMin = currentTime != null ? parseTimeToMinutes(currentTime) : 24 * 60;
  const hasSolar = data.some((d) => d.cumulative_solar_energy != null);
  const hasBattery = data.some((d) => d.cumulative_battery_energy != null);

  for (let i = 0; i < data.length; i++) {
    const pm = parseTimeToMinutes(data[i].time);
    if (pm > currentMin) break;

    const prev = i > 0 ? data[i - 1] : {
      cumulative_grid_energy: 0,
      cumulative_building_load: 0,
      cumulative_solar_energy: 0,
      cumulative_battery_energy: 0,
    };
    const deltaSolar = hasSolar
      ? (data[i].cumulative_solar_energy ?? 0) - (prev.cumulative_solar_energy ?? 0)
      : 0;
    const deltaBattery = hasBattery
      ? (data[i].cumulative_battery_energy ?? 0) - (prev.cumulative_battery_energy ?? 0)
      : 0;

    const buyPriceEurPerKwh = (data[i].buy_price ?? 0) / 1000;
    const slotName = (data[i].slot_name ?? "").toLowerCase();

    // Total: (deltaBuilding - deltaGrid) * price = (deltaSolar + deltaBattery) * price
    const slotTotal = (deltaSolar + deltaBattery) * buyPriceEurPerKwh;
    result.total += slotTotal;

    if (hasSolar && deltaSolar > 0) {
      result.solar += deltaSolar * buyPriceEurPerKwh;
    }
    if (hasBattery) {
      if (deltaBattery > 0) {
        if (slotName === "peak") {
          result.peakShaving += deltaBattery * buyPriceEurPerKwh;
        } else {
          result.offPeakDischarge += deltaBattery * buyPriceEurPerKwh;
        }
      } else if (deltaBattery < 0) {
        result.batteryChargeCost += deltaBattery * buyPriceEurPerKwh;
      }
    }
  }
  return result;
}

function formatEur(value: number): string {
  return `${value >= 0 ? "" : "−"}€${Math.abs(value).toFixed(2)}`;
}

export function AnalyticsCostSavingsCard({ data, currentTime }: AnalyticsCostSavingsCardProps) {
  const { t } = useTranslation();
  const breakdown = useMemo(() => computeBreakdown(data, currentTime), [data, currentTime]);

  const hasSolar = data?.some((d) => d.cumulative_solar_energy != null) ?? false;
  const hasBattery = data?.some((d) => d.cumulative_battery_energy != null) ?? false;

  if (!data || data.length < 2) {
    return (
      <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
        <div className="text-xs uppercase text-slate-400">{t("analytics.costSavingsToday")}</div>
        <div className="mt-1 text-slate-500 text-sm">{t("analytics.costSavingsNoData")}</div>
      </div>
    );
  }

  const rows: { key: string; label: string; value: number }[] = [];
  if (hasSolar) rows.push({ key: "solar", label: t("analytics.costSavingsSolar"), value: breakdown.solar });
  if (hasBattery) {
    rows.push({ key: "peakShaving", label: t("analytics.costSavingsPeakShaving"), value: breakdown.peakShaving });
    rows.push({ key: "offPeakDischarge", label: t("analytics.costSavingsOffPeakDischarge"), value: breakdown.offPeakDischarge });
    rows.push({ key: "batteryChargeCost", label: t("analytics.costSavingsBatteryCharge"), value: breakdown.batteryChargeCost });
  }

  return (
    <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
      <div className="text-xs uppercase text-slate-400">{t("analytics.costSavingsToday")}</div>
      <div
        className={`mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold transition-all duration-300 ${
          breakdown.total >= 0 ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {formatEur(breakdown.total)}
      </div>
      {rows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-1.5">
          {rows.map(({ key, label, value }) => (
            <div key={key} className="flex justify-between items-center text-sm">
              <span className="text-slate-400">{label}</span>
              <span className={value >= 0 ? "text-emerald-400" : "text-red-400"}>{formatEur(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

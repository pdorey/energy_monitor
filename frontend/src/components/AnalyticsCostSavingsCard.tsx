/**
 * Cost savings: TODAY (animated) and YTD (prefilled up to yesterday + today).
 * Single card with two columns. YTD uses linear profile for prefilled portion.
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
  export_price?: number;
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
  exportRevenue: number;
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 86400000;
  return Math.floor(diff / oneDay);
}

/** Compute cumulative cost savings and breakdown up to currentTime. Prices in €/MWh. */
function computeBreakdown(data: IntradayPoint[], currentTime?: string): Breakdown {
  const result: Breakdown = { total: 0, solar: 0, peakShaving: 0, offPeakDischarge: 0, batteryChargeCost: 0, exportRevenue: 0 };
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
    const deltaGrid = data[i].cumulative_grid_energy - prev.cumulative_grid_energy;
    const deltaBuilding = data[i].cumulative_building_load - prev.cumulative_building_load;
    const deltaSolar = hasSolar
      ? (data[i].cumulative_solar_energy ?? 0) - (prev.cumulative_solar_energy ?? 0)
      : 0;
    const deltaBattery = deltaBuilding - deltaGrid - deltaSolar;

    const buyPriceEurPerKwh = (data[i].buy_price ?? 0) / 1000;
    const exportPriceEurPerKwh = (data[i].export_price ?? 0) / 1000;
    const slotName = (data[i].slot_name ?? "").toLowerCase();

    const costIfAllGrid = deltaBuilding * buyPriceEurPerKwh;
    const gridCost = Math.max(0, deltaGrid) * buyPriceEurPerKwh;
    const exportRev = Math.max(0, -deltaGrid) * exportPriceEurPerKwh;
    result.total += costIfAllGrid - gridCost + exportRev;

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
        const gridToBattery = Math.max(0, deltaGrid - deltaBuilding);
        result.batteryChargeCost -= gridToBattery * buyPriceEurPerKwh;
      }
    }
    if (deltaGrid < 0) {
      result.exportRevenue += -deltaGrid * exportPriceEurPerKwh;
    }
  }
  return result;
}

function formatEur(value: number): string {
  const abs = Math.abs(value);
  const [int, dec] = abs.toFixed(2).split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value >= 0 ? "" : "−"}€${withCommas}.${dec}`;
}

/** YTD factor: prefilled (Jan 1 to yesterday) = full_day_total * factor. */
function getYtdFactor(): number {
  const D = getDayOfYear();
  if (D <= 1) return 0;
  return 0.5 * (D - 1) + 0.25 * (D - 2);
}

export function AnalyticsCostSavingsCard({ data, currentTime }: AnalyticsCostSavingsCardProps) {
  const { t } = useTranslation();
  const todayBreakdown = useMemo(() => computeBreakdown(data, currentTime), [data, currentTime]);
  const fullDayBreakdown = useMemo(() => computeBreakdown(data, undefined), [data]);
  const ytdFactor = useMemo(() => getYtdFactor(), []);

  const hasSolar = data?.some((d) => d.cumulative_solar_energy != null) ?? false;
  const hasBattery = data?.some((d) => d.cumulative_battery_energy != null) ?? false;

  const todayTotal = todayBreakdown.total;
  const prefilledTotal = fullDayBreakdown.total * ytdFactor;
  const ytdTotal = prefilledTotal + todayTotal;

  const rows: { key: string; label: string; today: number; ytd: number }[] = [];
  if (hasSolar) rows.push({ key: "solar", label: t("analytics.costSavingsSolar"), today: todayBreakdown.solar, ytd: fullDayBreakdown.solar * ytdFactor + todayBreakdown.solar });
  if (hasBattery) {
    rows.push({ key: "peakShaving", label: t("analytics.costSavingsPeakShaving"), today: todayBreakdown.peakShaving, ytd: fullDayBreakdown.peakShaving * ytdFactor + todayBreakdown.peakShaving });
    rows.push({ key: "offPeakDischarge", label: t("analytics.costSavingsOffPeakDischarge"), today: todayBreakdown.offPeakDischarge, ytd: fullDayBreakdown.offPeakDischarge * ytdFactor + todayBreakdown.offPeakDischarge });
    rows.push({ key: "batteryChargeCost", label: t("analytics.costSavingsBatteryCharge"), today: todayBreakdown.batteryChargeCost, ytd: fullDayBreakdown.batteryChargeCost * ytdFactor + todayBreakdown.batteryChargeCost });
  }
  rows.push({ key: "exportRevenue", label: t("analytics.costSavingsExportRevenue"), today: todayBreakdown.exportRevenue, ytd: fullDayBreakdown.exportRevenue * ytdFactor + todayBreakdown.exportRevenue });

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
      <div className="grid grid-cols-[1fr_5rem_5rem] sm:grid-cols-[1fr_6rem_6rem] gap-x-4 items-baseline">
        <div className="text-xs uppercase text-slate-400">{t("analytics.costSavings")}</div>
        <div className="text-xs uppercase text-slate-400 text-right">{t("analytics.today")}</div>
        <div className="text-xs uppercase text-slate-400 text-right">{t("analytics.ytd")}</div>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_5rem_5rem] sm:grid-cols-[1fr_6rem_6rem] gap-x-4 gap-y-1 items-baseline">
        <div className="text-slate-400 text-sm">Total</div>
        <div
          className={`text-xl sm:text-2xl font-semibold transition-all duration-300 text-right ${
            todayTotal >= 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {formatEur(todayTotal)}
        </div>
        <div
          className={`text-xl sm:text-2xl font-semibold transition-all duration-300 text-right ${
            ytdTotal >= 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {formatEur(ytdTotal)}
        </div>
      </div>
      {rows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-1.5">
          {rows.map(({ key, label, today, ytd }) => (
            <div key={key} className="grid grid-cols-[1fr_5rem_5rem] sm:grid-cols-[1fr_6rem_6rem] gap-x-4 items-center text-sm">
              <span className="text-slate-400">{label}</span>
              <span className={`text-right tabular-nums ${today >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatEur(today)}</span>
              <span className={`text-right tabular-nums ${ytd >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatEur(ytd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

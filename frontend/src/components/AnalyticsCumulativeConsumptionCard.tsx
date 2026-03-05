/**
 * Cumulative Consumption breakdown: Grid to Building, Grid to Battery, Solar to Building,
 * Solar to Battery, Battery to Building, Exported to Grid. Progressive reveal up to currentTime.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface IntradayPoint {
  time: string;
  cumulative_grid_to_building?: number;
  cumulative_grid_to_battery?: number;
  cumulative_solar_to_building?: number;
  cumulative_solar_to_battery?: number;
  cumulative_battery_to_building?: number;
  cumulative_exported_to_grid?: number;
}

interface AnalyticsCumulativeConsumptionCardProps {
  data: IntradayPoint[];
  currentTime?: string;
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function AnalyticsCumulativeConsumptionCard({ data, currentTime }: AnalyticsCumulativeConsumptionCardProps) {
  const { t } = useTranslation();

  const values = useMemo(() => {
    if (!data || data.length < 2) return null;
    const currentMin = currentTime != null ? parseTimeToMinutes(currentTime) : 24 * 60;
    const idx = data.findIndex((d) => parseTimeToMinutes(d.time) > currentMin);
    const lastIdx = idx >= 0 ? idx - 1 : data.length - 1;
    if (lastIdx < 0) return null;
    const d = data[lastIdx];
    return {
      gridToBuilding: d.cumulative_grid_to_building ?? 0,
      gridToBattery: d.cumulative_grid_to_battery ?? 0,
      solarToBuilding: d.cumulative_solar_to_building ?? 0,
      solarToBattery: d.cumulative_solar_to_battery ?? 0,
      batteryToBuilding: d.cumulative_battery_to_building ?? 0,
      exportedToGrid: d.cumulative_exported_to_grid ?? 0,
    };
  }, [data, currentTime]);

  const hasDecomposed = data?.some((d) => d.cumulative_grid_to_building != null) ?? false;

  if (!data || data.length < 2 || !hasDecomposed) {
    return (
      <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
        <div className="text-xs uppercase text-slate-400">{t("analytics.cumulativeConsumption")}</div>
        <div className="mt-1 text-slate-500 text-sm">{t("analytics.costSavingsNoData")}</div>
      </div>
    );
  }

  if (!values) {
    return (
      <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
        <div className="text-xs uppercase text-slate-400">{t("analytics.cumulativeConsumption")}</div>
        <div className="mt-1 text-slate-500 text-sm">{t("analytics.costSavingsNoData")}</div>
      </div>
    );
  }

  const rows: { key: string; label: string; value: number; color: string }[] = [
    { key: "gridToBuilding", label: t("analytics.consumption.gridToBuilding"), value: values.gridToBuilding, color: "text-red-400" },
    { key: "gridToBattery", label: t("analytics.consumption.gridToBattery"), value: values.gridToBattery, color: "text-cyan-400" },
    { key: "solarToBuilding", label: t("analytics.consumption.solarToBuilding"), value: values.solarToBuilding, color: "text-amber-400" },
    { key: "solarToBattery", label: t("analytics.consumption.solarToBattery"), value: values.solarToBattery, color: "text-orange-400" },
    { key: "batteryToBuilding", label: t("analytics.consumption.batteryToBuilding"), value: values.batteryToBuilding, color: "text-emerald-400" },
    { key: "exportedToGrid", label: t("analytics.consumption.exportedToGrid"), value: values.exportedToGrid, color: "text-violet-500" },
  ];

  return (
    <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
      <div className="text-xs uppercase text-slate-400">{t("analytics.cumulativeConsumption")}</div>
      <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-1.5">
        {rows.map(({ key, label, value, color }) => (
          <div key={key} className="flex justify-between items-center text-sm">
            <span className={color}>{label}</span>
            <span className={color}>{value.toFixed(2)} kWh</span>
          </div>
        ))}
      </div>
    </div>
  );
}

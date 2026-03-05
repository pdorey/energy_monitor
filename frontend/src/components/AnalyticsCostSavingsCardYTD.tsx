/**
 * Cost savings year-to-date: linear profile from Jan 1 (50% of today) to today (100% of today).
 * YTD = today_savings * (0.75 * day_of_year - 0.25)
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface AnalyticsCostSavingsCardYTDProps {
  costSavingsToday: number;
}

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 86400000;
  return Math.floor(diff / oneDay);
}

export function AnalyticsCostSavingsCardYTD({ costSavingsToday }: AnalyticsCostSavingsCardYTDProps) {
  const { t } = useTranslation();

  const ytd = useMemo(() => {
    const dayOfYear = getDayOfYear();
    if (dayOfYear < 1) return 0;
    // Linear: daily savings = today * (0.5 + 0.5 * d / dayOfYear). YTD = sum over d=0..dayOfYear-1
    // = today * (0.5 * dayOfYear + 0.5 * (0+1+...+(dayOfYear-1)) / dayOfYear)
    // = today * (0.5 * dayOfYear + 0.5 * (dayOfYear-1)/2)
    // = today * (0.75 * dayOfYear - 0.25)
    return costSavingsToday * (0.75 * dayOfYear - 0.25);
  }, [costSavingsToday]);

  const formatEur = (value: number) =>
    `${value >= 0 ? "" : "−"}€${Math.abs(value).toFixed(2)}`;

  return (
    <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
      <div className="text-xs uppercase text-slate-400">{t("analytics.costSavingsYTD")}</div>
      <div
        className={`mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold transition-all duration-300 ${
          ytd >= 0 ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {formatEur(ytd)}
      </div>
    </div>
  );
}

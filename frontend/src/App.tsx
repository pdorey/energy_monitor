import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { fetchJSON } from "./api/client";
import { useLiveData } from "./hooks/useLiveData";
import { EnergyFlowDiagram } from "./components/EnergyFlowDiagram";
import { AnalyticsCharts } from "./components/AnalyticsCharts";
import { PriceChart } from "./components/PriceChart";
import { SolarForecastChart } from "./components/SolarForecastChart";
import { EnergyProfileChart } from "./components/EnergyProfileChart";

interface Overview {
  timestamp: string;
  total_equipment: number;
  online_equipment: number;
  uptime_seconds: number;
  solar_kw: number;
  battery_kw: number;
  battery_soc_percent: number;
  grid_kw: number;
  load_kw: number;
}

interface EquipmentItem {
  equipment_id: string;
  name: string;
  type: string;
  status: string;
  location: string;
  metrics: Record<string, number>;
}

/** Slot name color: green (super_off_peak), blue (off_peak), orange (standard), red (peak). */
function getSlotColor(slotName: string): string {
  const s = (slotName || "").toLowerCase().replace(/-/g, "_");
  if (s === "super_off_peak") return "text-green-400";
  if (s === "off_peak") return "text-blue-400";
  if (s === "standard") return "text-orange-400";
  if (s === "peak") return "text-red-400";
  return "text-slate-300";
}

/** Format slot_name for display. Uses translation if key exists, else formatted string. */
function formatSlotName(slotName: string, t: (key: string) => string): string {
  if (!slotName) return "—";
  const key = `tariff.${slotName.toLowerCase().replace(/-/g, "_")}`;
  const translated = t(key);
  if (translated !== key) return translated;
  const s = slotName.toLowerCase().replace(/_/g, " ");
  return s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

interface ConsumptionData {
  time: string;
  building_kw: number;
  grid_kw: number;
  power_kw: number;
  solar_kw: number;
  active_paths: string[];
  path_definitions: Array<{
    path_id: string;
    from: string;
    to: string;
    color: string;
    source?: string;
    description: string;
  }>;
  valid_connections?: Array<{ from: string; to: string }>;
  labels: {
    building?: string;
    grid?: string;
    gridMeter?: string;
    inverter?: string;
    solar?: string;
    battery?: string;
  };
  building_consumption?: number;
  solar_production?: number;
  spot_price?: number;
  buy_price?: number;
  export_price?: number;
  tariff?: string;
  day_of_week?: string;
  season?: string;
  slot_name?: string;
}

/**
 * Main application component. Tab navigation: Overview, Energy Flow, Equipment, Analytics.
 * Uses WebSocket for real-time data and REST for overview/consumption/analytics.
 */
export function App() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<"overview" | "equipment" | "analytics">("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [consumptionData, setConsumptionData] = useState<ConsumptionData | null>(null);
  const [intradayData, setIntradayData] = useState<any[]>([]);
  const [intradayError, setIntradayError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { snapshot, status: wsStatus } = useLiveData();

  const fetchIntraday = useCallback(async () => {
    try {
      setIntradayError(null);
      const res = await fetchJSON<{ data?: any[]; error?: string }>("/api/intraday-analytics");
      if (res.error) {
        setIntradayError(res.error);
        setIntradayData([]);
      } else {
        setIntradayData(res.data || []);
      }
    } catch {
      setIntradayError(t("errors.failedAnalytics"));
      setIntradayData([]);
    }
  }, [t]);

  useEffect(() => {
    async function load() {
      try {
        const [ov, eq, consumption, intraday] = await Promise.all([
          fetchJSON<Overview>("/api/overview"),
          fetchJSON<EquipmentItem[]>("/api/equipment"),
          fetchJSON<ConsumptionData>("/api/consumption-data").catch(() => null),
          fetchJSON<{ data?: any[]; error?: string }>("/api/intraday-analytics").catch(() => ({ data: [] as any[] })),
        ]);
        setOverview(ov);
        setEquipment(eq);
        setConsumptionData(consumption);
        const intradayRes = intraday as { data?: any[]; error?: string } | undefined;
        if (intradayRes?.error) {
          setIntradayError(intradayRes.error);
          setIntradayData([]);
        } else {
          setIntradayData(intradayRes?.data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Periodically refresh consumption/path data so TIME and active paths follow simulated time
  useEffect(() => {
    let timer: number | undefined;

    const poll = async () => {
      try {
        const data = await fetchJSON<ConsumptionData>("/api/consumption-data");
        setConsumptionData(data);
      } catch {
        // ignore transient errors
      }
    };

    poll();
    timer = window.setInterval(poll, 2000);

    return () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
    };
  }, []);

  // Fetch overview when null (retry if initial load failed or API wasn't ready)
  useEffect(() => {
    if (overview != null || loading) return;
    let cancelled = false;
    const fetch = async () => {
      try {
        const ov = await fetchJSON<Overview>("/api/overview");
        if (!cancelled) setOverview(ov);
      } catch {
        // ignore
      }
    };
    fetch();
    const t = setTimeout(fetch, 3000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [overview, loading]);

  // Fetch intraday when on overview or analytics (ensures price chart loads without tab switch)
  useEffect(() => {
    if ((tab === "overview" || tab === "analytics") && intradayData.length === 0 && !loading) {
      fetchIntraday();
    }
  }, [tab, intradayData.length, loading, fetchIntraday]);

  // Retry intraday when consumption data arrives (simulator may not have been ready on initial load)
  useEffect(() => {
    if (consumptionData && intradayData.length === 0 && !loading) {
      const t = setTimeout(fetchIntraday, 500);
      return () => clearTimeout(t);
    }
  }, [consumptionData, intradayData.length, loading, fetchIntraday]);

  const soc = snapshot?.battery.soc_percent ?? overview?.battery_soc_percent ?? 0;
  const batteryKw = snapshot?.battery.power_w ? snapshot.battery.power_w / 1000 : overview?.battery_kw ?? 0;
  // Simulator: 4 devices (Gateway, Inverter, Battery, Solar) all online. Fallback when overview null.
  const hasSimulatorData = consumptionData != null || (equipment?.length ?? 0) > 0;
  const displayOnline = overview?.online_equipment ?? (hasSimulatorData ? 4 : 0);
  const displayTotal = overview?.total_equipment ?? (hasSimulatorData ? 4 : 0);
  const allOnline = displayOnline === displayTotal && displayTotal > 0;

  // Cumulative daily consumption and solar (from consumption data)
  const [dailyConsumptionSum, setDailyConsumptionSum] = useState(0);
  const [dailySolarSum, setDailySolarSum] = useState(0);
  const lastTimeRef = useRef("");
  const processedRowsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const bc = consumptionData?.building_consumption;
    const sp = consumptionData?.solar_production;
    const dt = consumptionData?.time;
    if (bc !== undefined && sp !== undefined && dt) {
      if (dt < lastTimeRef.current) {
        setDailyConsumptionSum(0);
        setDailySolarSum(0);
        processedRowsRef.current.clear();
      }
      if (!processedRowsRef.current.has(dt)) {
        setDailyConsumptionSum((p) => p + bc);
        setDailySolarSum((p) => p + sp);
        processedRowsRef.current.add(dt);
      }
      lastTimeRef.current = dt;
    }
  }, [consumptionData?.building_consumption, consumptionData?.solar_production, consumptionData?.time]);

  const getTariffColor = (tariffValue: string, isExport: boolean) => {
    const t = (tariffValue || "").toLowerCase();
    if (isExport) {
      if (t.includes("super low")) return "text-red-300";
      if (t.includes("low")) return "text-orange-300";
      if (t.includes("mid")) return "text-yellow-300";
      if (t.includes("peak")) return "text-green-300";
    } else {
      if (t.includes("super low")) return "text-green-300";
      if (t.includes("low")) return "text-yellow-300";
      if (t.includes("mid")) return "text-orange-300";
      if (t.includes("peak")) return "text-red-300";
    }
    return "text-slate-300";
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-semibold truncate">⚡ {t("app.title")}</h1>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  wsStatus === "open" ? "bg-emerald-400" : "bg-red-500"
                }`}
              />
              <span>{wsStatus === "open" ? t("status.live") : t("status.offline")}</span>
            </div>
            <button
              type="button"
              onClick={() => i18n.changeLanguage(i18n.language === "pt" ? "en" : "pt")}
              className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-slate-300 transition-colors"
              aria-label="Switch language"
              title={i18n.language === "pt" ? "English" : "Português"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <path d="M2 12h20" />
              </svg>
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 pb-2 flex gap-2 sm:gap-4 text-sm overflow-x-auto -mb-px">
          {["overview", "equipment", "analytics"].map((id) => (
            <button
              key={id}
              onClick={() => setTab(id as any)}
              className={`pb-1 border-b-2 shrink-0 whitespace-nowrap ${
                tab === id ? "border-emerald-400 text-emerald-300" : "border-transparent text-slate-400 hover:text-slate-300"
              }`}
            >
              {id === "overview" ? t("tabs.dashboard") : id === "equipment" ? t("tabs.equipment") : t("tabs.analytics")}
            </button>
          ))}
        </nav>
      </header>

      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 min-w-0">
        {loading && <div className="text-slate-400">{t("loading")}</div>}

        {!loading && tab === "overview" && (
          <div className="space-y-6">
            {/* Stats row: Equipment, Tariff, Battery, Daily, Solar, Prices */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">{t("cards.equipment")}</div>
                <div className={`mt-1 sm:mt-2 text-2xl sm:text-3xl font-semibold ${allOnline ? "text-emerald-400" : ""}`}>
                  {displayOnline}/{displayTotal}
                </div>
                <div className={`text-sm mt-1 ${allOnline ? "text-emerald-400" : "text-slate-400"}`}>{t("cards.online")}</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">{t("cards.tariff")}</div>
                <div className="mt-1 sm:mt-2 text-sm sm:text-base font-medium text-slate-300 capitalize">
                  {consumptionData?.day_of_week ? t(`tariff.${consumptionData.day_of_week}`) : "—"} · {consumptionData?.season ? t(`tariff.${consumptionData.season}`) : "—"}
                </div>
                <div className={`mt-0.5 text-lg sm:text-xl font-semibold ${getSlotColor(consumptionData?.slot_name ?? "")}`}>
                  {formatSlotName(consumptionData?.slot_name ?? "", t)}
                </div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">{t("cards.battery")}</div>
                <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold text-emerald-300">
                  {batteryKw >= 0 ? "+" : ""}{batteryKw.toFixed(1)} kW
                </div>
                <div className="text-sm text-slate-400 mt-0.5">{soc.toFixed(0)}% {t("cards.soc")}</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">{t("cards.daily")}</div>
                <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold text-slate-300">
                  {dailyConsumptionSum.toFixed(2)} <span className="text-sm">kWh</span>
                </div>
                <div className="text-sm text-slate-400 mt-1">{t("cards.consumption")}</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">{t("cards.solar")}</div>
                <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold text-amber-300">
                  {dailySolarSum.toFixed(2)} <span className="text-sm">kWh</span>
                </div>
                <div className="text-sm text-slate-400 mt-1">{t("cards.today")}</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">{t("cards.prices")}</div>
                <div className={`mt-1 sm:mt-2 text-sm sm:text-base font-medium ${getTariffColor(consumptionData?.tariff || "", false)}`}>
                  {t("cards.buy")}: {consumptionData?.buy_price !== undefined ? consumptionData.buy_price.toFixed(0) : "—"} €/MWh
                </div>
                <div className={`mt-0.5 text-sm sm:text-base font-medium ${getTariffColor(consumptionData?.tariff || "", true)}`}>
                  {t("cards.export")}: {consumptionData?.export_price !== undefined ? consumptionData.export_price.toFixed(0) : "—"} €/MWh
                </div>
              </div>
            </div>

            {/* Energy Flow + Energy Profile (left) | Prices + Solar Forecast (right) - bottoms align */}
            <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 items-stretch" style={{ minHeight: "480px" }}>
              <div className="lg:col-span-3 flex flex-col gap-3 min-h-0 min-w-0">
                <div className="flex-1 min-h-[280px] min-w-0 overflow-hidden flex flex-col">
                  <EnergyFlowDiagram
                    snapshot={snapshot}
                    overview={overview ? {
                      solar_kw: overview.solar_kw,
                      battery_kw: overview.battery_kw,
                      grid_kw: overview.grid_kw,
                      load_kw: overview.load_kw,
                      battery_soc_percent: overview.battery_soc_percent,
                      timestamp: overview.timestamp,
                    } : null}
                    activePaths={consumptionData?.active_paths}
                    pathDefinitions={consumptionData?.path_definitions}
                    validConnections={consumptionData?.valid_connections}
                    displayTime={consumptionData?.time}
                  />
                </div>
                <div className="shrink-0 mt-auto">
                  <EnergyProfileChart data={intradayData} currentTime={consumptionData?.time} />
                </div>
              </div>
              <div className="lg:col-span-3 flex flex-col gap-2 min-h-0 min-w-0">
                <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                  <PriceChart data={intradayData} />
                </div>
                <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                  <SolarForecastChart data={intradayData} currentTime={consumptionData?.time} />
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && tab === "equipment" && (
          <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
            {equipment.map((eq) => (
              <div key={eq.equipment_id} className="bg-slate-800/60 rounded-lg p-3 sm:p-4 min-w-0">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="font-semibold">{eq.name}</div>
                    <div className="text-xs text-slate-400 capitalize">{eq.type}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
                    {eq.status === "online" ? t("equipment.statusOnline") : eq.status === "offline" ? t("equipment.statusOffline") : eq.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  {Object.entries(eq.metrics).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-400">{k}</span>
                      <span>{v.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "analytics" && (
          <div>
            {intradayData.length > 0 ? (
              <AnalyticsCharts
                data={intradayData}
                currentTime={consumptionData?.time}
              />
            ) : (
              <div className="space-y-2">
                {intradayError && (
                  <div className="text-amber-400 text-sm">{intradayError}</div>
                )}
                <div className="text-slate-400 text-sm">
                  {intradayError ? t("errors.retryHint") : t("loadingAnalytics")}
                </div>
                <button
                  onClick={fetchIntraday}
                  className="text-sm px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                >
                  {t("errors.retry")}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

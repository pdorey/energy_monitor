import { useEffect, useState, useCallback, useRef } from "react";
import { fetchJSON } from "./api/client";
import { useLiveData } from "./hooks/useLiveData";
import { EnergyFlowDiagram } from "./components/EnergyFlowDiagram";
import { AnalyticsCharts } from "./components/AnalyticsCharts";

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

function formatHours(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours === 0) {
      return `${days}d`;
    }
    return `${days}d ${remainingHours}h ${minutes}m`;
  }
  
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
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
  buy_price?: number;  // New field
  export_price?: number;
  tariff?: string;
}

export function App() {
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
      setIntradayError("Failed to load analytics");
      setIntradayData([]);
    }
  }, []);

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

  // Refetch intraday when switching to analytics tab (in case initial load failed)
  useEffect(() => {
    if (tab === "analytics" && intradayData.length === 0 && !loading) {
      fetchIntraday();
    }
  }, [tab, intradayData.length, loading, fetchIntraday]);

  const soc = snapshot?.battery.soc_percent ?? overview?.battery_soc_percent ?? 0;
  const batteryKw = snapshot?.battery.power_w ? snapshot.battery.power_w / 1000 : overview?.battery_kw ?? 0;

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
          <h1 className="text-lg sm:text-xl font-semibold truncate">⚡ Energy Monitor Demo</h1>
          <div className="flex items-center gap-2 text-sm shrink-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                wsStatus === "open" ? "bg-emerald-400" : "bg-red-500"
              }`}
            />
            <span>{wsStatus === "open" ? "Live" : "Offline"}</span>
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
              {id === "overview" ? "Dashboard" : id === "equipment" ? "Equipment" : "Analytics"}
            </button>
          ))}
        </nav>
      </header>

      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 min-w-0">
        {loading && <div className="text-slate-400">Loading...</div>}

        {!loading && tab === "overview" && (
          <div className="space-y-6">
            {/* Stats row: Equipment, Uptime, Battery, Daily, Solar, Prices */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">Equipment</div>
                <div className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-semibold">
                  {overview?.online_equipment ?? 0}/{overview?.total_equipment ?? 0}
                </div>
                <div className="text-sm text-slate-400 mt-1">Online</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">Uptime</div>
                <div className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-semibold">
                  {overview ? formatHours(overview.uptime_seconds) : "0h"}
                </div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">Battery</div>
                <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold text-emerald-300">
                  {batteryKw >= 0 ? "+" : ""}{batteryKw.toFixed(1)} kW
                </div>
                <div className="text-sm text-slate-400 mt-0.5">{soc.toFixed(0)}% SOC</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">Daily</div>
                <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold text-slate-300">
                  {dailyConsumptionSum.toFixed(2)} <span className="text-sm">kWh</span>
                </div>
                <div className="text-sm text-slate-400 mt-1">Consumption</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">Solar</div>
                <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold text-amber-300">
                  {dailySolarSum.toFixed(2)} <span className="text-sm">kWh</span>
                </div>
                <div className="text-sm text-slate-400 mt-1">Today</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 sm:p-4">
                <div className="text-xs uppercase text-slate-400">Prices</div>
                <div className={`mt-1 sm:mt-2 text-lg sm:text-xl font-semibold ${getTariffColor(consumptionData?.tariff || "", false)}`}>
                  Buy: {consumptionData?.buy_price !== undefined ? consumptionData.buy_price.toFixed(0) : "—"}
                </div>
                <div className={`text-sm ${getTariffColor(consumptionData?.tariff || "", true)}`}>
                  Exp: {consumptionData?.export_price !== undefined ? consumptionData.export_price.toFixed(0) : "—"} €/MWh
                </div>
              </div>
            </div>

            {/* Energy Flow (left 50%) + Placeholder cards (right 50%) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:grid-rows-1" style={{ minHeight: "400px" }}>
              <div className="min-h-[320px] lg:min-h-0 flex">
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
              <div className="flex flex-col gap-4 min-h-[320px] lg:min-h-0">
                <div className="flex-1 min-h-[150px] bg-slate-800/60 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center">
                  <span className="text-slate-500 text-sm">Chart placeholder 1</span>
                </div>
                <div className="flex-1 min-h-[150px] bg-slate-800/60 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center">
                  <span className="text-slate-500 text-sm">Chart placeholder 2</span>
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
                    {eq.status}
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
                  {intradayError ? "Retry by switching tabs or refreshing." : "Loading analytics data..."}
                </div>
                <button
                  onClick={fetchIntraday}
                  className="text-sm px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

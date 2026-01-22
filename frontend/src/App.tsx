import { useEffect, useState } from "react";
import { fetchJSON } from "./api/client";
import { useLiveData } from "./hooks/useLiveData";
import { EnergyFlowDiagram } from "./components/EnergyFlowDiagram";

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
  export_price?: number;
  tariff?: string;
}

export function App() {
  const [tab, setTab] = useState<"overview" | "equipment" | "analytics">("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [consumptionData, setConsumptionData] = useState<ConsumptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const { snapshot, status: wsStatus } = useLiveData();

  useEffect(() => {
    async function load() {
      try {
        const [ov, eq, consumption] = await Promise.all([
          fetchJSON<Overview>("/api/overview"),
          fetchJSON<EquipmentItem[]>("/api/equipment"),
          fetchJSON<ConsumptionData>("/api/consumption-data").catch(() => null),
        ]);
        setOverview(ov);
        setEquipment(eq);
        setConsumptionData(consumption);
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

  const solarKw = snapshot?.solar.power_w ? snapshot.solar.power_w / 1000 : overview?.solar_kw ?? 0;
  //const gridKw = snapshot?.grid.power_w ? snapshot.grid.power_w / 1000 : overview?.grid_kw ?? 0;
  //const loadKw = snapshot?.load.power_w ? snapshot.load.power_w / 1000 : overview?.load_kw ?? 0;
  //const batteryKw = snapshot?.battery.power_w ? snapshot.battery.power_w / 1000 : overview?.battery_kw ?? 0;
  const soc = snapshot?.battery.soc_percent ?? overview?.battery_soc_percent ?? 0;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">⚡ Energy Monitor Demo</h1>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                wsStatus === "open" ? "bg-emerald-400" : "bg-red-500"
              }`}
            />
            <span>{wsStatus === "open" ? "Live" : "Offline"}</span>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 pb-2 flex gap-4 text-sm">
          {["overview", "equipment", "analytics"].map((id) => (
            <button
              key={id}
              onClick={() => setTab(id as any)}
              className={`pb-1 border-b-2 ${
                tab === id ? "border-emerald-400 text-emerald-300" : "border-transparent text-slate-400"
              }`}
            >
              {id === "overview" ? "Overview" : id === "equipment" ? "Equipment" : "Analytics"}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading && <div className="text-slate-400">Loading...</div>}

        {!loading && tab === "overview" && (
          <div className="space-y-6">
            {/* Stats row */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-xs uppercase text-slate-400">Equipment</div>
                <div className="mt-2 text-3xl font-semibold">
                  {overview?.online_equipment ?? 0}/{overview?.total_equipment ?? 0}
                </div>
                <div className="text-sm text-slate-400 mt-1">Online</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-xs uppercase text-slate-400">Uptime</div>
                <div className="mt-2 text-3xl font-semibold">
                  {overview ? formatHours(overview.uptime_seconds) : "0h"}
                </div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-xs uppercase text-slate-400">Solar</div>
                <div className="mt-2 text-3xl font-semibold text-amber-300">
                  {solarKw.toFixed(1)} <span className="text-sm">kW</span>
                </div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-xs uppercase text-slate-400">Battery</div>
                <div className="mt-2 text-3xl font-semibold text-emerald-300">
                  {soc.toFixed(0)} <span className="text-sm">%</span>
                </div>
              </div>
            </div>

            {/* Energy Flow Diagram */}
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
              labels={consumptionData?.labels}
              displayTime={consumptionData?.time}
              buildingConsumption={consumptionData?.building_consumption}
              solarProduction={consumptionData?.solar_production}
              spotPrice={consumptionData?.spot_price}
              exportPrice={consumptionData?.export_price}
              tariff={consumptionData?.tariff}
            />
          </div>
        )}

        {!loading && tab === "equipment" && (
          <div className="grid gap-4 md:grid-cols-2">
            {equipment.map((eq) => (
              <div key={eq.equipment_id} className="bg-slate-800/60 rounded-lg p-4">
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
          <div className="text-slate-400 text-sm">
            Analytics API is wired (`/api/analytics`), charts can be added here
            (e.g. Recharts or Chart.js) using the timeseries data.
          </div>
        )}
      </main>
    </div>
  );
}

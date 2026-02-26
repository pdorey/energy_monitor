import { useMemo, useState, useEffect, useRef } from "react";
import { Snapshot } from "../hooks/useLiveData";

interface EnergyFlowDiagramProps {
  snapshot: Snapshot | null;
  overview: {
    solar_kw: number;
    battery_kw: number;
    grid_kw: number;
    load_kw: number;
    battery_soc_percent: number;
    timestamp?: string;
  } | null;
  activePaths?: string[];
  pathDefinitions?: Array<{
    path_id: string;
    from: string;
    to: string;
    color: string;
    source?: string;
    description: string;
  }>;
  validConnections?: Array<{ from: string; to: string }>;
  labels?: Record<string, string | undefined>;
  displayTime?: string;
  buildingConsumption?: number;
  solarProduction?: number;
  buyPrice?: number;
  exportPrice?: number;
  tariff?: string;
}

const flowColors: Record<string, string> = {
  solar: "rgb(251, 191, 36)",
  battery: "rgb(34, 197, 94)",
  grid: "rgb(239, 68, 68)",
  yellow: "rgb(251, 191, 36)",
  green: "rgb(34, 197, 94)",
  red: "rgb(239, 68, 68)",
  inactive: "rgba(148, 163, 184, 0.35)",
};

// Fallback valid connections when API doesn't provide (from Paths.csv structure)
const DEFAULT_VALID_CONNECTIONS: Array<{ from: string; to: string }> = [
  { from: "grid", to: "gridMeter" },
  { from: "gridMeter", to: "building" },
  { from: "gridMeter", to: "inverter" },
  { from: "inverter", to: "battery" },
  { from: "inverter", to: "building" },
  { from: "solar", to: "inverter" },
  { from: "inverter", to: "gridMeter" },
];

function normalizeNode(name: string): string {
  const n = name.toLowerCase().replace(/\s+/g, "");
  if (n === "gridmeter") return "gridMeter";
  return n;
}

export function EnergyFlowDiagram({
  snapshot,
  overview,
  activePaths = [],
  pathDefinitions = [],
  validConnections,
  displayTime,
  buildingConsumption,
  solarProduction,
  buyPrice,
  exportPrice,
  tariff,
}: EnergyFlowDiagramProps) {
  void activePaths;
  const solarKw = snapshot?.solar.power_w ? snapshot.solar.power_w / 1000 : overview?.solar_kw ?? 0;
  const batteryKw = snapshot?.battery.power_w ? snapshot.battery.power_w / 1000 : overview?.battery_kw ?? 0;
  const gridKw = snapshot?.grid.power_w ? snapshot.grid.power_w / 1000 : overview?.grid_kw ?? 0;
  const loadKw = snapshot?.load.power_w ? snapshot.load.power_w / 1000 : overview?.load_kw ?? 0;
  const soc = snapshot?.battery.soc_percent ?? overview?.battery_soc_percent ?? 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 680, h: 320 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setDimensions({ w: Math.max(200, rect.width), h: Math.max(150, rect.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Responsive layout: positions as 0..1 normalized, then scaled to dimensions
  const layout = useMemo(() => {
    const W = dimensions.w;
    const H = dimensions.h;
    const cx = 0.5;
    const left = 0.18;
    const right = 0.82;
    const top = 0.12;
    const mid = 0.42;
    const bot = 0.72;

    return {
      building: { x: cx * W, y: top * H },
      inverter: { x: cx * W, y: mid * H },
      solar: { x: cx * W, y: bot * H },
      grid: { x: left * W, y: (top + mid) / 2 * H },
      gridMeter: { x: left * W, y: mid * H },
      battery: { x: right * W, y: mid * H },
      dailyConsumption: { x: (right + 1) / 2 * W, y: (top + mid) / 2 * H },
      dailySolar: { x: (right + 1) / 2 * W, y: mid * H },
      marketPrices: { x: (right + 1) / 2 * W, y: (mid + bot) / 2 * H },
      boxW: Math.min(88, W * 0.14),
      boxH: Math.min(56, H * 0.16),
      infoW: Math.min(120, W * 0.18),
      infoH: Math.min(64, H * 0.18),
    };
  }, [dimensions]);

  const connections = validConnections?.length ? validConnections : DEFAULT_VALID_CONNECTIONS;

  // Active path definitions: which connections are active and their color
  const activeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const pd of pathDefinitions) {
      const from = normalizeNode(pd.from);
      const to = normalizeNode(pd.to);
      const key = [from, to].sort().join("|");
      const color = (pd.color || "").toLowerCase();
      const rgb =
        color === "yellow" || color === "orange" ? flowColors.solar
        : color === "green" ? flowColors.battery
        : color === "red" ? flowColors.grid
        : flowColors[pd.source?.includes("solar") ? "solar" : pd.source?.includes("battery") ? "battery" : "grid"];
      if (!map.has(key)) map.set(key, rgb);
    }
    return map;
  }, [pathDefinitions]);

  // L-path: center A -> right angle (aligned with B) -> center B
  const makePath = (from: { x: number; y: number }, to: { x: number; y: number }): string => {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    if (dx < 1 && dy < 1) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    if (dx > dy) {
      return `M ${from.x} ${from.y} L ${to.x} ${from.y} L ${to.x} ${to.y}`;
    }
    return `M ${from.x} ${from.y} L ${from.x} ${to.y} L ${to.x} ${to.y}`;
  };

  const getCenter = (node: string) => {
    const key = node as keyof typeof layout;
    const pos = layout[key];
    if (!pos || typeof pos === "number") return { x: 0, y: 0 };
    return { x: pos.x, y: pos.y };
  };

  const [currentTime, setCurrentTime] = useState("");
  const [dailyConsumptionSum, setDailyConsumptionSum] = useState(0);
  const [dailySolarSum, setDailySolarSum] = useState(0);
  const lastTimeRef = useRef("");
  const processedRowsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (buildingConsumption !== undefined && solarProduction !== undefined && displayTime) {
      if (displayTime < lastTimeRef.current) {
        setDailyConsumptionSum(0);
        setDailySolarSum(0);
        processedRowsRef.current.clear();
      }
      if (!processedRowsRef.current.has(displayTime)) {
        setDailyConsumptionSum((p) => p + buildingConsumption);
        setDailySolarSum((p) => p + solarProduction);
        processedRowsRef.current.add(displayTime);
      }
      lastTimeRef.current = displayTime;
    }
  }, [buildingConsumption, solarProduction, displayTime]);

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

  useEffect(() => {
    if (displayTime) setCurrentTime(displayTime);
    else {
      const ts = snapshot?.timestamp || overview?.timestamp;
      if (ts) {
        const d = new Date(ts);
        setCurrentTime(d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
      } else {
        const n = new Date();
        setCurrentTime(n.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
      }
    }
    const iv = setInterval(() => {
      if (!displayTime && (snapshot?.timestamp || overview?.timestamp)) {
        const ts = snapshot?.timestamp || overview?.timestamp;
        if (ts) {
          const d = new Date(ts);
          setCurrentTime(d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
        }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [displayTime, snapshot?.timestamp, overview?.timestamp]);

  const boxStyle = (x: number, y: number, w: number, h: number) => ({
    left: x - w / 2,
    top: y - h / 2,
    width: w,
    height: h,
  });

  return (
    <div className="bg-slate-800/60 rounded-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-4">
        <div className="text-sm sm:text-base font-semibold uppercase text-slate-300">Energy Flow</div>
        {currentTime && <div className="text-sm sm:text-base font-semibold text-slate-300 font-mono">{currentTime}</div>}
      </div>
      <div ref={containerRef} className="relative w-full max-w-[680px] min-w-0 mx-auto overflow-hidden" style={{ aspectRatio: "680/320" }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${dimensions.w} ${dimensions.h}`} preserveAspectRatio="xMidYMid meet" className="block">
          {/* Grey base lines for all valid connections */}
          {connections.map((conn, i) => {
            const from = getCenter(normalizeNode(conn.from));
            const to = getCenter(normalizeNode(conn.to));
            const path = makePath(from, to);
            return (
              <path
                key={`base-${i}`}
                d={path}
                fill="none"
                stroke={flowColors.inactive}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          {/* Active colored overlay */}
          {connections.map((conn, i) => {
            const from = getCenter(normalizeNode(conn.from));
            const to = getCenter(normalizeNode(conn.to));
            const key = [normalizeNode(conn.from), normalizeNode(conn.to)].sort().join("|");
            const color = activeMap.get(key);
            if (!color) return null;
            const path = makePath(from, to);
            return (
              <g key={`active-${i}`}>
                <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
                <circle r="3" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
                  <animateMotion dur="2s" repeatCount="indefinite" path={path} />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Boxes - positioned absolutely over SVG */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute pointer-events-auto" style={boxStyle(layout.building.x, layout.building.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-slate-700/80 rounded-lg p-1.5 border-2 border-slate-600 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-sm shrink-0">🏢</span>
                <span className="text-[9px] font-semibold text-slate-300 truncate">BUILDING</span>
              </div>
              <div className="text-[10px] font-mono text-slate-300 truncate">{loadKw.toFixed(1)}{loadKw !== 0 ? " kW" : ""}</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.grid.x, layout.grid.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-blue-900/40 rounded-lg p-1.5 border-2 border-blue-500/50 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-sm shrink-0">⚡</span>
                <span className="text-[9px] font-semibold text-blue-300 truncate">GRID</span>
              </div>
              <div className={`text-[10px] font-mono truncate ${gridKw >= 0 ? "text-blue-300" : "text-emerald-300"}`}>{gridKw >= 0 ? "+" : ""}{gridKw.toFixed(1)}{gridKw !== 0 ? " kW" : ""}</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.gridMeter.x, layout.gridMeter.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-red-900/40 rounded-lg p-1.5 border-2 border-red-500/50 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-sm shrink-0">📊</span>
                <span className="text-[9px] font-semibold text-red-300 truncate">METER</span>
              </div>
              <div className="text-[10px] font-mono text-red-300 truncate">{Math.abs(gridKw).toFixed(1)}{Math.abs(gridKw) !== 0 ? " kW" : ""}</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.inverter.x, layout.inverter.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-slate-700/80 rounded-lg p-1.5 border-2 border-slate-500 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-sm shrink-0">🔄</span>
                <span className="text-[9px] font-semibold text-slate-300 truncate">INV</span>
              </div>
              <div className="text-[10px] font-mono text-slate-300 truncate">DC↔AC</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.solar.x, layout.solar.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-amber-900/40 rounded-lg p-1.5 border-2 border-amber-500/50 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-sm shrink-0">☀️</span>
                <span className="text-[9px] font-semibold text-amber-300 truncate">SOLAR</span>
              </div>
              <div className="text-[10px] font-mono text-amber-300 truncate">{solarKw.toFixed(1)}{solarKw !== 0 ? " kW" : ""}</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.battery.x, layout.battery.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-emerald-900/40 rounded-lg p-1.5 border-2 border-emerald-500/50 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-sm shrink-0">🔋</span>
                <span className="text-[9px] font-semibold text-emerald-300 truncate">BATT</span>
              </div>
              <div className="text-[10px] font-mono text-emerald-300 truncate">{batteryKw >= 0 ? "+" : ""}{batteryKw.toFixed(1)}{batteryKw !== 0 ? " kW" : ""}</div>
              <div className="text-[9px] text-slate-400 truncate">{soc.toFixed(0)}%</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.dailyConsumption.x, layout.dailyConsumption.y, layout.infoW, layout.infoH)}>
            <div className="h-full bg-slate-700/80 rounded-lg p-1.5 border-2 border-slate-600 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-sm shrink-0">📈</span>
                <span className="text-[9px] font-semibold text-slate-300 truncate">Daily</span>
              </div>
              <div className="text-[10px] font-mono text-slate-300 truncate">{dailyConsumptionSum.toFixed(2)} kWh</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.dailySolar.x, layout.dailySolar.y, layout.infoW, layout.infoH)}>
            <div className="h-full bg-amber-900/40 rounded-lg p-1.5 border-2 border-amber-500/50 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-sm shrink-0">☀️</span>
                <span className="text-[9px] font-semibold text-amber-300 truncate">Solar</span>
              </div>
              <div className="text-[10px] font-mono text-amber-300 truncate">{dailySolarSum.toFixed(2)} kWh</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.marketPrices.x, layout.marketPrices.y, layout.infoW, layout.infoH)}>
            <div className="h-full bg-slate-700/80 rounded-lg p-1.5 border-2 border-slate-600 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-sm shrink-0">💰</span>
                <span className="text-[9px] font-semibold text-slate-300 truncate">Prices</span>
              </div>
              <div className={`text-[10px] font-mono truncate ${getTariffColor(tariff || "", false)}`}>Buy: {buyPrice !== undefined ? buyPrice.toFixed(0) : "—"}</div>
              <div className={`text-[10px] font-mono truncate ${getTariffColor(tariff || "", true)}`}>Exp: {exportPrice !== undefined ? exportPrice.toFixed(0) : "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  displayTime?: string;
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

// Fallback valid connections (no solar-gridMeter - not a valid path)
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
  if (n === "gridmeter" || n === "gateway") return "gridMeter";
  return n;
}

export function EnergyFlowDiagram({
  snapshot,
  overview,
  activePaths = [],
  pathDefinitions = [],
  validConnections,
  displayTime,
}: EnergyFlowDiagramProps) {
  void activePaths;
  const solarKw = snapshot?.solar.power_w ? snapshot.solar.power_w / 1000 : overview?.solar_kw ?? 0;
  const batteryKw = snapshot?.battery.power_w ? snapshot.battery.power_w / 1000 : overview?.battery_kw ?? 0;
  const gridKw = snapshot?.grid.power_w ? snapshot.grid.power_w / 1000 : overview?.grid_kw ?? 0;
  const loadKw = snapshot?.load.power_w ? snapshot.load.power_w / 1000 : overview?.load_kw ?? 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 520, h: 380 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setDimensions({ w: Math.max(280, rect.width), h: Math.max(280, rect.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grid layout: 3 cols x 3 rows, equal spacing, larger boxes
  const layout = useMemo(() => {
    const W = dimensions.w;
    const H = dimensions.h;
    const boxW = 110;
    const boxH = 72;
    const gap = 24;
    const cellW = boxW + gap;
    const cellH = boxH + gap;
    const cols = 3;
    const rows = 3;
    const gridW = cols * cellW - gap;
    const gridH = rows * cellH - gap;
    const offsetX = (W - gridW) / 2 + cellW / 2;
    const offsetY = (H - gridH) / 2 + cellH / 2;

    const cell = (col: number, row: number) => ({
      x: offsetX + col * cellW,
      y: offsetY + row * cellH,
    });

    return {
      building: cell(1, 0),
      gridMeter: cell(0, 1),
      inverter: cell(1, 1),
      battery: cell(2, 1),
      grid: cell(0, 2),
      solar: cell(1, 2),
      boxW,
      boxH,
    };
  }, [dimensions]);

  const connections = useMemo(() => {
    const list = validConnections?.length ? validConnections : DEFAULT_VALID_CONNECTIONS;
    return list.filter((c) => {
      const a = normalizeNode(c.from);
      const b = normalizeNode(c.to);
      return !((a === "solar" && b === "gridmeter") || (a === "gridmeter" && b === "solar"));
    });
  }, [validConnections]);

  // Resolve path definition color to RGB
  const resolveColor = (pd: { color?: string; source?: string }) => {
    const color = (pd.color || "").toLowerCase();
    if (color === "yellow" || color === "orange") return flowColors.solar;
    if (color === "green") return flowColors.battery;
    if (color === "red") return flowColors.grid;
    const src = (pd.source || "").toLowerCase();
    if (src.includes("solar")) return flowColors.solar;
    if (src.includes("battery")) return flowColors.battery;
    return flowColors.grid;
  };

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
      <div ref={containerRef} className="relative w-full min-w-0 h-full min-h-[320px] overflow-hidden" style={{ aspectRatio: "4/3" }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${dimensions.w} ${dimensions.h}`} preserveAspectRatio="xMidYMid meet" className="block" style={{ zIndex: 0 }}>
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
          {/* Active paths: from pathDefinitions (PATH in Consumption.csv -> Paths.csv lookup) */}
          {pathDefinitions.map((pd, i) => {
            const from = getCenter(normalizeNode(pd.from));
            const to = getCenter(normalizeNode(pd.to));
            const color = resolveColor(pd);
            const path = makePath(from, to);
            return (
              <g key={`active-${pd.path_id}-${pd.from}-${pd.to}-${pd.source}-${i}`}>
                <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
                <circle r="3" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
                  <animateMotion dur="2s" repeatCount="indefinite" path={path} />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Boxes - on top of connectors (z-index 1) */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          <div className="absolute pointer-events-auto" style={boxStyle(layout.building.x, layout.building.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-slate-700 rounded-lg p-2 border-2 border-slate-600 flex flex-col justify-center overflow-hidden shadow-lg">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-lg shrink-0">🏢</span>
                <span className="text-xs font-semibold text-slate-300 truncate">BUILDING</span>
              </div>
              <div className="text-sm font-mono text-slate-300 truncate">{loadKw.toFixed(1)}{loadKw !== 0 ? " kW" : ""}</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.grid.x, layout.grid.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-blue-900 rounded-lg p-2 border-2 border-blue-500/50 flex flex-col justify-center overflow-hidden shadow-lg">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-lg shrink-0">⚡</span>
                <span className="text-xs font-semibold text-blue-300 truncate">GRID</span>
              </div>
              <div className={`text-sm font-mono truncate ${gridKw >= 0 ? "text-blue-300" : "text-emerald-300"}`}>{gridKw >= 0 ? "+" : ""}{gridKw.toFixed(1)}{gridKw !== 0 ? " kW" : ""}</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.gridMeter.x, layout.gridMeter.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-red-900 rounded-lg p-2 border-2 border-red-500/50 flex flex-col justify-center overflow-hidden shadow-lg">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-lg shrink-0">📊</span>
                <span className="text-xs font-semibold text-red-300 truncate">GATEWAY</span>
              </div>
              <div className="text-sm font-mono text-red-300 truncate">{Math.abs(gridKw).toFixed(1)}{Math.abs(gridKw) !== 0 ? " kW" : ""}</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.inverter.x, layout.inverter.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-slate-700 rounded-lg p-2 border-2 border-slate-500 flex flex-col justify-center overflow-hidden shadow-lg">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-lg shrink-0">🔄</span>
                <span className="text-xs font-semibold text-slate-300 truncate">INVERTER</span>
              </div>
              <div className="text-sm font-mono text-slate-300 truncate">DC↔AC</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.solar.x, layout.solar.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-amber-900 rounded-lg p-2 border-2 border-amber-500/50 flex flex-col justify-center overflow-hidden shadow-lg">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-lg shrink-0">☀️</span>
                <span className="text-xs font-semibold text-amber-300 truncate">SOLAR</span>
              </div>
              <div className="text-sm font-mono text-amber-300 truncate">{solarKw.toFixed(1)}{solarKw !== 0 ? " kW" : ""}</div>
            </div>
          </div>

          <div className="absolute pointer-events-auto" style={boxStyle(layout.battery.x, layout.battery.y, layout.boxW, layout.boxH)}>
            <div className="h-full bg-emerald-900 rounded-lg p-2 border-2 border-emerald-500/50 flex flex-col justify-center overflow-hidden shadow-lg">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-lg shrink-0">🔋</span>
                <span className="text-xs font-semibold text-emerald-300 truncate">BATTERY</span>
              </div>
              <div className="text-sm font-mono text-emerald-300 truncate">{batteryKw >= 0 ? "+" : ""}{batteryKw.toFixed(1)}{batteryKw !== 0 ? " kW" : ""}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

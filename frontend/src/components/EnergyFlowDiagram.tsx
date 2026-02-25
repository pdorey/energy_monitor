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
  // Path data from Excel: which paths are active (PATH 1, PATH 2, PATH 3)
  activePaths?: string[]; // e.g., ["PATH 1", "PATH 2"]
  // Path definitions from Excel table N3:R9
  pathDefinitions?: Array<{
    path_id: string;
    from: string;
    to: string;
    color: string;
    source?: string;
    description: string;
  }>;
  // Labels for boxes from Excel
  labels?: {
    building?: string;
    grid?: string;
    gridMeter?: string;
    inverter?: string;
    solar?: string;
    battery?: string;
  };
  // Time to display (from Excel table)
  displayTime?: string;
  // Additional data for new boxes
  buildingConsumption?: number;
  solarProduction?: number;
  buyPrice?: number;
  exportPrice?: number;
  tariff?: string;
}

// Flow colors based on energy source
const flowColors = {
  solar: "rgb(251, 191, 36)", // Yellow/Orange - solar energy
  battery: "rgb(34, 197, 94)", // Green - battery energy
  grid: "rgb(239, 68, 68)", // Red - grid energy
  inactive: "rgba(148, 163, 184, 0.3)", // Gray - inactive
};


export function EnergyFlowDiagram({ snapshot, overview, displayTime, buildingConsumption, solarProduction, buyPrice, exportPrice, tariff }: EnergyFlowDiagramProps) {
  // Calculate power values in kW
  const solarKw = snapshot?.solar.power_w ? snapshot.solar.power_w / 1000 : overview?.solar_kw ?? 0;
  const batteryKw = snapshot?.battery.power_w ? snapshot.battery.power_w / 1000 : overview?.battery_kw ?? 0;
  const gridKw = snapshot?.grid.power_w ? snapshot.grid.power_w / 1000 : overview?.grid_kw ?? 0;
  const loadKw = snapshot?.load.power_w ? snapshot.load.power_w / 1000 : overview?.load_kw ?? 0;
  const soc = snapshot?.battery.soc_percent ?? overview?.battery_soc_percent ?? 0;

  // Compact box dimensions
  const boxWidth = 88;
  const boxHeight = 56;
  const boxInfoWidth = 120;
  const boxInfoHeight = 64;

  // Layout: Compact diagram
  const gridMeterX = 70;
  const inverterX = 200;
  const batteryX = 330;
  const rightBoxesX = 520;

  const positions = {
    building: { x: inverterX, y: 36 },
    grid: { x: gridMeterX, y: 220 },
    gridMeter: { x: gridMeterX, y: 128 },
    inverter: { x: inverterX, y: 128 },
    solar: { x: inverterX, y: 220 },
    battery: { x: batteryX, y: 128 },
    dailyConsumption: { x: rightBoxesX, y: 64 },
    dailySolar: { x: rightBoxesX, y: 140 },
    marketPrices: { x: rightBoxesX, y: 216 },
  };

  // One connector per box: dominant flow only. Color = source (yellow=solar, green=battery, red=grid)
  type Side = "top" | "bottom" | "left" | "right";
  type SingleFlow = { from: string; to: string; powerKw: number; color: string; fromSide: Side; toSide: Side };

  // Responsive scaling: diagram scales down on narrow viewports
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const diagramWidth = 680;
  const diagramHeight = 320;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateScale = () => {
      const w = el.offsetWidth;
      setScale(Math.min(1, w / diagramWidth));
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const singleFlows = useMemo<SingleFlow[]>(() => {
    const threshold = 0.1;
    const result: SingleFlow[] = [];

    // Solar -> Inverter (yellow)
    if (solarKw > threshold) {
      result.push({
        from: "solar", to: "inverter", powerKw: solarKw, color: flowColors.solar,
        fromSide: "top", toSide: "bottom",
      });
    }

    // Battery <-> Inverter (green)
    if (Math.abs(batteryKw) > threshold) {
      if (batteryKw > 0) {
        result.push({ from: "battery", to: "inverter", powerKw: batteryKw, color: flowColors.battery, fromSide: "left", toSide: "right" });
      } else {
        result.push({ from: "inverter", to: "battery", powerKw: Math.abs(batteryKw), color: flowColors.battery, fromSide: "right", toSide: "left" });
      }
    }

    // Grid <-> GridMeter (red)
    if (Math.abs(gridKw) > threshold) {
      if (gridKw > 0) {
        result.push({ from: "grid", to: "gridMeter", powerKw: gridKw, color: flowColors.grid, fromSide: "top", toSide: "bottom" });
      } else {
        result.push({ from: "gridMeter", to: "grid", powerKw: Math.abs(gridKw), color: flowColors.grid, fromSide: "bottom", toSide: "top" });
      }
    }

    // GridMeter <-> Inverter (red) - when grid supplies inverter
    const gridImporting = gridKw > threshold;
    const inverterToBuilding = Math.min(loadKw, solarKw + (batteryKw > 0 ? batteryKw : 0));
    const gridToInverter = gridImporting ? Math.max(0, loadKw - inverterToBuilding) : 0;
    if (gridToInverter > threshold) {
      result.push({ from: "gridMeter", to: "inverter", powerKw: gridToInverter, color: flowColors.grid, fromSide: "right", toSide: "left" });
    } else if (gridKw < -threshold) {
      // Export: color by dominant source (solar or battery)
      const solarExport = Math.min(solarKw, Math.abs(gridKw));
      const batteryExport = Math.abs(gridKw) - solarExport;
      const exportColor = solarExport >= batteryExport ? flowColors.solar : flowColors.battery;
      result.push({ from: "inverter", to: "gridMeter", powerKw: Math.abs(gridKw), color: exportColor, fromSide: "left", toSide: "right" });
    }

    // Building: one connector from dominant source (inverter or grid)
    const solarToBuilding = Math.min(solarKw, loadKw);
    const batteryToBuilding = batteryKw > 0 ? Math.min(batteryKw, loadKw - solarToBuilding) : 0;
    const invToBld = solarToBuilding + batteryToBuilding;
    const gridToBuilding = gridImporting ? Math.min(gridKw, loadKw - invToBld) : 0;
    if (invToBld >= gridToBuilding && invToBld > threshold) {
      const buildingColor = batteryToBuilding > solarToBuilding ? flowColors.battery : flowColors.solar;
      result.push({ from: "inverter", to: "building", powerKw: invToBld, color: buildingColor, fromSide: "top", toSide: "bottom" });
    } else if (gridToBuilding > threshold) {
      result.push({ from: "gridMeter", to: "building", powerKw: gridToBuilding, color: flowColors.grid, fromSide: "top", toSide: "left" });
    }

    return result;
  }, [solarKw, batteryKw, gridKw, loadKw]);

  // Calculate connection points
  // When both nodes are inverter/battery, use 30%/50%/70% offsets
  // Otherwise use 40%/60%/50% offsets
  const getConnectionPoint = (node: string, side: Side, offset: "left" | "right" | "center" = "center", otherNode?: string) => {
    const pos = positions[node as keyof typeof positions];
    const halfW = boxWidth / 2;
    const halfH = boxHeight / 2;
    
    // Check if this is an inverter ↔ battery connection
    const isInverterBatteryConnection = (node === "inverter" || node === "battery") && 
                                       (otherNode === "inverter" || otherNode === "battery");
    
    switch (side) {
      case "top":
        // Top edge: 60% and 40% of width (so right offset is at 60%, left offset is at 40%)
        if (offset === "left") {
          return { x: pos.x - halfW * 0.2, y: pos.y - halfH }; // 40% from left
        } else if (offset === "right") {
          return { x: pos.x + halfW * 0.2, y: pos.y - halfH }; // 60% from left
        } else {
          return { x: pos.x, y: pos.y - halfH };
        }
      case "bottom":
        // Bottom edge: 40% and 60% of width
        if (offset === "left") {
          return { x: pos.x - halfW * 0.2, y: pos.y + halfH }; // 40% from left
        } else if (offset === "right") {
          return { x: pos.x + halfW * 0.2, y: pos.y + halfH }; // 60% from left
        } else {
          return { x: pos.x, y: pos.y + halfH };
        }
      case "left":
        // Left edge:
        // - For inverter ↔ battery connections: 30%/50%/70% of height
        // - For all other connections: 40%/60%/50% of height
        if (isInverterBatteryConnection) {
          if (offset === "left") {
            return { x: pos.x - halfW, y: pos.y - halfH * 0.4 }; // 30% from top
          } else if (offset === "right") {
            return { x: pos.x - halfW, y: pos.y + halfH * 0.4 }; // 70% from top
          } else {
            return { x: pos.x - halfW, y: pos.y };               // 50% from top
          }
        } else {
          if (offset === "left") {
            return { x: pos.x - halfW, y: pos.y - halfH * 0.2 }; // 40% from top
          } else if (offset === "right") {
            return { x: pos.x - halfW, y: pos.y + halfH * 0.2 }; // 60% from top
          } else {
            return { x: pos.x - halfW, y: pos.y };
          }
        }
      case "right":
        // Right edge:
        // - For inverter ↔ battery connections: 30%/50%/70% of height
        // - For all other connections: 40%/60%/50% of height
        if (isInverterBatteryConnection) {
          if (offset === "left") {
            return { x: pos.x + halfW, y: pos.y - halfH * 0.4 }; // 30% from top
          } else if (offset === "right") {
            return { x: pos.x + halfW, y: pos.y + halfH * 0.4 }; // 70% from top
          } else {
            return { x: pos.x + halfW, y: pos.y };               // 50% from top
          }
        } else {
          if (offset === "left") {
            return { x: pos.x + halfW, y: pos.y - halfH * 0.2 }; // 40% from top
          } else if (offset === "right") {
            return { x: pos.x + halfW, y: pos.y + halfH * 0.2 }; // 60% from top
          } else {
            return { x: pos.x + halfW, y: pos.y };
          }
        }
      default:
        return pos;
    }
  };

  // Create right-angled path (always right-angled)
  // For vertical connections: go up/down first (90 deg), then horizontal
  // For horizontal connections: go horizontal first, then vertical
  // Special case: right-angle from top to left (Grid Meter to Building)
  const createRightAnglePath = (from: { x: number; y: number }, to: { x: number; y: number }, fromSide: Side, toSide: Side, isRightAngle?: boolean): string => {
    // Special right-angle path: from top to left (e.g., Grid Meter top to Building left)
    if (isRightAngle && fromSide === "top" && toSide === "left") {
      const midY = Math.min(from.y - 20, to.y + 20);
      return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
    }
    // Determine intermediate point for right angle
    let midX = from.x;
    let midY = from.y;

    // Strategy based on connection type
    if (fromSide === "top" || fromSide === "bottom") {
      // Vertical connection: go vertical first (straight up/down at 90 deg), then horizontal
      if (toSide === "left" || toSide === "right") {
        // Vertical to horizontal: go to target's Y first (straight up/down), then horizontal to target's X
        midX = from.x;
        midY = to.y;
      } else {
        // Both vertical (top/bottom): go straight up/down first (90 deg), then horizontal to align X positions
        if (Math.abs(from.x - to.x) > 1) {
          // X positions differ: go straight up/down to target Y, then horizontal to target X
          midX = from.x;
          midY = to.y; // First go straight vertical to target's Y level
        } else {
          // X positions same: straight vertical line (no horizontal segment needed)
          // But still need a midpoint for the path command
          midX = from.x;
          midY = (from.y + to.y) / 2;
        }
      }
    } else if (fromSide === "left" || fromSide === "right") {
      // Horizontal connection: go horizontal first, then vertical
      if (toSide === "top" || toSide === "bottom") {
        // Horizontal to vertical: go to target's X first, then vertical to target's Y
        midX = to.x;
        midY = from.y;
      } else {
        // Both horizontal: go straight left/right
        midX = (from.x + to.x) / 2;
        midY = from.y;
      }
    }

    return `M ${from.x} ${from.y} L ${midX} ${midY} L ${to.x} ${to.y}`;
  };

  // Animated time display - updates every second, value comes from Consumption.csv
  const [currentTime, setCurrentTime] = useState<string>("");
  
  // Cumulative sums for daily consumption and solar production
  // CSV values appear to be incremental per 15-min period, so we sum them
  const [dailyConsumptionSum, setDailyConsumptionSum] = useState<number>(0);
  const [dailySolarSum, setDailySolarSum] = useState<number>(0);
  const lastTimeRef = useRef<string>("");
  const processedRowsRef = useRef<Set<string>>(new Set());
  
  // Update cumulative sums when buildingConsumption or solarProduction changes
  useEffect(() => {
    if (buildingConsumption !== undefined && solarProduction !== undefined && displayTime) {
      // Reset if time goes backwards (new day cycle)
      if (displayTime < lastTimeRef.current) {
        setDailyConsumptionSum(0);
        setDailySolarSum(0);
        processedRowsRef.current.clear();
      }
      
      // Only add if we haven't processed this time yet
      if (!processedRowsRef.current.has(displayTime)) {
        setDailyConsumptionSum(prev => prev + buildingConsumption);
        setDailySolarSum(prev => prev + solarProduction);
        processedRowsRef.current.add(displayTime);
      }
      
      lastTimeRef.current = displayTime;
    }
  }, [buildingConsumption, solarProduction, displayTime]);
  
  // Helper to get tariff color
  const getTariffColor = (tariffValue: string, isExport: boolean = false) => {
    const tariff = (tariffValue || "").toLowerCase();
    if (isExport) {
      // Export: Super Low (Red), Low (Orange), Mid (Yellow), Peak (Green)
      if (tariff.includes("super low")) return "text-red-300";
      if (tariff.includes("low")) return "text-orange-300";
      if (tariff.includes("mid")) return "text-yellow-300";
      if (tariff.includes("peak")) return "text-green-300";
    } else {
      // Spot: Super Low (Green), Low (Yellow), Mid (Orange), Peak (Red)
      if (tariff.includes("super low")) return "text-green-300";
      if (tariff.includes("low")) return "text-yellow-300";
      if (tariff.includes("mid")) return "text-orange-300";
      if (tariff.includes("peak")) return "text-red-300";
    }
    return "text-slate-300";
  };
  
  useEffect(() => {
    const updateTime = () => {
      if (displayTime) {
        // Primary source: TIME column from Consumption.csv
        setCurrentTime(displayTime);
      } else {
        // Fallback: use snapshot or overview timestamp
        const ts = snapshot?.timestamp || overview?.timestamp;
        if (ts) {
          const date = new Date(ts);
          setCurrentTime(
            date.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })
          );
        } else {
          const now = new Date();
          setCurrentTime(
            now.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })
          );
        }
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [displayTime, snapshot?.timestamp, overview?.timestamp]);

  return (
    <div className="bg-slate-800/60 rounded-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-4">
        <div className="text-sm sm:text-base font-semibold uppercase text-slate-300">Energy Flow</div>
        {currentTime && (
          <div className="text-sm sm:text-base font-semibold text-slate-300 font-mono">
            {currentTime}
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className="w-full max-w-[680px] min-w-0 mx-auto overflow-hidden"
        style={{ aspectRatio: `${diagramWidth}/${diagramHeight}` }}
      >
        <div
          className="relative origin-top-left"
          style={{
            width: diagramWidth,
            height: diagramHeight,
            transform: `scale(${scale})`,
          }}
        >
        <svg width="680" height="320" className="absolute inset-0">
          {/* One connector per connection: colored by source (yellow=solar, green=battery, red=grid), direction shown by animated dot */}
          {singleFlows.map((flow, idx) => {
            const fromPoint = getConnectionPoint(flow.from, flow.fromSide, "center", flow.to);
            const toPoint = getConnectionPoint(flow.to, flow.toSide, "center", flow.from);
            const isRightAngle = flow.fromSide === "top" && flow.toSide === "left";
            const path = createRightAnglePath(fromPoint, toPoint, flow.fromSide, flow.toSide, isRightAngle);
            return (
              <g key={`flow-${flow.from}-${flow.to}-${idx}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={flow.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ filter: `drop-shadow(0 0 2px ${flow.color})` }}
                />
                <circle r="3" fill={flow.color} style={{ filter: `drop-shadow(0 0 4px ${flow.color})` }}>
                  <animateMotion dur="2s" repeatCount="indefinite" path={path} />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Component boxes */}
        {/* Building */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-2 border-2 border-slate-600 flex flex-col justify-start"
          style={{
            left: positions.building.x - boxWidth / 2,
            top: positions.building.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="text-base">🏢</div>
            <div className="text-[10px] font-semibold text-slate-300">BUILDING</div>
          </div>
          <div className="text-xs font-mono text-slate-300">
            {loadKw.toFixed(1)}{loadKw !== 0 ? " kW" : ""}
          </div>
        </div>

        {/* Grid */}
        <div
          className="absolute bg-blue-900/40 rounded-lg p-2 border-2 border-blue-500/50 flex flex-col justify-start"
          style={{
            left: positions.grid.x - boxWidth / 2,
            top: positions.grid.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="text-base">⚡</div>
            <div className="text-[10px] font-semibold text-blue-300">GRID</div>
          </div>
          <div className={`text-xs font-mono ${gridKw >= 0 ? "text-blue-300" : "text-emerald-300"}`}>
            {gridKw >= 0 ? "+" : ""}{gridKw.toFixed(1)}{gridKw !== 0 ? " kW" : ""}
          </div>
        </div>

        {/* Grid Meter */}
        <div
          className="absolute bg-red-900/40 rounded-lg p-2 border-2 border-red-500/50 flex flex-col justify-start"
          style={{
            left: positions.gridMeter.x - boxWidth / 2,
            top: positions.gridMeter.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="text-base">📊</div>
            <div className="text-[10px] font-semibold text-red-300">GRID METER</div>
          </div>
          <div className="text-xs font-mono text-red-300">
            {Math.abs(gridKw).toFixed(1)}{Math.abs(gridKw) !== 0 ? " kW" : ""}
          </div>
        </div>

        {/* Inverter */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-2 border-2 border-slate-500 flex flex-col justify-start"
          style={{
            left: positions.inverter.x - boxWidth / 2,
            top: positions.inverter.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="text-base">🔄</div>
            <div className="text-[10px] font-semibold text-slate-300">INVERTER</div>
          </div>
          <div className="text-xs font-mono text-slate-300">DC↔AC</div>
        </div>

        {/* Solar */}
        <div
          className="absolute bg-amber-900/40 rounded-lg p-2 border-2 border-amber-500/50 flex flex-col justify-start"
          style={{
            left: positions.solar.x - boxWidth / 2,
            top: positions.solar.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="text-base">☀️</div>
            <div className="text-[10px] font-semibold text-amber-300">SOLAR</div>
          </div>
          <div className="text-xs font-mono text-amber-300">
            {solarKw.toFixed(1)}{solarKw !== 0 ? " kW" : ""}
          </div>
        </div>

        {/* Battery */}
        <div
          className="absolute bg-emerald-900/40 rounded-lg p-2 border-2 border-emerald-500/50 flex flex-col justify-start"
          style={{
            left: positions.battery.x - boxWidth / 2,
            top: positions.battery.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="text-base">🔋</div>
            <div className="text-[10px] font-semibold text-emerald-300">BATTERY</div>
          </div>
          <div className="text-xs font-mono text-emerald-300">
            {batteryKw >= 0 ? "+" : ""}{batteryKw.toFixed(1)}{batteryKw !== 0 ? " kW" : ""}
          </div>
          <div className="text-[10px] text-slate-400">{soc.toFixed(0)}% SOC</div>
        </div>

        {/* Daily Consumption */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-2 border-2 border-slate-600 flex flex-col justify-start"
          style={{
            left: positions.dailyConsumption.x - boxWidth / 2,
            top: positions.dailyConsumption.y - boxHeight / 2,
            width: boxInfoWidth,
            height: boxInfoHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="text-base">📈</div>
            <div className="text-[10px] font-semibold text-slate-300">Daily Consumption</div>
          </div>
          <div className="text-xs font-mono text-slate-300">
            {dailyConsumptionSum.toFixed(2)} kWh
          </div>
        </div>

        {/* Daily Solar Production */}
        <div
          className="absolute bg-amber-900/40 rounded-lg p-2 border-2 border-amber-500/50 flex flex-col justify-start"
          style={{
            left: positions.dailySolar.x - boxWidth / 2,
            top: positions.dailySolar.y - boxHeight / 2,
            width: boxInfoWidth,
            height: boxInfoHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="text-base">☀️</div>
            <div className="text-[10px] font-semibold text-amber-300">Daily Solar</div>
          </div>
          <div className="text-xs font-mono text-amber-300">
            {dailySolarSum.toFixed(2)} kWh
          </div>
        </div>

        {/* Market Prices */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-2 border-2 border-slate-600 flex flex-col justify-start"
          style={{
            left: positions.marketPrices.x - boxWidth / 2,
            top: positions.marketPrices.y - boxHeight / 2,
            width: boxInfoWidth,
            height: boxInfoHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <div className="text-base">💰</div>
            <div className="text-[10px] font-semibold text-slate-300">Market Prices</div>
          </div>
          <div className={`text-xs font-mono ${getTariffColor(tariff || "", false)}`}>
            Buy: {buyPrice !== undefined ? buyPrice.toFixed(0) : "—"} €/MWh
          </div>
          <div className={`text-xs font-mono ${getTariffColor(tariff || "", true)}`}>
            Export: {exportPrice !== undefined ? exportPrice.toFixed(0) : "—"} €/MWh
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

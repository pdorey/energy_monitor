import { useMemo } from "react";
import { Snapshot } from "../hooks/useLiveData";

interface EnergyFlowDiagramProps {
  snapshot: Snapshot | null;
  overview: {
    solar_kw: number;
    battery_kw: number;
    grid_kw: number;
    load_kw: number;
    battery_soc_percent: number;
  } | null;
}

interface EnergyFlow {
  from: string;
  to: string;
  powerKw: number;
  color: string;
}

// Component theme colors
const componentColors = {
  grid: "rgb(59, 130, 246)", // blue-500
  gridMeter: "rgb(239, 68, 68)", // red-500
  building: "rgb(148, 163, 184)", // slate-400
  inverter: "rgb(148, 163, 184)", // slate-400
  solar: "rgb(251, 191, 36)", // amber-400
  battery: "rgb(34, 197, 94)", // emerald-500
};

export function EnergyFlowDiagram({ snapshot, overview }: EnergyFlowDiagramProps) {
  // Calculate power values in kW
  const solarKw = snapshot?.solar.power_w ? snapshot.solar.power_w / 1000 : overview?.solar_kw ?? 0;
  const batteryKw = snapshot?.battery.power_w ? snapshot.battery.power_w / 1000 : overview?.battery_kw ?? 0;
  const gridKw = snapshot?.grid.power_w ? snapshot.grid.power_w / 1000 : overview?.grid_kw ?? 0;
  const loadKw = snapshot?.load.power_w ? snapshot.load.power_w / 1000 : overview?.load_kw ?? 0;
  const soc = snapshot?.battery.soc_percent ?? overview?.battery_soc_percent ?? 0;

  // Calculate energy flows - flows go through grid meter
  const flows = useMemo<EnergyFlow[]>(() => {
    const flows: EnergyFlow[] = [];
    const threshold = 0.1;
    
    // Battery: negative = charging, positive = discharging
    // Grid: positive = importing, negative = exporting
    const batteryCharging = batteryKw < -threshold;
    const batteryDischarging = batteryKw > threshold;
    const batteryChargePower = Math.abs(batteryKw);
    const gridImporting = gridKw > threshold;
    const gridExporting = gridKw < -threshold;

    // 1. Solar to Inverter
    if (solarKw > threshold) {
      flows.push({
        from: "solar",
        to: "inverter",
        powerKw: solarKw,
        color: componentColors.solar,
      });
    }

    // 2. Battery flows
    if (batteryCharging) {
      // Battery charging from inverter (solar)
      if (solarKw > threshold) {
        const solarForBattery = Math.min(solarKw, batteryChargePower);
        flows.push({
          from: "inverter",
          to: "battery",
          powerKw: solarForBattery,
          color: componentColors.battery,
        });
      }
      
      // Battery charging from grid (via grid meter)
      if (batteryChargePower > solarKw && gridImporting) {
        const gridForBattery = Math.min(gridKw, batteryChargePower - solarKw);
        flows.push({
          from: "gridMeter",
          to: "battery",
          powerKw: gridForBattery,
          color: componentColors.battery,
        });
      }
    } else if (batteryDischarging) {
      flows.push({
        from: "battery",
        to: "inverter",
        powerKw: batteryKw,
        color: componentColors.inverter,
      });
    }

    // 3. Inverter to Building
    const solarToBuilding = Math.max(0, Math.min(solarKw - (batteryCharging ? Math.min(solarKw, batteryChargePower) : 0), loadKw));
    const batteryToBuilding = batteryDischarging ? Math.min(batteryKw, loadKw - solarToBuilding) : 0;
    const inverterToBuilding = solarToBuilding + batteryToBuilding;
    
    if (inverterToBuilding > threshold) {
      flows.push({
        from: "inverter",
        to: "building",
        powerKw: inverterToBuilding,
        color: componentColors.building,
      });
    }

    // 4. Inverter to Grid Meter (for export)
    const solarExcess = Math.max(0, solarKw - (batteryCharging ? Math.min(solarKw, batteryChargePower) : 0) - solarToBuilding);
    const batteryExport = batteryDischarging ? Math.max(0, batteryKw - batteryToBuilding) : 0;
    const inverterToGrid = solarExcess + batteryExport;
    
    if (inverterToGrid > threshold) {
      flows.push({
        from: "inverter",
        to: "gridMeter",
        powerKw: inverterToGrid,
        color: componentColors.gridMeter,
      });
    }

    // 5. Grid Meter to Grid (exporting)
    if (gridExporting) {
      flows.push({
        from: "gridMeter",
        to: "grid",
        powerKw: Math.abs(gridKw),
        color: componentColors.grid,
      });
    }

    // 6. Grid to Grid Meter (importing)
    if (gridImporting) {
      flows.push({
        from: "grid",
        to: "gridMeter",
        powerKw: gridKw,
        color: componentColors.gridMeter,
      });
    }

    // 7. Grid Meter to Building (when importing)
    const gridToBuilding = gridImporting && loadKw > inverterToBuilding + threshold
      ? Math.min(gridKw, loadKw - inverterToBuilding)
      : 0;
    
    if (gridToBuilding > threshold) {
      flows.push({
        from: "gridMeter",
        to: "building",
        powerKw: gridToBuilding,
        color: componentColors.building,
      });
    }

    return flows;
  }, [solarKw, batteryKw, gridKw, loadKw]);

  // Component box dimensions and positions
  const boxWidth = 140;
  const boxHeight = 100;

  // Layout with grid meter in the middle
  const positions = {
    building: { x: 400, y: 50 },
    grid: { x: 100, y: 200 },
    gridMeter: { x: 300, y: 200 },
    inverter: { x: 500, y: 200 },
    solar: { x: 400, y: 350 },
    battery: { x: 600, y: 350 },
  };

  // Define all possible static interconnections with right-angled paths
  type Side = "top" | "bottom" | "left" | "right";
  const staticConnections: Array<{
    from: string;
    to: string;
    sideFrom: Side;
    sideTo: Side;
  }> = [
    { from: "solar", to: "inverter", sideFrom: "top", sideTo: "bottom" },
    { from: "inverter", to: "battery", sideFrom: "bottom", sideTo: "top" },
    { from: "battery", to: "inverter", sideFrom: "top", sideTo: "bottom" },
    { from: "inverter", to: "building", sideFrom: "top", sideTo: "bottom" },
    { from: "inverter", to: "gridMeter", sideFrom: "left", sideTo: "right" },
    { from: "gridMeter", to: "grid", sideFrom: "left", sideTo: "right" },
    { from: "grid", to: "gridMeter", sideFrom: "right", sideTo: "left" },
    { from: "gridMeter", to: "building", sideFrom: "top", sideTo: "left" },
    { from: "gridMeter", to: "battery", sideFrom: "bottom", sideTo: "left" },
  ];

  // Calculate connection points
  const getConnectionPoint = (node: string, side: Side) => {
    const pos = positions[node as keyof typeof positions];
    const halfW = boxWidth / 2;
    const halfH = boxHeight / 2;
    
    switch (side) {
      case "top":
        return { x: pos.x, y: pos.y - halfH };
      case "bottom":
        return { x: pos.x, y: pos.y + halfH };
      case "left":
        return { x: pos.x - halfW, y: pos.y };
      case "right":
        return { x: pos.x + halfW, y: pos.y };
      default:
        return pos;
    }
  };

  // Create right-angled path
  const createRightAnglePath = (from: { x: number; y: number }, to: { x: number; y: number }, fromSide: Side): string => {
    // Determine intermediate point for right angle
    let midX = from.x;
    let midY = from.y;

    // Horizontal then vertical
    if (fromSide === "left" || fromSide === "right") {
      midX = (from.x + to.x) / 2;
      midY = from.y;
    } else {
      midX = from.x;
      midY = (from.y + to.y) / 2;
    }

    return `M ${from.x} ${from.y} L ${midX} ${midY} L ${to.x} ${to.y}`;
  };

  // Get color for component
  const getComponentColor = (component: string): string => {
    return componentColors[component as keyof typeof componentColors] || componentColors.inverter;
  };

  return (
    <div className="bg-slate-800/60 rounded-lg p-6 overflow-x-auto">
      <div className="text-xs uppercase text-slate-400 mb-4">Energy Flow</div>
      <div className="relative" style={{ width: "700px", height: "450px", margin: "0 auto" }}>
        <svg width="700" height="450" className="absolute inset-0">
          {/* Static interconnection lines (always visible, right-angled) */}
          {staticConnections.map((conn, idx) => {
            const fromPoint = getConnectionPoint(conn.from, conn.sideFrom);
            const toPoint = getConnectionPoint(conn.to, conn.sideTo);
            const path = createRightAnglePath(fromPoint, toPoint, conn.sideFrom);
            
            // Check if there's an active flow on this connection
            const hasActiveFlow = flows.some(
              f => f.from === conn.from && f.to === conn.to
            );
            
            return (
              <path
                key={`static-${conn.from}-${conn.to}-${idx}`}
                d={path}
                fill="none"
                stroke={hasActiveFlow ? "transparent" : "rgba(148, 163, 184, 0.3)"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          
          {/* Active energy flow lines (right-angled) */}
          {flows.map((flow, idx) => {
            let fromPoint, toPoint, fromSide: Side;
            
            // Determine connection points based on flow direction
            if (flow.from === "solar" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("solar", "top");
              toPoint = getConnectionPoint("inverter", "bottom");
              fromSide = "top";
            } else if (flow.from === "inverter" && flow.to === "battery") {
              fromPoint = getConnectionPoint("inverter", "bottom");
              toPoint = getConnectionPoint("battery", "top");
              fromSide = "bottom";
            } else if (flow.from === "battery" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("battery", "top");
              toPoint = getConnectionPoint("inverter", "bottom");
              fromSide = "top";
            } else if (flow.from === "inverter" && flow.to === "building") {
              fromPoint = getConnectionPoint("inverter", "top");
              toPoint = getConnectionPoint("building", "bottom");
              fromSide = "top";
            } else if (flow.from === "inverter" && flow.to === "gridMeter") {
              fromPoint = getConnectionPoint("inverter", "left");
              toPoint = getConnectionPoint("gridMeter", "right");
              fromSide = "left";
            } else if (flow.from === "gridMeter" && flow.to === "grid") {
              fromPoint = getConnectionPoint("gridMeter", "left");
              toPoint = getConnectionPoint("grid", "right");
              fromSide = "left";
            } else if (flow.from === "grid" && flow.to === "gridMeter") {
              fromPoint = getConnectionPoint("grid", "right");
              toPoint = getConnectionPoint("gridMeter", "left");
              fromSide = "right";
            } else if (flow.from === "gridMeter" && flow.to === "building") {
              fromPoint = getConnectionPoint("gridMeter", "top");
              toPoint = getConnectionPoint("building", "left");
              fromSide = "top";
            } else if (flow.from === "gridMeter" && flow.to === "battery") {
              fromPoint = getConnectionPoint("gridMeter", "bottom");
              toPoint = getConnectionPoint("battery", "left");
              fromSide = "bottom";
            } else {
              return null;
            }

            const path = createRightAnglePath(fromPoint, toPoint, fromSide);
            // Use color of the "to" component
            const flowColor = getComponentColor(flow.to);

            return (
              <g key={`${flow.from}-${flow.to}-${idx}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={flowColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="1"
                  style={{
                    filter: `drop-shadow(0 0 2px ${flowColor})`,
                  }}
                />
                {/* Animated circle moving along the path */}
                <circle
                  r="4"
                  fill={flowColor}
                  style={{
                    filter: `drop-shadow(0 0 4px ${flowColor})`,
                  }}
                >
                  <animateMotion
                    dur="2s"
                    repeatCount="indefinite"
                    path={path}
                  />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Component boxes */}
        {/* Building */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-4 border-2 border-slate-600 flex flex-col items-center justify-center"
          style={{
            left: positions.building.x - boxWidth / 2,
            top: positions.building.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="text-3xl mb-1">🏢</div>
          <div className="text-xs font-semibold text-slate-300 mb-1">Building Load</div>
          <div className="text-sm font-mono text-slate-300">{loadKw.toFixed(1)} kW</div>
        </div>

        {/* Grid */}
        <div
          className="absolute bg-blue-900/40 rounded-lg p-3 border-2 border-blue-500/50 flex flex-col items-center justify-center"
          style={{
            left: positions.grid.x - boxWidth / 2,
            top: positions.grid.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="text-2xl mb-1">⚡</div>
          <div className="text-lg font-semibold text-blue-300 mb-1">GRID</div>
          <div className={`text-sm font-mono ${gridKw >= 0 ? "text-blue-300" : "text-emerald-300"}`}>
            {gridKw >= 0 ? "+" : ""}{gridKw.toFixed(1)} kW
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {gridKw >= 0 ? "Importing" : "Exporting"}
          </div>
        </div>

        {/* Grid Meter */}
        <div
          className="absolute bg-red-900/40 rounded-lg p-3 border-2 border-red-500/50 flex flex-col items-center justify-center"
          style={{
            left: positions.gridMeter.x - boxWidth / 2,
            top: positions.gridMeter.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="text-2xl mb-1">📊</div>
          <div className="text-lg font-semibold text-red-300 mb-1">GRID METER</div>
          <div className={`text-sm font-mono ${gridKw >= 0 ? "text-red-300" : "text-red-300"}`}>
            {Math.abs(gridKw).toFixed(1)} kW
          </div>
        </div>

        {/* Inverter */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-3 border-2 border-slate-500 flex flex-col items-center justify-center"
          style={{
            left: positions.inverter.x - boxWidth / 2,
            top: positions.inverter.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="text-2xl mb-1">🔄</div>
          <div className="text-lg font-semibold text-slate-300 mb-1">INVERTER</div>
          <div className="text-xs text-slate-400">DC ↔ AC</div>
        </div>

        {/* Solar */}
        <div
          className="absolute bg-amber-900/40 rounded-lg p-3 border-2 border-amber-500/50 flex flex-col items-center justify-center"
          style={{
            left: positions.solar.x - boxWidth / 2,
            top: positions.solar.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="text-2xl mb-1">☀️</div>
          <div className="text-lg font-semibold text-amber-300 mb-1">SOLAR</div>
          <div className="text-sm font-mono text-amber-300">{solarKw.toFixed(1)} kW</div>
        </div>

        {/* Battery */}
        <div
          className="absolute bg-emerald-900/40 rounded-lg p-3 border-2 border-emerald-500/50 flex flex-col items-center justify-center"
          style={{
            left: positions.battery.x - boxWidth / 2,
            top: positions.battery.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="text-2xl mb-1">🔋</div>
          <div className="text-lg font-semibold text-emerald-300 mb-1">BATTERY</div>
          <div className="text-sm font-mono text-emerald-300">
            {batteryKw >= 0 ? "+" : ""}{batteryKw.toFixed(1)} kW
          </div>
          <div className="text-xs text-slate-400 mt-1">{soc.toFixed(0)}% SOC</div>
          <div className="text-xs text-slate-400">
            {batteryKw >= 0 ? "Discharging" : "Charging"}
          </div>
        </div>
      </div>
    </div>
  );
}

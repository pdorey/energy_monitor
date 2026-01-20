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
  source?: string; // Track energy source: "solar", "battery", "grid"
}

// Flow colors based on energy source
const flowColors = {
  solar: "rgb(251, 191, 36)", // Yellow/Orange - solar energy
  battery: "rgb(34, 197, 94)", // Green - battery energy
  grid: "rgb(239, 68, 68)", // Red - grid energy
  inactive: "rgba(148, 163, 184, 0.3)", // Gray - inactive
};

export function EnergyFlowDiagram({ snapshot, overview }: EnergyFlowDiagramProps) {
  // Calculate power values in kW
  const solarKw = snapshot?.solar.power_w ? snapshot.solar.power_w / 1000 : overview?.solar_kw ?? 0;
  const batteryKw = snapshot?.battery.power_w ? snapshot.battery.power_w / 1000 : overview?.battery_kw ?? 0;
  const gridKw = snapshot?.grid.power_w ? snapshot.grid.power_w / 1000 : overview?.grid_kw ?? 0;
  const loadKw = snapshot?.load.power_w ? snapshot.load.power_w / 1000 : overview?.load_kw ?? 0;
  const soc = snapshot?.battery.soc_percent ?? overview?.battery_soc_percent ?? 0;

  // Calculate energy flows with proper source tracking
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

    // Calculate how solar is distributed
    let solarRemaining = solarKw;
    
    // 1. Solar to Inverter (always when generating)
    if (solarKw > threshold) {
      flows.push({
        from: "solar",
        to: "inverter",
        powerKw: solarKw,
        color: flowColors.solar,
        source: "solar",
      });
    }

    // 2. Battery charging from inverter (solar)
    if (batteryCharging && solarKw > threshold) {
      const solarForBattery = Math.min(solarKw, batteryChargePower);
      flows.push({
        from: "inverter",
        to: "battery",
        powerKw: solarForBattery,
        color: flowColors.solar, // Yellow (from solar)
        source: "solar",
      });
      solarRemaining -= solarForBattery;
    }

    // 3. Battery discharging to inverter
    if (batteryDischarging) {
      flows.push({
        from: "battery",
        to: "inverter",
        powerKw: batteryKw,
        color: flowColors.battery, // Green (from battery)
        source: "battery",
      });
    }

    // 4. Inverter to Building (from solar or battery)
    const solarToBuilding = Math.max(0, Math.min(solarRemaining, loadKw));
    const batteryToBuilding = batteryDischarging ? Math.min(batteryKw, loadKw - solarToBuilding) : 0;
    const inverterToBuilding = solarToBuilding + batteryToBuilding;
    
    if (inverterToBuilding > threshold) {
      // Determine color based on source
      let buildingColor = flowColors.solar; // Default to solar
      if (batteryToBuilding > solarToBuilding) {
        buildingColor = flowColors.battery; // More from battery
      } else if (solarToBuilding > 0) {
        buildingColor = flowColors.solar; // From solar
      }
      
      flows.push({
        from: "inverter",
        to: "building",
        powerKw: inverterToBuilding,
        color: buildingColor,
        source: batteryToBuilding > solarToBuilding ? "battery" : "solar",
      });
    }

    // 5. Inverter to Grid Meter (export - from solar or battery)
    const solarExcess = Math.max(0, solarRemaining - solarToBuilding);
    const batteryExport = batteryDischarging ? Math.max(0, batteryKw - batteryToBuilding) : 0;
    const inverterToGrid = solarExcess + batteryExport;
    
    if (inverterToGrid > threshold) {
      // Color based on source: Yellow if from solar, Green if from battery
      const exportColor = solarExcess > batteryExport ? flowColors.solar : flowColors.battery;
      flows.push({
        from: "inverter",
        to: "gridMeter",
        powerKw: inverterToGrid,
        color: exportColor,
        source: solarExcess > batteryExport ? "solar" : "battery",
      });
    }

    // 6. Grid Meter to Grid (exporting)
    if (gridExporting) {
      flows.push({
        from: "gridMeter",
        to: "grid",
        powerKw: Math.abs(gridKw),
        color: flowColors.grid, // Red (exporting)
        source: "grid",
      });
    }

    // 7. Grid to Grid Meter (importing)
    if (gridImporting) {
      flows.push({
        from: "grid",
        to: "gridMeter",
        powerKw: gridKw,
        color: flowColors.grid, // Red (from grid)
        source: "grid",
      });
    }

    // 8. Grid Meter to Inverter (when importing)
    if (gridImporting) {
      // Grid supplies what building needs beyond what inverter can provide
      const gridMeterToInverter = Math.max(0, loadKw - inverterToBuilding);
      if (gridMeterToInverter > threshold) {
        flows.push({
          from: "gridMeter",
          to: "inverter",
          powerKw: gridMeterToInverter,
          color: flowColors.grid, // Red (from grid)
          source: "grid",
        });
      }
    }

    // 9. Grid Meter to Building (direct from grid when importing)
    if (gridImporting) {
      const gridToBuilding = Math.max(0, gridKw - (loadKw - inverterToBuilding));
      if (gridToBuilding > threshold) {
        flows.push({
          from: "gridMeter",
          to: "building",
          powerKw: gridToBuilding,
          color: flowColors.grid, // Red (from grid)
          source: "grid",
        });
      }
    }

    return flows;
  }, [solarKw, batteryKw, gridKw, loadKw]);

  // Component box dimensions and positions
  const boxWidth = 140;
  const boxHeight = 100;

  // Layout matching PowerPoint diagram
  const positions = {
    building: { x: 400, y: 50 },
    grid: { x: 100, y: 200 },
    gridMeter: { x: 300, y: 200 },
    inverter: { x: 500, y: 200 },
    solar: { x: 400, y: 350 },
    battery: { x: 600, y: 350 },
  };

  // Define ALL possible interconnections (always visible)
  // Connection rules:
  // 1. Grid ↔ Grid Meter
  // 2. Grid Meter ↔ Inverter
  // 3. Solar → Inverter
  // 4. Battery ↔ Inverter
  // 5. Building ↔ Inverter
  // 6. Building ↔ Grid Meter
  type Side = "top" | "bottom" | "left" | "right";
  const staticConnections: Array<{
    from: string;
    to: string;
    sideFrom: Side;
    sideTo: Side;
  }> = [
    // Grid ↔ Grid Meter
    { from: "grid", to: "gridMeter", sideFrom: "right", sideTo: "left" },
    { from: "gridMeter", to: "grid", sideFrom: "left", sideTo: "right" },
    
    // Grid Meter ↔ Inverter
    { from: "gridMeter", to: "inverter", sideFrom: "right", sideTo: "left" },
    { from: "inverter", to: "gridMeter", sideFrom: "left", sideTo: "right" },
    
    // Solar → Inverter
    { from: "solar", to: "inverter", sideFrom: "top", sideTo: "bottom" },
    
    // Battery ↔ Inverter
    { from: "battery", to: "inverter", sideFrom: "left", sideTo: "right" },
    { from: "inverter", to: "battery", sideFrom: "right", sideTo: "left" },
    
    // Building ↔ Inverter
    { from: "building", to: "inverter", sideFrom: "bottom", sideTo: "top" },
    { from: "inverter", to: "building", sideFrom: "top", sideTo: "bottom" },
    
    // Building ↔ Grid Meter
    { from: "building", to: "gridMeter", sideFrom: "bottom", sideTo: "top" },
    { from: "gridMeter", to: "building", sideFrom: "top", sideTo: "bottom" },
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

  // Create right-angled path (always right-angled)
  const createRightAnglePath = (from: { x: number; y: number }, to: { x: number; y: number }, fromSide: Side, toSide: Side): string => {
    // Determine intermediate point for right angle
    let midX = from.x;
    let midY = from.y;

    // Strategy: go horizontal first if from left/right, vertical first if from top/bottom
    if (fromSide === "left" || fromSide === "right") {
      // Horizontal first, then vertical
      midX = to.x;
      midY = from.y;
    } else if (fromSide === "top" || fromSide === "bottom") {
      // Vertical first, then horizontal
      if (toSide === "left" || toSide === "right") {
        midX = from.x;
        midY = to.y;
      } else {
        // Both vertical, use midpoint
        midX = from.x;
        midY = (from.y + to.y) / 2;
      }
    }

    return `M ${from.x} ${from.y} L ${midX} ${midY} L ${to.x} ${to.y}`;
  };

  return (
    <div className="bg-slate-800/60 rounded-lg p-6 overflow-x-auto">
      <div className="text-xs uppercase text-slate-400 mb-4">Energy Flow</div>
      <div className="relative" style={{ width: "700px", height: "450px", margin: "0 auto" }}>
        <svg width="700" height="450" className="absolute inset-0">
          {/* All static interconnection lines (always visible, gray when inactive) */}
          {staticConnections.map((conn, idx) => {
            const fromPoint = getConnectionPoint(conn.from, conn.sideFrom);
            const toPoint = getConnectionPoint(conn.to, conn.sideTo);
            const path = createRightAnglePath(fromPoint, toPoint, conn.sideFrom, conn.sideTo);
            
            // Check if there's an active flow on this connection
            const activeFlow = flows.find(
              f => f.from === conn.from && f.to === conn.to
            );
            
            return (
              <path
                key={`static-${conn.from}-${conn.to}-${idx}`}
                d={path}
                fill="none"
                stroke={activeFlow ? "transparent" : flowColors.inactive}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          
          {/* Active energy flow lines (colored based on source) */}
          {flows.map((flow, idx) => {
            let fromPoint, toPoint, fromSide: Side, toSide: Side;
            
            // Determine connection points based on flow direction
            if (flow.from === "solar" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("solar", "top");
              toPoint = getConnectionPoint("inverter", "bottom");
              fromSide = "top";
              toSide = "bottom";
            } else if (flow.from === "inverter" && flow.to === "battery") {
              fromPoint = getConnectionPoint("inverter", "right");
              toPoint = getConnectionPoint("battery", "left");
              fromSide = "right";
              toSide = "left";
            } else if (flow.from === "battery" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("battery", "left");
              toPoint = getConnectionPoint("inverter", "right");
              fromSide = "left";
              toSide = "right";
            } else if (flow.from === "inverter" && flow.to === "building") {
              fromPoint = getConnectionPoint("inverter", "top");
              toPoint = getConnectionPoint("building", "bottom");
              fromSide = "top";
              toSide = "bottom";
            } else if (flow.from === "building" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("building", "bottom");
              toPoint = getConnectionPoint("inverter", "top");
              fromSide = "bottom";
              toSide = "top";
            } else if (flow.from === "inverter" && flow.to === "gridMeter") {
              fromPoint = getConnectionPoint("inverter", "left");
              toPoint = getConnectionPoint("gridMeter", "right");
              fromSide = "left";
              toSide = "right";
            } else if (flow.from === "gridMeter" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("gridMeter", "right");
              toPoint = getConnectionPoint("inverter", "left");
              fromSide = "right";
              toSide = "left";
            } else if (flow.from === "gridMeter" && flow.to === "grid") {
              fromPoint = getConnectionPoint("gridMeter", "left");
              toPoint = getConnectionPoint("grid", "right");
              fromSide = "left";
              toSide = "right";
            } else if (flow.from === "grid" && flow.to === "gridMeter") {
              fromPoint = getConnectionPoint("grid", "right");
              toPoint = getConnectionPoint("gridMeter", "left");
              fromSide = "right";
              toSide = "left";
            } else if (flow.from === "gridMeter" && flow.to === "building") {
              fromPoint = getConnectionPoint("gridMeter", "top");
              toPoint = getConnectionPoint("building", "bottom");
              fromSide = "top";
              toSide = "bottom";
            } else if (flow.from === "building" && flow.to === "gridMeter") {
              fromPoint = getConnectionPoint("building", "bottom");
              toPoint = getConnectionPoint("gridMeter", "top");
              fromSide = "bottom";
              toSide = "top";
            } else {
              return null;
            }

            const path = createRightAnglePath(fromPoint, toPoint, fromSide, toSide);
            // Color represents the source of energy
            const flowColor = flow.color;

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

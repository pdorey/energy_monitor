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

export function EnergyFlowDiagram({ snapshot, overview }: EnergyFlowDiagramProps) {
  // Calculate power values in kW
  const solarKw = snapshot?.solar.power_w ? snapshot.solar.power_w / 1000 : overview?.solar_kw ?? 0;
  const batteryKw = snapshot?.battery.power_w ? snapshot.battery.power_w / 1000 : overview?.battery_kw ?? 0;
  const gridKw = snapshot?.grid.power_w ? snapshot.grid.power_w / 1000 : overview?.grid_kw ?? 0;
  const loadKw = snapshot?.load.power_w ? snapshot.load.power_w / 1000 : overview?.load_kw ?? 0;
  const soc = snapshot?.battery.soc_percent ?? overview?.battery_soc_percent ?? 0;

  // Calculate energy flows based on power values
  // Battery: negative = charging, positive = discharging
  // Grid: positive = importing, negative = exporting
  const flows = useMemo<EnergyFlow[]>(() => {
    const flows: EnergyFlow[] = [];
    const threshold = 0.1; // Minimum power to show flow
    
    // 1. Solar always flows to Inverter (when generating)
    if (solarKw > threshold) {
      flows.push({
        from: "solar",
        to: "inverter",
        powerKw: solarKw,
        color: "rgb(251, 191, 36)", // amber-400
      });
    }

    // 2. Battery flows
    const batteryCharging = batteryKw < -threshold;
    const batteryDischarging = batteryKw > threshold;
    const batteryChargePower = Math.abs(batteryKw);

    if (batteryCharging) {
      // Battery charging: determine source (solar via inverter or grid)
      // Priority: solar first, then grid
      let solarForBattery = 0;
      let gridForBattery = 0;
      
      if (solarKw > threshold) {
        solarForBattery = Math.min(solarKw, batteryChargePower);
        flows.push({
          from: "inverter",
          to: "battery",
          powerKw: solarForBattery,
          color: "rgb(34, 197, 94)", // emerald-500
        });
      }
      
      if (batteryChargePower > solarKw && gridKw > threshold) {
        gridForBattery = Math.min(gridKw, batteryChargePower - solarKw);
        flows.push({
          from: "grid",
          to: "battery",
          powerKw: gridForBattery,
          color: "rgb(59, 130, 246)", // blue-500
        });
      }
    } else if (batteryDischarging) {
      // Battery discharging: flows to inverter, then to load or grid
      flows.push({
        from: "battery",
        to: "inverter",
        powerKw: batteryKw,
        color: "rgb(34, 197, 94)", // emerald-500
      });
    }

    // 3. Inverter to Load (from solar or battery)
    const solarToLoad = Math.max(0, Math.min(solarKw - (batteryCharging ? Math.min(solarKw, batteryChargePower) : 0), loadKw));
    const batteryToLoad = batteryDischarging ? Math.min(batteryKw, loadKw - solarToLoad) : 0;
    const inverterToLoad = solarToLoad + batteryToLoad;
    
    if (inverterToLoad > threshold) {
      flows.push({
        from: "inverter",
        to: "load",
        powerKw: inverterToLoad,
        color: solarToLoad > batteryToLoad ? "rgb(251, 191, 36)" : "rgb(34, 197, 94)",
      });
    }

    // 4. Inverter to Grid (excess solar or battery export)
    const solarExcess = Math.max(0, solarKw - (batteryCharging ? Math.min(solarKw, batteryChargePower) : 0) - solarToLoad);
    const batteryExport = batteryDischarging ? Math.max(0, batteryKw - batteryToLoad) : 0;
    const inverterToGrid = solarExcess + batteryExport;
    
    if (inverterToGrid > threshold) {
      flows.push({
        from: "inverter",
        to: "grid",
        powerKw: inverterToGrid,
        color: "rgb(34, 197, 94)", // emerald-500
      });
    }

    // 5. Grid to Load (when grid is importing and load needs more)
    const gridToLoad = gridKw > threshold && loadKw > inverterToLoad + threshold
      ? Math.min(gridKw, loadKw - inverterToLoad)
      : 0;
    
    if (gridToLoad > threshold) {
      flows.push({
        from: "grid",
        to: "load",
        powerKw: gridToLoad,
        color: "rgb(59, 130, 246)", // blue-500
      });
    }

    return flows;
  }, [solarKw, batteryKw, gridKw, loadKw]);

  // Component box dimensions and positions
  const boxWidth = 140;
  const boxHeight = 100;
  //const spacing = 180;

  // Tree layout positions (centered)
  const positions = {
    building: { x: 400, y: 50 },
    grid: { x: 200, y: 200 },
    inverter: { x: 400, y: 200 },
    load: { x: 600, y: 200 },
    solar: { x: 300, y: 350 },
    battery: { x: 500, y: 350 },
  };

  // Calculate connection points
  const getConnectionPoint = (node: string, side: "top" | "bottom" | "left" | "right") => {
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

  return (
    <div className="bg-slate-800/60 rounded-lg p-6 overflow-x-auto">
      <div className="text-xs uppercase text-slate-400 mb-4">Energy Flow</div>
      <div className="relative" style={{ width: "800px", height: "450px", margin: "0 auto" }}>
        <svg width="800" height="450" className="absolute inset-0">
          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="currentColor" />
            </marker>
          </defs>
          
          {/* Animated energy flow lines */}
          {flows.map((flow, idx) => {
            let fromPoint, toPoint;
            
            // Determine connection points based on flow direction
            if (flow.from === "solar" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("solar", "top");
              toPoint = getConnectionPoint("inverter", "bottom");
            } else if (flow.from === "inverter" && flow.to === "battery") {
              fromPoint = getConnectionPoint("inverter", "bottom");
              toPoint = getConnectionPoint("battery", "top");
            } else if (flow.from === "battery" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("battery", "top");
              toPoint = getConnectionPoint("inverter", "bottom");
            } else if (flow.from === "inverter" && flow.to === "load") {
              fromPoint = getConnectionPoint("inverter", "right");
              toPoint = getConnectionPoint("load", "left");
            } else if (flow.from === "inverter" && flow.to === "grid") {
              fromPoint = getConnectionPoint("inverter", "left");
              toPoint = getConnectionPoint("grid", "right");
            } else if (flow.from === "grid" && flow.to === "battery") {
              fromPoint = getConnectionPoint("grid", "bottom");
              toPoint = getConnectionPoint("battery", "left");
            } else if (flow.from === "grid" && flow.to === "load") {
              fromPoint = getConnectionPoint("grid", "right");
              toPoint = getConnectionPoint("load", "left");
            } else {
              return null;
            }

            // Calculate stroke width based on power (min 2, max 8)
            const strokeWidth = Math.max(2, Math.min(8, flow.powerKw / 2));

            return (
              <g key={`${flow.from}-${flow.to}-${idx}`}>
                <defs>
                  <linearGradient id={`gradient-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={flow.color} stopOpacity="0.3" />
                    <stop offset="50%" stopColor={flow.color} stopOpacity="1" />
                    <stop offset="100%" stopColor={flow.color} stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                <line
                  x1={fromPoint.x}
                  y1={fromPoint.y}
                  x2={toPoint.x}
                  y2={toPoint.y}
                  stroke={`url(#gradient-${idx})`}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  markerEnd="url(#arrowhead)"
                  className="animate-pulse"
                  style={{
                    filter: `drop-shadow(0 0 4px ${flow.color})`,
                  }}
                />
                {/* Animated dot moving along the line */}
                <circle
                  r="4"
                  fill={flow.color}
                  style={{
                    filter: `drop-shadow(0 0 6px ${flow.color})`,
                  }}
                >
                  <animateMotion
                    dur="2s"
                    repeatCount="indefinite"
                    path={`M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`}
                  />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Component boxes */}
        {/* Building (root) */}
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
          <div className="text-xs font-semibold text-slate-300">Building</div>
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
          <div className="text-lg font-semibold text-blue-300 mb-1">GRID</div>
          <div className={`text-sm font-mono ${gridKw >= 0 ? "text-blue-300" : "text-emerald-300"}`}>
            {gridKw >= 0 ? "+" : ""}{gridKw.toFixed(1)} kW
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {gridKw >= 0 ? "Importing" : "Exporting"}
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
          <div className="text-lg font-semibold text-slate-300 mb-1">INVERTER</div>
          <div className="text-xs text-slate-400">DC ↔ AC</div>
        </div>

        {/* Load */}
        <div
          className="absolute bg-orange-900/40 rounded-lg p-3 border-2 border-orange-500/50 flex flex-col items-center justify-center"
          style={{
            left: positions.load.x - boxWidth / 2,
            top: positions.load.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="text-lg font-semibold text-orange-300 mb-1">LOAD</div>
          <div className="text-sm font-mono text-orange-300">{loadKw.toFixed(1)} kW</div>
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

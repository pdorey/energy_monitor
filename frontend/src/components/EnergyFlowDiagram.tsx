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
  spotPrice?: number;
  exportPrice?: number;
  tariff?: string;
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

// Path definitions from Excel table N3:R9
// Each path defines which connection should be active and what color
// interface PathDefinition {
//   pathId: string;
//   from: string;
//   to: string;
//   color: string;
// }

// Define paths based on Excel table structure
// This will be populated from the Excel data
//const pathDefinitions: PathDefinition[] = [
  // These will be defined based on Excel table N3:R9
  // Example structure:
  //{ pathId: "PATH 1", from: "grid", to: "inverter", color: flowColors.solar },
  // { pathId: "PATH 2", from: "inverter", to: "battery", color: flowColors.solar },
  // etc.
//];

export function EnergyFlowDiagram({ snapshot, overview, activePaths = [], pathDefinitions = [], labels, displayTime, buildingConsumption, solarProduction, spotPrice, exportPrice, tariff }: EnergyFlowDiagramProps) {
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
  const boxInfoWidth = 170;
  const boxInfoHeight = 80;

  // Layout: Diagram moved to the left, new boxes on the right
  // Building directly above inverter, Solar directly below inverter
  // Grid below Grid Meter
  // Spacing: Grid Meter to Inverter = Inverter to Battery
  const gridMeterX = 100;  // Moved left
  const inverterX = 300;   // Moved left
  const batteryX = inverterX + (inverterX - gridMeterX); // Equal spacing: 400 + (400-200) = 600
  const rightBoxesX = 800; // Position for new boxes on the right
  
  const positions = {
    building: { x: 400, y: 50 },      // Directly above inverter
    grid: { x: 200, y: 350 },         // Below gridMeter
    gridMeter: { x: gridMeterX, y: 200 },
    inverter: { x: inverterX, y: 200 },  // Center
    solar: { x: 400, y: 350 },        // Directly below inverter
    battery: { x: batteryX, y: 200 },  // Equal spacing from inverter
    // New boxes on the right
    dailyConsumption: { x: rightBoxesX, y: 100 },
    dailySolar: { x: rightBoxesX, y: 220 },
    marketPrices: { x: rightBoxesX, y: 340 },
  };

  // Define ALL possible interconnections (always visible)
  // Exact layout per PowerPoint:
  // 1. Grid ↔ Grid Meter: 2 horizontal lines
  // 2. Grid Meter ↔ Inverter: 2 horizontal lines  
  // 3. Inverter ↔ Battery: 3 horizontal lines
  // 4. Solar ↔ Inverter: 1 vertical line (center to center)
  // 5. Inverter ↔ Building: 2 vertical lines (with 40%/60% offsets)
  // 6. Grid Meter ↔ Building: 1 right-angle line (top of grid meter to left of building)
  type Side = "top" | "bottom" | "left" | "right";
  // Offset is interpreted along the relevant dimension:
  // - For vertical sides (top/bottom): left/right mean 40%/60% of width, center = 50%
  // - For horizontal sides (left/right): left/right mean 40%/60% of height, center = 50%
  type Offset = "left" | "right" | "center";
  const staticConnections: Array<{
    from: string;
    to: string;
    sideFrom: Side;
    sideTo: Side;
    offsetFrom?: Offset;
    offsetTo?: Offset;
    isRightAngle?: boolean; // For special right-angle paths
  }> = [
    // Grid ↔ Grid Meter:
    // Lines go from top of grid box to bottom of gridmeter box (vertical)
    // 1) grid -> gridMeter (grid_pwr): 40% from left of both boxes
    { from: "grid", to: "gridMeter", sideFrom: "top", sideTo: "bottom", offsetFrom: "left", offsetTo: "left" },
    // 2) gridMeter -> grid (solar_pwr): 60% from left of both boxes
    { from: "gridMeter", to: "grid", sideFrom: "bottom", sideTo: "top", offsetFrom: "right", offsetTo: "right" },
    
    // Grid Meter ↔ Inverter: 2 possible connections – depart from 40% and 60% of height
    { from: "gridMeter", to: "inverter", sideFrom: "right", sideTo: "left", offsetFrom: "left", offsetTo: "left" },
    { from: "inverter", to: "gridMeter", sideFrom: "left", sideTo: "right", offsetFrom: "right", offsetTo: "right" },
    
    // Inverter ↔ Battery:
    // Top line (30% from top): battery_pwr source
    { from: "battery", to: "inverter", sideFrom: "left", sideTo: "right", offsetFrom: "left", offsetTo: "left" },
    { from: "inverter", to: "battery", sideFrom: "right", sideTo: "left", offsetFrom: "left", offsetTo: "left" },
    // Middle line (50% from top): grid_pwr source
    { from: "inverter", to: "battery", sideFrom: "right", sideTo: "left", offsetFrom: "center", offsetTo: "center" },
    { from: "battery", to: "inverter", sideFrom: "left", sideTo: "right", offsetFrom: "center", offsetTo: "center" },
    // Bottom line (70% from top): solar_pwr source
    { from: "inverter", to: "battery", sideFrom: "right", sideTo: "left", offsetFrom: "right", offsetTo: "right" },
    { from: "battery", to: "inverter", sideFrom: "left", sideTo: "right", offsetFrom: "right", offsetTo: "right" },
    
    // Solar ↔ Inverter: 1 vertical line (center to center)
    { from: "solar", to: "inverter", sideFrom: "top", sideTo: "bottom", offsetFrom: "center", offsetTo: "center" },
    
    // Inverter ↔ Building:
    // 1) inverter -> building (solar_pwr): 40% from left of inverter box to 40% from left of building box
    { from: "inverter", to: "building", sideFrom: "top", sideTo: "bottom", offsetFrom: "left", offsetTo: "left" },
    // 2) inverter -> building (battery_pwr): 60% from left of inverter box to 60% from left of building box
    { from: "inverter", to: "building", sideFrom: "top", sideTo: "bottom", offsetFrom: "right", offsetTo: "right" },
    // Reverse direction uses same physical paths (for completeness)
    { from: "building", to: "inverter", sideFrom: "bottom", sideTo: "top", offsetFrom: "left", offsetTo: "left" },
    { from: "building", to: "inverter", sideFrom: "bottom", sideTo: "top", offsetFrom: "right", offsetTo: "right" },
    
    // Grid Meter ↔ Building: 1 right-angle line (top of grid meter to left of building)
    { from: "gridMeter", to: "building", sideFrom: "top", sideTo: "left", offsetFrom: "center", offsetTo: "center", isRightAngle: true },
  ];

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
      // Go straight up from grid meter top, then horizontal to building left
      const midY = from.y - 100; // Go up 100px first
      const midX = to.x; // Then horizontal to building's X
      return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${midX} ${midY} L ${to.x} ${to.y}`;
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
    <div className="bg-slate-800/60 rounded-lg p-6 overflow-x-auto">
      <div className="flex items-center mb-4">
        <div className="text-base font-semibold uppercase text-slate-300">Energy Flow</div>
        {/* Animated time display in top right */}
        {currentTime && (
          <div className="ml-auto text-base font-semibold text-slate-300 font-mono">
            {currentTime}
          </div>
        )}
      </div>
      <div className="relative" style={{ width: "1000px", height: "450px", margin: "0 auto" }}>
        <svg width="1000" height="450" className="absolute inset-0">
          {/* All static interconnection lines (always visible, gray when inactive) */}
          {staticConnections.map((conn, idx) => {
            const fromPoint = getConnectionPoint(conn.from, conn.sideFrom, conn.offsetFrom, conn.to);
            const toPoint = getConnectionPoint(conn.to, conn.sideTo, conn.offsetTo, conn.from);
            const path = createRightAnglePath(fromPoint, toPoint, conn.sideFrom, conn.sideTo, conn.isRightAngle);
            
            // All static lines are always visible (gray when inactive)
            // Active lines are drawn on top with color and animation
            return (
              <path
                key={`static-${conn.from}-${conn.to}-${idx}`}
                d={path}
                fill="none"
                stroke={flowColors.inactive}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          
          {/* Active energy flow lines (colored based on Excel path definitions) */}
          {(() => {
            // If we have path definitions from Excel, use those instead of calculated flows
            if (activePaths.length > 0 && pathDefinitions.length > 0) {
              return activePaths.flatMap(pathId => {
                const pathDefs = pathDefinitions.filter(pd => pd.path_id === pathId);
                return pathDefs.map((pathDef, idx) => {
                  // Find the connection for this path
                  // Match based on source to get the correct line for connections with multiple lines
                  let conn = staticConnections.find(c => {
                    const fromMatch = c.from.toLowerCase() === pathDef.from.toLowerCase();
                    const toMatch = c.to.toLowerCase() === pathDef.to.toLowerCase();
                    if (!fromMatch || !toMatch) return false;
                    
                    const source = (pathDef.source || "").toLowerCase();
                    
                    // Special handling for inverter -> building: match based on source
                    if (pathDef.from.toLowerCase() === "inverter" && pathDef.to.toLowerCase() === "building") {
                      if (source.includes("solar")) {
                        // solar_pwr -> left/left (40% to 40%)
                        return c.offsetFrom === "left" && c.offsetTo === "left";
                      } else if (source.includes("battery")) {
                        // battery_pwr -> right/right (60% to 60%)
                        return c.offsetFrom === "right" && c.offsetTo === "right";
                      }
                    }
                    
                    // Special handling for grid <-> gridMeter: match based on source
                    // Lines are vertical (top of grid to bottom of gridMeter)
                    // grid_pwr at 40% from left, solar_pwr at 60% from left
                    if ((pathDef.from.toLowerCase() === "grid" && pathDef.to.toLowerCase() === "gridmeter") ||
                        (pathDef.from.toLowerCase() === "gridmeter" && pathDef.to.toLowerCase() === "grid")) {
                      if (source.includes("grid")) {
                        // grid_pwr -> left/left (40% from left)
                        return c.offsetFrom === "left" && c.offsetTo === "left";
                      } else if (source.includes("solar")) {
                        // solar_pwr -> right/right (60% from left)
                        return c.offsetFrom === "right" && c.offsetTo === "right";
                      }
                    }
                    
                    // Special handling for inverter <-> battery: match based on source
                    // Top line (30%): battery_pwr, Middle line (50%): grid_pwr, Bottom line (70%): solar_pwr
                    if ((pathDef.from.toLowerCase() === "inverter" && pathDef.to.toLowerCase() === "battery") ||
                        (pathDef.from.toLowerCase() === "battery" && pathDef.to.toLowerCase() === "inverter")) {
                      if (source.includes("battery")) {
                        // battery_pwr -> left/left (30% from top)
                        return c.offsetFrom === "left" && c.offsetTo === "left";
                      } else if (source.includes("grid")) {
                        // grid_pwr -> center/center (50% from top)
                        return c.offsetFrom === "center" && c.offsetTo === "center";
                      } else if (source.includes("solar")) {
                        // solar_pwr -> right/right (70% from top)
                        return c.offsetFrom === "right" && c.offsetTo === "right";
                      }
                    }
                    
                    // For other connections, any matching from/to is fine
                    return true;
                  });
                  
                  if (!conn) return null;
                  
                  const fromPoint = getConnectionPoint(conn.from, conn.sideFrom, conn.offsetFrom, conn.to);
                  const toPoint = getConnectionPoint(conn.to, conn.sideTo, conn.offsetTo, conn.from);
                  const path = createRightAnglePath(fromPoint, toPoint, conn.sideFrom, conn.sideTo, conn.isRightAngle);
                  
                  // Parse color (could be color name, RGB, or hex)
                  // Use lineColor from pathDef, which comes from Paths.csv lineColor column
                  let flowColor = pathDef.color || flowColors.solar;
                  if (flowColor.startsWith('rgb') || flowColor.startsWith('#')) {
                    // Already RGB or hex format
                  } else {
                    const colorLower = flowColor.toLowerCase();
                    if (colorLower === 'yellow' || colorLower === 'orange') {
                      flowColor = flowColors.solar;
                    } else if (colorLower === 'green') {
                      flowColor = flowColors.battery;
                    } else if (colorLower === 'red' || colorLower === 'blue') {
                      // Blue is used for grid in some paths, but should render as red
                      flowColor = flowColors.grid;
                    } else {
                      // Fallback: use source to determine color
                      const source = (pathDef.source || "").toLowerCase();
                      if (source.includes("solar")) {
                        flowColor = flowColors.solar;
                      } else if (source.includes("battery")) {
                        flowColor = flowColors.battery;
                      } else if (source.includes("grid")) {
                        flowColor = flowColors.grid;
                      }
                    }
                  }
                  
                  return (
                    <g key={`path-${pathId}-${idx}`}>
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
                }).filter(Boolean);
              });
            }
            
            // Fallback to calculated flows
            return flows.map((flow, idx) => {
            let fromPoint, toPoint, fromSide: Side, toSide: Side;
            //let offsetFrom: Offset = "center";
            //let offsetTo: Offset = "center";
            
            // Determine connection points based on flow direction
            // Use 40%/60% offsets for vertical connections
            if (flow.from === "solar" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("solar", "top", "center", "inverter");
              toPoint = getConnectionPoint("inverter", "bottom", "center", "solar");
              fromSide = "top";
              toSide = "bottom";
            } else if (flow.from === "inverter" && flow.to === "battery") {
              fromPoint = getConnectionPoint("inverter", "right", "center", "battery");
              toPoint = getConnectionPoint("battery", "left", "center", "inverter");
              fromSide = "right";
              toSide = "left";
            } else if (flow.from === "battery" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("battery", "left", "center", "inverter");
              toPoint = getConnectionPoint("inverter", "right", "center", "battery");
              fromSide = "left";
              toSide = "right";
            } else if (flow.from === "inverter" && flow.to === "building") {
              fromPoint = getConnectionPoint("inverter", "top", "left", "building");
              toPoint = getConnectionPoint("building", "bottom", "right", "inverter");
              fromSide = "top";
              toSide = "bottom";
            } else if (flow.from === "building" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("building", "bottom", "right", "inverter");
              toPoint = getConnectionPoint("inverter", "top", "left", "building");
              fromSide = "bottom";
              toSide = "top";
            } else if (flow.from === "inverter" && flow.to === "gridMeter") {
              fromPoint = getConnectionPoint("inverter", "left", "right", "gridMeter");
              toPoint = getConnectionPoint("gridMeter", "right", "right", "inverter");
              fromSide = "left";
              toSide = "right";
            } else if (flow.from === "gridMeter" && flow.to === "inverter") {
              fromPoint = getConnectionPoint("gridMeter", "right", "left", "inverter");
              toPoint = getConnectionPoint("inverter", "left", "left", "gridMeter");
              fromSide = "right";
              toSide = "left";
            } else if (flow.from === "gridMeter" && flow.to === "grid") {
              fromPoint = getConnectionPoint("gridMeter", "left", "right", "grid");
              toPoint = getConnectionPoint("grid", "right", "right", "gridMeter");
              fromSide = "left";
              toSide = "right";
            } else if (flow.from === "grid" && flow.to === "gridMeter") {
              fromPoint = getConnectionPoint("grid", "right", "left", "gridMeter");
              toPoint = getConnectionPoint("gridMeter", "left", "left", "grid");
              fromSide = "right";
              toSide = "left";
            } else if (flow.from === "gridMeter" && flow.to === "building") {
              fromPoint = getConnectionPoint("gridMeter", "top", "left", "building");
              toPoint = getConnectionPoint("building", "bottom", "right", "gridMeter");
              fromSide = "top";
              toSide = "bottom";
            } else if (flow.from === "building" && flow.to === "gridMeter") {
              fromPoint = getConnectionPoint("building", "bottom", "right", "gridMeter");
              toPoint = getConnectionPoint("gridMeter", "top", "left", "building");
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
          })})()}
        </svg>

        {/* Component boxes */}
        {/* Building */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-3 border-2 border-slate-600 flex flex-col justify-start"
          style={{
            left: positions.building.x - boxWidth / 2,
            top: positions.building.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xl">🏢</div>
            <div className="text-xs font-semibold text-slate-300">BUILDING LOAD</div>
          </div>
          <div className="text-sm font-mono text-slate-300">
            {loadKw.toFixed(1)}{loadKw !== 0 ? " kW" : ""}
          </div>
          <div className="text-xs text-slate-400 min-h-[1rem]">{labels?.building || "\u00A0"}</div>
        </div>

        {/* Grid */}
        <div
          className="absolute bg-blue-900/40 rounded-lg p-3 border-2 border-blue-500/50 flex flex-col justify-start"
          style={{
            left: positions.grid.x - boxWidth / 2,
            top: positions.grid.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xl">⚡</div>
            <div className="text-xs font-semibold text-blue-300">GRID</div>
          </div>
          <div className={`text-sm font-mono ${gridKw >= 0 ? "text-blue-300" : "text-emerald-300"}`}>
            {gridKw >= 0 ? "+" : ""}{gridKw.toFixed(1)}{gridKw !== 0 ? " kW" : ""}
          </div>
          <div className="text-xs text-slate-400 min-h-[1rem]">{labels?.grid || "\u00A0"}</div>
        </div>

        {/* Grid Meter */}
        <div
          className="absolute bg-red-900/40 rounded-lg p-3 border-2 border-red-500/50 flex flex-col justify-start"
          style={{
            left: positions.gridMeter.x - boxWidth / 2,
            top: positions.gridMeter.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xl">📊</div>
            <div className="text-xs font-semibold text-red-300">GRID METER</div>
          </div>
          <div className="text-sm font-mono text-red-300">
            {Math.abs(gridKw).toFixed(1)}{Math.abs(gridKw) !== 0 ? " kW" : ""}
          </div>
          <div className="text-xs text-slate-400 min-h-[1rem]">{labels?.gridMeter || "\u00A0"}</div>
        </div>

        {/* Inverter */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-3 border-2 border-slate-500 flex flex-col justify-start"
          style={{
            left: positions.inverter.x - boxWidth / 2,
            top: positions.inverter.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xl">🔄</div>
            <div className="text-xs font-semibold text-slate-300">INVERTER</div>
          </div>
          <div className="text-sm font-mono text-slate-300">—</div>
          <div className="text-xs text-slate-400 min-h-[1rem]">DC ↔ AC</div>
        </div>

        {/* Solar */}
        <div
          className="absolute bg-amber-900/40 rounded-lg p-3 border-2 border-amber-500/50 flex flex-col justify-start"
          style={{
            left: positions.solar.x - boxWidth / 2,
            top: positions.solar.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xl">☀️</div>
            <div className="text-xs font-semibold text-amber-300">SOLAR</div>
          </div>
          <div className="text-sm font-mono text-amber-300">
            {solarKw.toFixed(1)}{solarKw !== 0 ? " kW" : ""}
          </div>
          <div className="text-xs text-slate-400 min-h-[1rem]">{labels?.solar || "\u00A0"}</div>
        </div>

        {/* Battery */}
        <div
          className="absolute bg-emerald-900/40 rounded-lg p-3 border-2 border-emerald-500/50 flex flex-col justify-start"
          style={{
            left: positions.battery.x - boxWidth / 2,
            top: positions.battery.y - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xl">🔋</div>
            <div className="text-xs font-semibold text-emerald-300">BATTERY</div>
          </div>
          <div className="text-sm font-mono text-emerald-300">
            {batteryKw >= 0 ? "+" : ""}{batteryKw.toFixed(1)}{batteryKw !== 0 ? " kW" : ""}
          </div>
          <div className="text-xs text-slate-400 min-h-[1rem]">{labels?.battery || "\u00A0"}</div>
          <div className="text-xs text-slate-400">{soc.toFixed(0)}% SOC</div>
        </div>

        {/* Daily Consumption */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-3 border-2 border-slate-600 flex flex-col justify-start"
          style={{
            left: positions.dailyConsumption.x - boxWidth / 2,
            top: positions.dailyConsumption.y - boxHeight / 2,
            width: boxInfoWidth,
            height: boxInfoHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xl">📈</div>
            <div className="text-xs font-semibold text-slate-300">Daily Consumption</div>
          </div>
          <div className="text-sm font-mono text-slate-300">
            {dailyConsumptionSum.toFixed(2)} kWh
          </div>
          <div className="text-xs text-slate-400 min-h-[1rem]">{"\u00A0"}</div>
        </div>

        {/* Daily Solar Production */}
        <div
          className="absolute bg-amber-900/40 rounded-lg p-3 border-2 border-amber-500/50 flex flex-col justify-start"
          style={{
            left: positions.dailySolar.x - boxWidth / 2,
            top: positions.dailySolar.y - boxHeight / 2,
            width: boxInfoWidth,
            height: boxInfoHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xl">☀️</div>
            <div className="text-xs font-semibold text-amber-300">Daily Solar</div>
          </div>
          <div className="text-sm font-mono text-amber-300">
            {dailySolarSum.toFixed(2)} kWh
          </div>
          <div className="text-xs text-slate-400 min-h-[1rem]">{"\u00A0"}</div>
        </div>

        {/* Market Prices */}
        <div
          className="absolute bg-slate-700/80 rounded-lg p-3 border-2 border-slate-600 flex flex-col justify-start"
          style={{
            left: positions.marketPrices.x - boxWidth / 2,
            top: positions.marketPrices.y - boxHeight / 2,
            width: boxInfoWidth,
            height: boxInfoHeight,
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xl">💰</div>
            <div className="text-xs font-semibold text-slate-300">Market Prices</div>
          </div>
          <div className={`text-sm font-mono ${getTariffColor(tariff || "", false)}`}>
            Spot: {spotPrice !== undefined ? spotPrice.toFixed(0) : "—"} €/MWh
          </div>
          <div className={`text-sm font-mono ${getTariffColor(tariff || "", true)}`}>
            Export: {exportPrice !== undefined ? exportPrice.toFixed(0) : "—"} €/MWh
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * WebSocket hook for real-time energy data.
 * Connects to /ws/live and receives snapshot updates every 2 seconds.
 */
import { useEffect, useState } from "react";

/** Solar inverter metrics (power, voltage, current). */
export interface SolarMetrics {
  power_w: number;
  voltage_v: number;
  current_a: number;
}

/** Battery metrics (power, SOC, capacity, voltage, temperature). */
export interface BatteryMetrics {
  power_w: number;
  soc_percent: number;
  capacity_kwh: number;
  voltage_v: number;
  temperature_c: number;
}

/** Grid connection metrics (power, voltage, current, frequency). */
export interface GridMetrics {
  power_w: number;
  voltage_v: number;
  current_a: number;
  frequency_hz: number;
}

/** Building load metrics (power, voltage, current). */
export interface LoadMetrics {
  power_w: number;
  voltage_v: number;
  current_a: number;
}

/** Full snapshot: solar, battery, grid, load metrics at a timestamp. */
export interface Snapshot {
  timestamp: string;
  solar: SolarMetrics;
  battery: BatteryMetrics;
  grid: GridMetrics;
  load: LoadMetrics;
}

/** WebSocket connection status. */
export type WsStatus = "connecting" | "open" | "closed";

/**
 * Fetches live data via WebSocket and returns snapshot + status.
 *
 * @returns Object with snapshot (or null) and WebSocket status.
 */
export function useLiveData() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<WsStatus>("connecting");

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/live`;

    let ws = new WebSocket(url);

    ws.onopen = () => setStatus("open");
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "snapshot") {
          setSnapshot(msg.data as Snapshot);
        }
      } catch {
        // ignore
      }
    };
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("closed");

    return () => {
      ws.close();
    };
  }, []);

  return { snapshot, status };
}

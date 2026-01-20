import { useEffect, useState } from "react";

export interface SolarMetrics {
  power_w: number;
  voltage_v: number;
  current_a: number;
}

export interface BatteryMetrics {
  power_w: number;
  soc_percent: number;
  capacity_kwh: number;
  voltage_v: number;
  temperature_c: number;
}

export interface GridMetrics {
  power_w: number;
  voltage_v: number;
  current_a: number;
  frequency_hz: number;
}

export interface LoadMetrics {
  power_w: number;
  voltage_v: number;
  current_a: number;
}

export interface Snapshot {
  timestamp: string;
  solar: SolarMetrics;
  battery: BatteryMetrics;
  grid: GridMetrics;
  load: LoadMetrics;
}

export type WsStatus = "connecting" | "open" | "closed";

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

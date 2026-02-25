from __future__ import annotations

import asyncio
import csv
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Set

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .models import Overview, EquipmentItem, AnalyticsResponse, Snapshot
from .simulator import Simulator
from .config import use_simulator, get_retention_days, get_mode
from .db import get_repository
from .routers import weather, prices, phases, erse_tariffs, usage_profiles


def _resolve_root_dir() -> str:
    """
    Resolve project root so CSVs can be found both locally and in Docker.

    Layouts we support:
    - Local dev:   <repo>/backend/app/main.py  -> ROOT_DIR = <repo>
    - Docker:      /app/app/main.py           -> ROOT_DIR = /app
    """
    here = os.path.dirname(__file__)
    candidates = [
        os.path.abspath(os.path.join(here, "..", "..")),  # repo root in local dev
        os.path.abspath(os.path.join(here, "..")),        # /app in Docker
        os.getcwd(),                                      # fallback: current working directory
    ]
    for candidate in candidates:
        if os.path.exists(os.path.join(candidate, "Consumption.csv")):
            return candidate
    # Fallback to first guess even if the file isn't there (will surface in logs)
    return candidates[0]


ROOT_DIR = _resolve_root_dir()
CONSUMPTION_CSV = os.path.join(ROOT_DIR, "Consumption.csv")
PATHS_CSV = os.path.join(ROOT_DIR, "Paths.csv")


sim: Simulator | None = None
clients: Set[WebSocket] = set()
start_time = datetime.now(timezone.utc)


async def collector_loop():
    """Background loop: run collectors when in live mode, retention daily."""
    from .collectors import OpenMeteoCollector, fetch_prices_with_fallback
    from .collectors import EntsoeCollector, EsiosCollector
    repo = get_repository()
    open_meteo = OpenMeteoCollector(repo)
    entsoe = EntsoeCollector(repo)
    esios = EsiosCollector(repo)
    retention_days = get_retention_days()
    last_retention = 0
    last_weather = 0
    last_prices = 0
    while True:
        await asyncio.sleep(60)  # Check every minute
        now = datetime.now(timezone.utc).timestamp()
        if use_simulator():
            continue
        # Run retention once per day
        if now - last_retention > 86400:
            try:
                deleted = repo.run_retention(retention_days)
                if deleted:
                    print(f"[Retention] Deleted {deleted} old rows")
                last_retention = now
            except Exception as e:
                print(f"[Retention] Error: {e}")
        # Weather every 6h
        if now - last_weather > 6 * 3600:
            try:
                if await open_meteo.run():
                    last_weather = now
            except Exception as e:
                print(f"[OpenMeteo] Error: {e}")
        # Prices every 1h (ENTSO-E primary, ESIOS fallback)
        if now - last_prices > 3600:
            try:
                if await fetch_prices_with_fallback(entsoe, esios):
                    last_prices = now
            except Exception as e:
                print(f"[Prices] Error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global sim
    sim = Simulator()
    app.state.sim = sim
    asyncio.create_task(broadcast_loop())
    asyncio.create_task(collector_loop())
    if use_simulator():
        try:
            from .ai import build_usage_profiles
            n = build_usage_profiles(profile_id="default", source="csv")
            if n:
                print(f"[AI] Built {n} usage profile rows")
        except Exception as e:
            print(f"[AI] Profile build skipped: {e}")
    yield
    # nothing to cleanup yet


app = FastAPI(
    title="Energy Monitor Demo",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers for new endpoints
app.include_router(weather.router)
app.include_router(prices.router)
app.include_router(phases.router)
app.include_router(erse_tariffs.router)
app.include_router(usage_profiles.router)

# static SPA (built frontend)
STATIC_DIR = os.path.join(ROOT_DIR, "frontend_dist")
if os.path.isdir(STATIC_DIR):
    # Mount static files directory - this will serve assets, images, etc.
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")
    # Serve other static files (like vite.svg) from root of frontend_dist
    static_files = StaticFiles(directory=STATIC_DIR)
    app.mount("/static", static_files, name="static")


@app.get("/")
async def index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend not built yet. Run frontend build."}


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/debug")
async def debug_info():
    """
    Diagnostic endpoint to check CSV loading and simulator state.
    Useful for debugging path issues in Docker.
    """
    info = {
        "mode": get_mode(),
        "use_simulator": use_simulator(),
        "paths": {
            "root_dir": ROOT_DIR,
            "consumption_csv": CONSUMPTION_CSV,
            "paths_csv": PATHS_CSV,
            "static_dir": STATIC_DIR,
        },
        "files_exist": {
            "consumption_csv": os.path.exists(CONSUMPTION_CSV),
            "paths_csv": os.path.exists(PATHS_CSV),
            "static_dir": os.path.isdir(STATIC_DIR),
        },
        "simulator": {
            "initialized": sim is not None,
        },
    }

    if sim:
        info["simulator"]["row_count"] = len(getattr(sim, "_weekday_rows", []))
        info["simulator"]["current_slot"] = getattr(sim, "_slot", 0)
        info["simulator"]["last_slot"] = getattr(sim, "_last_slot", 0)
        info["simulator"]["battery_soc"] = getattr(sim, "battery_soc", None)

        # Try to get current row
        current_row = sim.get_current_row()
        if current_row:
            info["simulator"]["current_row_sample"] = {
                "time": current_row.get("TIME", ""),
                "building_load_pwr": current_row.get("BUILDING LOAD PWR", ""),
                "grid_pwr": current_row.get("GRID PWR", ""),
                "solar_pwr": current_row.get("SOLAR PWR", ""),
                "battery_pwr": current_row.get("BATTERY PWR", ""),
                "battery_soc": current_row.get("BATTERY SOC", ""),
            }
        else:
            info["simulator"]["current_row_sample"] = None

    return info


@app.get("/api/overview", response_model=Overview)
async def api_overview():
    if not sim:
        raise RuntimeError("Simulator not initialized")
    snap = sim.generate_snapshot()
    uptime = int((datetime.now(timezone.utc) - start_time).total_seconds())
    return sim.build_overview(snap, uptime_seconds=uptime)


@app.get("/api/equipment", response_model=list[EquipmentItem])
async def api_equipment():
    if not sim:
        raise RuntimeError("Simulator not initialized")
    snap = sim.generate_snapshot()
    return sim.build_equipment(snap)


@app.get("/api/intraday-analytics")
async def get_intraday_analytics():
    """
    Return 24-hour intraday data from Consumption.csv for analytics charts.
    Returns all rows with cumulative energy values and prices.
    """
    try:
        if not sim:
            return {"error": "Simulator not initialized"}
        
        # Get all rows from CSV
        rows = sim.get_all_rows()
        
        def parse_float(field: str, row: dict) -> float:
            val = (row.get(field) or "").strip()
            try:
                return float(val) if val else 0.0
            except ValueError:
                return 0.0
        
        data = []
        cumulative_grid = 0.0
        cumulative_solar = 0.0
        cumulative_battery = 0.0
        cumulative_building = 0.0
        
        for row in rows:
            time_value = (row.get("TIME") or "").strip()
            
            # Cumulative energy values
            grid_energy = parse_float("GRID ENERGY", row)
            solar_prod = parse_float("SOLAR PRODUCTION", row)
            battery_energy = parse_float("BATTERY", row)
            building_consumption = parse_float("BUILDING CONSUMPTION", row)
            
            cumulative_grid += grid_energy
            cumulative_solar += solar_prod
            cumulative_battery += battery_energy
            cumulative_building += building_consumption
            
            # Prices
            spot_price = parse_float("SPOT PRICE", row) * 1000
            buy_price = parse_float("BUY PRICE", row) * 1000  # May not exist in older CSV files
            export_price = parse_float("EXPORT PRICE", row) * 1000
            
            data.append({
                "time": time_value,
                "cumulative_grid_energy": cumulative_grid,
                "cumulative_solar_energy": cumulative_solar,
                "cumulative_battery_energy": cumulative_battery,
                "cumulative_building_load": cumulative_building,
                "spot_price": spot_price,
                "buy_price": buy_price,
                "export_price": export_price,
            })
        
        return {"data": data}
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


@app.get("/api/analytics", response_model=AnalyticsResponse)
async def api_analytics(hours: int = 24, resolution: int = 60):
    if not sim:
        raise RuntimeError("Simulator not initialized")
    return sim.build_analytics(hours=hours, resolution_minutes=resolution)


@app.get("/api/consumption-data")
async def get_consumption_data():
    """
    Read consumption and path data from CSV files and return current row data.

    Uses the same time-compressed index as the Simulator by asking the simulator
    for the current row, so values, paths and timestamps stay in sync.
    """
    try:
        if not sim:
            return {"error": "Simulator not initialized"}

        # Ask simulator which row is current so we stay perfectly in sync
        raw_row = sim.get_current_row()  # type: ignore[attr-defined]
        row = None
        if raw_row is not None:
            # Normalise header keys to avoid BOM / whitespace issues (e.g. '\ufeffTIME')
            row = {(k or "").strip().lstrip("\ufeff"): (v or "") for k, v in raw_row.items()}

        if row is None:
            return {"error": "Consumption.csv not found or empty"}

        # Parse core metrics
        time_value = (row.get("TIME") or "").strip()

        def parse_float(field: str) -> float:
            val = (row.get(field) or "").strip()
            try:
                return float(val) if val else 0.0
            except ValueError:
                return 0.0

        building_kw = parse_float("BUILDING LOAD PWR")
        grid_kw = parse_float("GRID PWR")
        power_kw = building_kw  # alias, if needed
        solar_kw = parse_float("SOLAR PWR")

        # Additional fields for new boxes
        building_consumption = parse_float("BUILDING CONSUMPTION")
        solar_production = parse_float("SOLAR PRODUCTION")
        spot_price = parse_float("SPOT PRICE") * 1000
        buy_price = parse_float("BUY PRICE") * 1000  # May not exist in older CSV files, defaults to 0
        export_price = parse_float("EXPORT PRICE") * 1000
        tariff = (row.get("TARIFF") or "").strip()

        # Active path ID (single PATH column, e.g. a..g)
        active_paths: list[str] = []
        path_val = (row.get("PATH") or "").strip()
        if path_val:
            active_paths.append(path_val)

        # Labels for boxes
        labels = {
            "building": (row.get("BUILDING LOAD LABEL") or "").strip() or None,
            "grid": (row.get("GRID LABEL") or "").strip() or None,
            "battery": (row.get("BATTERY LABEL") or "").strip() or None,
            "solar": (row.get("SOLAR LABEL") or "").strip() or None,
        }

        # Load path definitions from Paths.csv
        path_definitions: list[dict] = []
        if os.path.exists(PATHS_CSV):
            with open(PATHS_CSV, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)

                def map_node(name: str) -> str:
                    n = name.strip().upper()
                    if n == "GRID":
                        return "grid"
                    if n == "GRID METER":
                        return "gridMeter"
                    if n == "INVERTER":
                        return "inverter"
                    if n == "BATTERY":
                        return "battery"
                    if n == "BUILDING":
                        return "building"
                    if n == "SOLAR":
                        return "solar"
                    return n.lower()

                # Normalise headers once so we can work with clean keys
                raw_rows: list[dict] = []
                for prow in reader:
                    if not any(prow.values()):
                        continue
                    clean = {(k or "").strip().lstrip("\ufeff"): (v or "") for k, v in prow.items()}
                    raw_rows.append(clean)

                # Build segment-level definitions: only keep segments where status == active.
                # Color and source now come directly from CSV columns "source" and "lineColor".
                for prow in raw_rows:
                    pid = (prow.get("PATH") or "").strip()
                    status = (prow.get("status") or "").strip().lower()
                    if not pid or status != "active":
                        continue

                    from_raw = (prow.get("from") or "").strip()
                    to_raw = (prow.get("to") or "").strip()
                    if not from_raw or not to_raw:
                        continue

                    # Source column (e.g. grid_pwr / solar_pwr / battery_pwr)
                    source_raw = (prow.get("source") or "").strip().lower()
                    # lineColor column gives preferred display colour; if empty,
                    # fall back to a sensible default based on source.
                    color_raw = (prow.get("lineColor") or "").strip()

                    color = color_raw
                    if not color:
                        if "solar" in source_raw:
                            color = "yellow"
                        elif "battery" in source_raw:
                            color = "green"
                        elif "grid" in source_raw:
                            color = "red"
                        else:
                            color = "white"

                    path_definitions.append(
                        {
                            "path_id": pid,
                            "from": map_node(from_raw),
                            "to": map_node(to_raw),
                            "color": color,
                            "source": source_raw,  # Include source (e.g. solar_pwr, battery_pwr, grid_pwr) for matching
                            "description": f"{pid}: {from_raw} → {to_raw}",
                        }
                    )

        return {
            "time": time_value,
            "building_kw": building_kw,
            "grid_kw": grid_kw,
            "power_kw": power_kw,
            "solar_kw": solar_kw,
            "active_paths": active_paths,
            "path_definitions": path_definitions,
            "labels": labels,
            "building_consumption": building_consumption,
            "solar_production": solar_production,
            "spot_price": spot_price,
            "buy_price": buy_price,  # New field
            "export_price": export_price,
            "tariff": tariff,
        }
    except Exception as e:
        import traceback

        return {"error": str(e), "traceback": traceback.format_exc()}


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    try:
        # send one snapshot immediately
        if sim:
            snap = sim.generate_snapshot()
            await websocket.send_text(
                json.dumps(
                    {"type": "snapshot", "data": json.loads(Snapshot.model_validate(snap).model_dump_json())}
                )
            )

        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if msg == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                await websocket.send_text(
                    json.dumps({"type": "keepalive", "timestamp": datetime.now(timezone.utc).isoformat()})
                )
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        clients.discard(websocket)


async def broadcast_loop():
    while True:
        await asyncio.sleep(2)
        if not sim:
            continue

        # Always advance the simulator so CSV‑driven time and values move forward
        # even if there are no connected WebSocket clients.
        snap = sim.generate_snapshot()

        if not clients:
            continue

        payload = json.dumps(
            {"type": "snapshot", "data": json.loads(Snapshot.model_validate(snap).model_dump_json())}
        )
        dead: Set[WebSocket] = set()
        for ws in clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        clients.difference_update(dead)


# Catch-all route for SPA routing - must be last
# This handles static files at root (like vite.svg) and SPA routes
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Don't interfere with API routes or WebSocket (these are handled by their specific routes)
    if full_path.startswith("api/") or full_path.startswith("ws/"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    
    # Try to serve the requested file if it exists (e.g., vite.svg)
    file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # Otherwise serve index.html for SPA routing
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return {"message": "Frontend not built yet. Run frontend build."}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

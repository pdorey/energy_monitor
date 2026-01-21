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

# Data file paths (CSV) - work both in local dev and inside Docker
# We base everything on the location of this file:
#   - In local dev:   <repo>/backend/app/main.py  -> ROOT_DIR = <repo>
#   - In Docker:      /app/app/main.py           -> ROOT_DIR = /app
HERE = os.path.dirname(__file__)
ROOT_DIR = os.path.abspath(os.path.join(HERE, "..", ".."))
CONSUMPTION_CSV = os.path.join(ROOT_DIR, "Consumption.csv")
PATHS_CSV = os.path.join(ROOT_DIR, "Paths.csv")


sim: Simulator | None = None
clients: Set[WebSocket] = set()
start_time = datetime.now(timezone.utc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global sim
    sim = Simulator()
    asyncio.create_task(broadcast_loop())
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
        row = sim.get_current_row()  # type: ignore[attr-defined]
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

        # Active paths (PATH 1, PATH 2, PATH 3)
        active_paths: list[str] = []
        for col in ("PATH 1", "PATH 2", "PATH 3"):
            val = (row.get(col) or "").strip()
            if val:
                active_paths.append(str(val))

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
            with open(PATHS_CSV, newline="") as f:
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

                for prow in reader:
                    path_id = (prow.get("PATHS") or "").strip()
                    if not path_id:
                        continue

                    steps = [
                        (prow.get("Step 1") or "").strip(),
                        (prow.get("Step 2") or "").strip(),
                        (prow.get("Step 3") or "").strip(),
                        (prow.get("Step 4") or "").strip(),
                    ]
                    steps = [s for s in steps if s]
                    if len(steps) < 2:
                        continue

                    # Color based on source node (first step)
                    source = steps[0].strip().upper()
                    if source == "GRID":
                        color = "red"
                    elif source == "SOLAR":
                        color = "yellow"
                    elif source == "BATTERY":
                        color = "green"
                    else:
                        color = "white"

                    description = " → ".join(steps)
                    for i in range(len(steps) - 1):
                        path_definitions.append(
                            {
                                "path_id": str(path_id),
                                "from": map_node(steps[i]),
                                "to": map_node(steps[i + 1]),
                                "color": color,
                                "description": description,
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
        if not sim or not clients:
            continue
        snap = sim.generate_snapshot()
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

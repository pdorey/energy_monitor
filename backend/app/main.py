from __future__ import annotations

import asyncio
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
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "frontend_dist")
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

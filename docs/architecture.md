# Energy Monitor – Architecture

> See [MANIFEST](MANIFEST.md) for full documentation index.

## Overview

Energy monitoring system designed for Raspberry Pi. Native Linux deployment (no Docker) with a single Python backend, SQLite database, and React frontend.

## Design Principles

1. **Simplicity**: Single backend service, SQLite, minimal dependencies
2. **Performance**: Fast startup, low memory footprint, real-time updates
3. **Raspberry Pi Friendly**: Native deployment, no container overhead
4. **Demo-Ready**: Simulator mode for showcase; live mode for real equipment

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│         Frontend (React/Vite)            │
│  - Single page application               │
│  - WebSocket for real-time updates       │
│  - Built to frontend_dist/               │
└──────────────┬──────────────────────────┘
               │ WebSocket (2s updates)
               │ REST API (initial load)
               │
┌──────────────▼──────────────────────────┐
│      Backend (FastAPI)                   │
│  - Equipment simulator                   │
│  - Data collectors (weather, prices)     │
│  - SQLite database                       │
│  - WebSocket server                      │
│  - Static file serving                   │
│  - systemd service                       │
└─────────────────────────────────────────┘
```

## Components

### Backend (`backend/app/`)

- **main.py**: FastAPI app, REST/WebSocket endpoints, static serving
- **simulator.py**: 7-day CSV-driven simulator (weekday/weekend, EV, heat pump, 3-phase)
- **models.py**: Pydantic data models
- **collectors/**: Open-Meteo, ENTSO-E, ESIOS, Huawei (stubs)
- **db/**: SQLite schema, repository, retention
- **transformers/**: Price calculation (OMIE + ERSE)
- **routers/**: Weather, prices, phases, ERSE tariffs, usage profiles

### Frontend (`frontend/src/`)

- **App.tsx**: Tab navigation, real-time display
- **hooks/useLiveData.ts**: WebSocket hook
- **api/client.ts**: REST client

## Deployment

### Native Linux (systemd)

1. **Install** (one-time): `./install.sh` – creates venv, installs Python deps
2. **Deploy**: `./deploy.sh` – builds frontend on Pi, restarts systemd service

### Build Process

1. Build frontend: `cd frontend && npm install && npm run build` (output to `frontend_dist/`)
2. Install Python deps: `pip install -r backend/requirements.txt`
3. Start: `uvicorn app.main:app --host 0.0.0.0 --port 8000` (or via systemd)

### Directory Layout

```
energy_monitor/
├── backend/app/          # Python application
├── frontend/              # React source
├── frontend_dist/         # Built static assets
├── data/                  # SQLite (energy_monitor.db)
├── venv/                  # Python virtualenv
├── Consumption.csv        # Simulator base data
└── Paths.csv              # Energy flow paths
```

## Performance

| Metric | Value |
|--------|-------|
| Update Rate | 2 seconds |
| Memory Usage | ~50–100 MB |
| CPU Usage | <5% on Pi 4 |
| Startup Time | <5 seconds |

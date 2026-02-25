# Energy Monitor

A fast, lightweight energy monitoring system designed for Raspberry Pi. Native Linux deployment with real-time energy data visualization.

## Features

- **Real-time Updates**: WebSocket-based live data streaming (2-second updates)
- **Modern UI**: Clean, responsive dashboard with energy flow visualization
- **Fast & Lightweight**: Single Python backend, SQLite database
- **Live Metrics**: Solar generation, battery status, grid import/export, building load
- **Equipment Simulation**: 7-day cycle with weekday/weekend profiles, EV, heat pump
- **3-Phase Monitoring**: Per-phase and aggregate AC metrics

## Quick Start

### Raspberry Pi (Native Linux)

```bash
# Clone the repository
git clone https://github.com/pdorey/energy_monitor.git
cd energy_monitor

# One-time installation (creates venv, installs dependencies)
chmod +x install.sh
./install.sh

# Deploy (builds frontend on Pi, starts systemd service)
chmod +x deploy.sh
./deploy.sh
```

The dashboard will be available at: **http://your-pi-ip:8000**

### Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

### Raspberry Pi Setup (Fresh Install)

For a fresh Raspberry Pi (Raspberry Pi OS):

```bash
# Install Python 3.11+ (usually pre-installed on Pi OS Bookworm)
sudo apt update
sudo apt install -y python3 python3-venv python3-pip

# Install Node.js (for frontend build during deploy)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone and install
git clone https://github.com/pdorey/energy_monitor.git
cd energy_monitor
./install.sh
./deploy.sh
```

Access the dashboard at: **http://your-pi-ip:8000**

### Deployment Script

For updates and redeployment:

```bash
./deploy.sh
```

The script will:
1. Pull the latest code from git
2. Build the frontend on the Pi (1-2 minutes)
3. Install/update Python dependencies
4. Restart the systemd service
5. Perform health checks

**Requirements:**
- Git repository with remote
- Node.js and npm (for frontend build)
- Python 3.11+
- Run `./install.sh` once before first deploy

## Architecture

```
┌─────────────────────────────────┐
│      Frontend (React/Vite)      │
│  - Real-time WebSocket updates  │
│  - Energy flow visualization    │
└──────────────┬──────────────────┘
               │ WebSocket / REST
               │
┌──────────────▼──────────────────┐
│   Backend (FastAPI)              │
│  - Equipment simulator          │
│  - SQLite database               │
│  - Data collectors (optional)    │
│  - systemd service               │
└─────────────────────────────────┘
```

### Project Structure

```
energy_monitor/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── simulator.py
│   │   ├── models.py
│   │   ├── collectors/
│   │   ├── db/
│   │   └── routers/
│   └── requirements.txt
├── frontend/
├── frontend_dist/       # Built assets (created by deploy)
├── data/                # SQLite database (created by install)
├── venv/                # Python virtualenv (created by install)
├── install.sh           # One-time setup
├── deploy.sh            # Deploy and restart
└── energy-monitor.service
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/overview` - System overview
- `GET /api/equipment` - List all equipment
- `GET /api/analytics?hours=24&resolution=60` - Historical analytics
- `GET /api/weather?days=7` - Weather forecast
- `GET /api/energy-prices?days=2` - Energy prices
- `GET /api/equipment/{id}/phases` - 3-phase metrics
- `WS /ws/live` - WebSocket for real-time data

## Service Management

```bash
# View logs
sudo journalctl -u energy-monitor -f

# Restart
sudo systemctl restart energy-monitor

# Status
sudo systemctl status energy-monitor

# Stop
sudo systemctl stop energy-monitor
```

## Troubleshooting

### Dashboard shows "Disconnected"

1. Check service: `sudo systemctl status energy-monitor`
2. Check logs: `sudo journalctl -u energy-monitor -f`
3. Verify port 8000: `curl http://localhost:8000/health`

### No data showing

1. Wait a few seconds for initial data
2. Check logs for errors
3. Verify WebSocket in browser DevTools

### Deploy fails at frontend build

Ensure Node.js is installed: `node --version` (v18+ recommended)

### Service won't start

1. Run install: `./install.sh`
2. Check venv exists: `ls venv/bin/uvicorn`
3. Test manually: `source venv/bin/activate && cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000`

## License

GPL-3.0

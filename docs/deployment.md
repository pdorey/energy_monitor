# Energy Monitor – Deployment

> See [MANIFEST](MANIFEST.md) for full documentation index.

## Quick Start

### Raspberry Pi (Native Linux)

```bash
git clone https://github.com/pdorey/energy_monitor.git
cd energy_monitor
chmod +x install.sh
./install.sh
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

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

git clone https://github.com/pdorey/energy_monitor.git
cd energy_monitor
./install.sh
./deploy.sh
```

## Deployment Script

For updates and redeployment:

```bash
./deploy.sh
```

The script will:
1. Pull the latest code from git
2. Build the frontend on the Pi (1–2 minutes)
3. Install/update Python dependencies
4. Restart the systemd service
5. Perform health checks

**Requirements**: Git repository with remote, Node.js and npm (for frontend build), Python 3.11+. Run `./install.sh` once before first deploy.

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

### Service won't start (exit-code)

1. **Get the actual error:** `./troubleshoot.sh` or `sudo journalctl -u energy-monitor -n 50 --no-pager`
2. Run install: `./install.sh`
3. Check venv exists: `ls venv/bin/uvicorn`
4. Test manually from project root:
   ```bash
   cd /path/to/energy_monitor
   source venv/bin/activate
   PYTHONPATH=$PWD/backend uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
5. If `User=pi` fails: edit `/etc/systemd/system/energy-monitor.service` and change `User=` to your username, then `sudo systemctl daemon-reload && sudo systemctl restart energy-monitor`

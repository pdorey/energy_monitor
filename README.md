# Energy Monitor

A fast, lightweight energy monitoring system designed for demo purposes. Optimized for Raspberry Pi with a simplified architecture that provides real-time energy data visualization.

## Features

- ⚡ **Real-time Updates**: WebSocket-based live data streaming (2-second updates)
- 🎨 **Modern UI**: Clean, responsive dashboard with energy flow visualization
- 🚀 **Fast & Lightweight**: Single backend service, no heavy databases
- 📊 **Live Metrics**: Solar generation, battery status, grid import/export, building load
- 🔋 **Battery Simulation**: Realistic charge/discharge cycles with SOC tracking
- ☀️ **Solar Simulation**: Time-based PV generation with weather factors

## Quick Start

### Using Docker Compose

```bash
# Clone the repository
git clone https://github.com/pdorey/energy_monitor.git
cd energy_monitor

# Build frontend first
cd frontend
npm install
npm run build
cd ..

# Start the system
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop the system
docker-compose down
```

The dashboard will be available at: **http://localhost:8000**

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

### Raspberry Pi Setup

For a fresh Raspberry Pi installation:

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Reboot
sudo reboot

# After reboot, clone and start
git clone https://github.com/pdorey/energy_monitor.git
cd energy_monitor
cd frontend && npm install && npm run build && cd ..
docker-compose up -d --build
```

Access the dashboard at: **http://your-pi-ip:8000**

### Deployment Script

For easy updates and redeployment on Raspberry Pi, use the provided deployment script:

```bash
# Make the script executable (first time only)
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

The script will:
1. Pull the latest code from git
2. Install/update npm dependencies (if needed)
3. Build the frontend
4. Stop existing containers
5. Rebuild and start Docker containers
6. Perform health checks
7. Display status and logs

**Note:** Ensure you have:
- Git repository initialized and connected to remote
- Node.js and npm installed (for frontend build)
- Docker and docker-compose installed
- Proper permissions to run docker commands

## Architecture

This is a simplified architecture optimized for demo purposes:

```
┌─────────────────────────────────┐
│      Frontend (React/Vite)      │
│  - Real-time WebSocket updates  │
│  - Energy flow visualization    │
└──────────────┬──────────────────┘
               │ WebSocket
               │
┌──────────────▼──────────────────┐
│   Backend (FastAPI)             │
│  - Equipment simulator          │
│  - Data generation              │
│  - WebSocket server             │
└─────────────────────────────────┘
```

### Key Simplifications

- **No databases**: All data is generated in-memory
- **No message queues**: Direct WebSocket communication
- **Single service**: One backend handles everything
- **Static frontend**: Built React app served by backend

## API Endpoints

- `GET /health` - Health check
- `GET /api/overview` - System overview
- `GET /api/equipment` - List all equipment
- `GET /api/analytics?hours=24&resolution=60` - Historical analytics
- `WS /ws/live` - WebSocket for real-time data

## Equipment Simulation

The system simulates:

1. **Solar Inverter**: PV generation based on time of day and weather
2. **Battery System**: 60 kWh capacity with charge/discharge logic
3. **Grid Connection**: Import/export based on load and generation
4. **Building Load**: Time-based office load profile

### Simulation Parameters

- Battery Capacity: 60 kWh
- PV Peak (Summer): 55 kW
- PV Peak (Winter): 35 kW
- Office Peak Load: 80 kW
- Office Base Load: 15 kW

## Development

### Project Structure

```
energy_monitor/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app
│   │   ├── simulator.py      # Data generator
│   │   └── models.py        # Pydantic models
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── hooks/
│   │   └── api/
│   ├── package.json
│   └── vite.config.ts
└── docker-compose.yml
```

### Building Frontend

The frontend must be built before running Docker:

```bash
cd frontend
npm install
npm run build
```

This outputs to `../frontend_dist` which is served by the backend.

## Performance

- **Update Rate**: 2 seconds
- **Memory Usage**: ~50-100 MB
- **CPU Usage**: <5% on Raspberry Pi 4
- **Startup Time**: <5 seconds

## Troubleshooting

### Dashboard shows "Disconnected"

1. Check if backend is running: `docker-compose ps`
2. Check logs: `docker-compose logs demo-core`
3. Verify port 8000 is accessible
4. Check browser console for WebSocket errors

### No data showing

1. Wait a few seconds for initial data generation
2. Check backend logs for errors
3. Verify WebSocket connection in browser DevTools

### Frontend not found

Make sure you've built the frontend:
```bash
cd frontend && npm install && npm run build
```

## License

GPL-3.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

# Energy Monitor - Architecture

## Overview

This is a simplified energy monitoring system designed for fast, responsive demos on Raspberry Pi. The architecture eliminates complexity while maintaining all essential features.

## Design Principles

1. **Simplicity**: Single backend service, no databases, minimal dependencies
2. **Performance**: Fast startup, low memory footprint, real-time updates
3. **Demo-Focused**: Optimized for showcasing, not production deployment
4. **Raspberry Pi Friendly**: Lightweight enough to run smoothly on Pi hardware

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│         Frontend (React/Vite)            │
│  - Single page application               │
│  - WebSocket for real-time updates      │
│  - No build step required in production │
│  - ~200KB bundle size                   │
└──────────────┬──────────────────────────┘
               │ WebSocket (2s updates)
               │ REST API (initial load)
               │
┌──────────────▼──────────────────────────┐
│      Backend (FastAPI)                  │
│  - Equipment simulator                  │
│  - Data generation                      │
│  - WebSocket server                     │
│  - Static file serving                  │
│  - Single Python service                │
└─────────────────────────────────────────┘
```

## Components

### Backend (`backend/app/`)

**main.py**: FastAPI application
- REST endpoints: `/api/overview`, `/api/equipment`, `/api/analytics`
- WebSocket endpoint: `/ws/live`
- Static file serving for frontend
- CORS middleware for development

**simulator.py**: In-memory data generator
- Generates realistic energy data every 2 seconds
- Maintains 24-hour history in memory (ring buffers)
- Simulates solar, battery, grid, and load
- No external dependencies

**models.py**: Pydantic data models
- Type-safe API contracts
- Automatic validation
- JSON serialization

### Frontend (`frontend/src/`)

**App.tsx**: Main application component
- Tab-based navigation (Overview, Equipment, Analytics)
- Real-time data display
- Responsive design with Tailwind CSS

**hooks/useLiveData.ts**: WebSocket hook
- Manages WebSocket connection
- Provides live snapshot data
- Automatic reconnection

**api/client.ts**: REST API client
- Simple fetch wrapper
- Type-safe responses

## Data Flow

1. **Backend generates data** every 2 seconds using `Simulator.generate_snapshot()`
2. **Data is broadcast** to all connected WebSocket clients
3. **Frontend receives updates** and immediately updates the UI
4. **No polling** - all updates are push-based via WebSocket

## Equipment Simulation

The system simulates 4 types of equipment:

1. **Solar Inverter**: Generates power based on:
   - Time of day (8 AM - 6 PM)
   - Season (winter vs summer)
   - Weather factors (clear, cloudy, rainy)

2. **Battery System**: 60 kWh capacity with:
   - Charge/discharge logic
   - SOC tracking
   - Temperature simulation

3. **Grid Connection**: Import/export based on:
   - Building load
   - Solar generation
   - Battery state

4. **Building Load**: Time-based profile:
   - Base load: 15 kW
   - Peak load: 80 kW
   - Follows office hours pattern

## API Contracts

### REST Endpoints

- `GET /health` → `{ "status": "ok", "timestamp": "ISO8601" }`
- `GET /api/overview` → `Overview` (system summary)
- `GET /api/equipment` → `List[EquipmentItem]`
- `GET /api/analytics?hours=24&resolution=60` → `AnalyticsResponse`

### WebSocket

- `WS /ws/live`

Server messages:
```json
{
  "type": "snapshot",
  "data": {
    "timestamp": "2026-01-20T12:34:56Z",
    "solar": { "power_w": 32000.5, ... },
    "battery": { "power_w": -8000.0, "soc_percent": 72.3, ... },
    "grid": { "power_w": 5000.0, ... },
    "load": { "power_w": 29000.0, ... }
  }
}
```

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Update Rate | 2 seconds |
| Memory Usage | ~50-100 MB |
| CPU Usage | <5% on Pi 4 |
| Startup Time | <5 seconds |
| Frontend Bundle | ~200KB |

## Deployment

### Docker Compose

Single service deployment:
```yaml
services:
  demo-core:
    build: ./backend
    ports:
      - "8000:8000"
```

### Build Process

1. Build frontend: `cd frontend && npm install && npm run build`
2. Build Docker image: `docker-compose build`
3. Start service: `docker-compose up -d`

## Future Enhancements (If Needed)

If you need to add real equipment later:
- Add MQTT client to backend
- Store data in InfluxDB for historical analysis
- Add authentication/authorization
- Add data persistence

But for a demo, this simplified version is perfect!

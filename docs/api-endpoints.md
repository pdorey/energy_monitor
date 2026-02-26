# Energy Monitor – API Endpoints

> See [MANIFEST](MANIFEST.md) for full documentation index.

## REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | SPA index or message if frontend not built |
| GET | `/health` | Health check. Returns `{status, timestamp}` |
| GET | `/api/debug` | Diagnostic: CSV paths, simulator state, file existence |
| GET | `/api/overview` | System overview (equipment count, uptime, battery, daily consumption, solar, prices) |
| GET | `/api/equipment` | List all equipment |
| GET | `/api/intraday-analytics` | 24-hour intraday data from Consumption.csv (cumulative energy, prices) |
| GET | `/api/analytics?hours=24&resolution=60` | Historical analytics (timeseries) |
| GET | `/api/consumption-data` | Current consumption row + path definitions + valid connections |
| GET | `/api/weather?days=7` | Weather forecast from DB |
| GET | `/api/energy-prices?days=2` | Energy prices from DB |
| GET | `/api/equipment/{id}/phases?hours=24` | 3-phase metrics for equipment |
| GET | `/api/erse-tariff-definitions?tariff_type=` | List ERSE tariff definitions |
| POST | `/api/erse-tariff-definitions` | Create ERSE tariff definition |
| PUT | `/api/erse-tariff-definitions/{id}` | Update ERSE tariff definition |
| DELETE | `/api/erse-tariff-definitions/{id}` | Delete ERSE tariff definition |
| GET | `/api/usage-profiles?profile_id=` | AI-generated usage profiles |

## WebSocket

| Path | Description |
|------|-------------|
| WS | `/ws/live` | Real-time data. Sends `{type: "snapshot", data: {...}}` every 2s. Accepts `ping` → responds `pong`. Sends keepalive on timeout. |

## SPA Catch-All

| Method | Path | Description |
|--------|------|-------------|
| GET | `/{path}` | Serves static file if exists, else index.html for SPA routing. Excludes `api/` and `ws/`. |

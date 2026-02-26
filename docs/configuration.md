# Energy Monitor – Configuration

> See [MANIFEST](MANIFEST.md) for full documentation index.

## Environment Variables

| Env var | Default | Description |
|---------|---------|-------------|
| `ENERGY_MONITOR_MODE` | `simulator` | `simulator` \| `live` |
| `ENERGY_MONITOR_DB_PATH` | `backend/data` | SQLite path |
| `ENERGY_MONITOR_RETENTION_DAYS` | `7` | Retention for time-series |
| `OPEN_METEO_LATITUDE` | 38.7 | Weather latitude |
| `OPEN_METEO_LONGITUDE` | -9.1 | Weather longitude |
| `ENTSOE_TOKEN` | (empty) | ENTSO-E API token |
| `ENTSOE_ZONE` | `10YPT-REN------1` | Portugal bidding zone |
| `ESIOS_API_KEY` | (empty) | ESIOS API key |
| `HUAWEI_USER`, `HUAWEI_PASS`, `HUAWEI_STATION` | (empty) | Huawei FusionSolar |

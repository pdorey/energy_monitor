# Energy Monitor – Collectors

> See [MANIFEST](MANIFEST.md) for full documentation index.

Collectors fetch external data and persist it to SQLite. They run in a background loop when `mode=live` (not in simulator mode).

## Open-Meteo Collector

**Purpose**: Hourly weather forecast for solar/load modelling.

| Aspect | Detail |
|--------|--------|
| Source | https://api.open-meteo.com/v1/forecast |
| Auth | None (free, no API key) |
| Config | `OPEN_METEO_LATITUDE`, `OPEN_METEO_LONGITUDE` (default 38.7, -9.1) |
| Interval | Every 6 hours |
| Output | `weather` table |

**Data retrieval**: GET with params: `latitude`, `longitude`, `hourly` (temperature, humidity, cloud_cover, shortwave_radiation, precipitation, wind_speed, weather_code), `forecast_days=7`, `timezone=UTC`

**Transformation**:
- `hourly.time[i]` → `timestamp`
- `hourly.temperature_2m[i]` → `temperature_c`
- `hourly.relative_humidity_2m[i]` → `relative_humidity`
- `hourly.cloud_cover[i]` → `cloud_cover`
- `hourly.shortwave_radiation[i]` → `shortwave_radiation_wm2`
- `hourly.precipitation[i]` → `precipitation_mm`
- `hourly.wind_speed_10m[i]` → `wind_speed_kmh`
- `hourly.weather_code[i]` → `weather_code`

**Persistence**: `repo.insert_weather_batch(rows)`

---

## ENTSO-E Collector (Primary for Prices)

**Purpose**: Day-ahead electricity prices from ENTSO-E Transparency Platform (OMIE market data for Portugal).

| Aspect | Detail |
|--------|--------|
| Source | https://web-api.tp.entsoe.eu/api |
| Auth | `ENTSOE_TOKEN` (required) |
| Config | `ENTSOE_ZONE` (default `10YPT-REN------1` = Portugal) |
| Interval | Every 1 hour |
| Output | `energy_prices` table |

**Data retrieval**: GET with `documentType=A44` (price document), `in_Domain`/`out_Domain` = zone, `periodStart`/`periodEnd` (yesterday to +2 days). Response: XML (IEC 62325-351 format).

**Transformation**: Parses XML: `TimeSeries` → `Period` → `Point`. Each `Point`: `position` (interval index), `price.amount` (€/MWh). Start time + `resolution` (PT15M/PT30M/PT60M) → timestamp per point. Output: `{ timestamp, spot_price_eur_mwh, source: "entsoe" }`

**Persistence**: `repo.insert_energy_prices_batch(rows)`

---

## ESIOS Collector (Fallback for Prices)

**Purpose**: Iberian market day-ahead prices (Portugal + Spain). Used when ENTSO-E fails.

| Aspect | Detail |
|--------|--------|
| Source | https://api.esios.ree.es/indicators/{id} |
| Auth | `ESIOS_API_KEY` (required) |
| Indicator | 1001 = Portugal day-ahead market (OMIE) |
| Interval | Every 1 hour (via `fetch_prices_with_fallback`) |
| Output | `energy_prices` table |

**Data retrieval**: GET `/indicators/1001` with `start_date`, `end_date` (yesterday to +2 days). Response: JSON.

**Transformation**: `indicator.values[]` → each `{ datetime, value }`. Output: `{ timestamp: datetime, spot_price_eur_mwh: value, source: "esios" }`

**Persistence**: `repo.insert_energy_prices_batch(rows)`

---

## Price Fetch (ENTSO-E + ESIOS Fallback)

**Logic** (`fetch_prices_with_fallback`):
1. Try `EntsoeCollector.fetch()`
2. If success → `insert_energy_prices_batch` with source `entsoe`
3. If failure → try `EsiosCollector.fetch()`
4. If success → `insert_energy_prices_batch` with source `esios`
5. If both fail → log and return False

---

## Huawei Collector (Stub)

**Purpose**: Inverter, battery, plant data from Huawei FusionSolar Northbound API.

| Aspect | Detail |
|--------|--------|
| Config | `HUAWEI_USER`, `HUAWEI_PASS`, `HUAWEI_STATION` |
| Status | Stub – returns None until FusionSolarPy or REST integration |

**Planned transformation**: Map plant real-time data → `equipment_snapshots` (solar, battery, etc.)

---

## EV Charger Collector (Stub)

**Purpose**: EV charging status and power from FusionSolar or OCPP.

**Status**: Stub – returns None until API integration.

**Planned output**: `equipment_snapshots` for `ev` type.

---

## Heat Pump Collector (Stub)

**Purpose**: HVAC (heat pump) power and mode from vendor API.

**Status**: Stub – returns None until API integration.

**Planned output**: `equipment_snapshots` for `heat_pump` type.

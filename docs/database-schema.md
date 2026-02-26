# Energy Monitor – Database Schema

> See [MANIFEST](MANIFEST.md) for full documentation index.

SQLite database with WAL mode. 7-day retention for time-series data.

## Tables

### weather

| Column | Type | Description |
|--------|------|-------------|
| timestamp | TEXT | Primary key, ISO format |
| temperature_c | REAL | Temperature in Celsius |
| relative_humidity | REAL | Relative humidity |
| cloud_cover | REAL | Cloud cover |
| shortwave_radiation_wm2 | REAL | Shortwave radiation W/m² |
| precipitation_mm | REAL | Precipitation mm |
| wind_speed_kmh | REAL | Wind speed km/h |
| weather_code | INTEGER | WMO weather code |

### energy_prices

| Column | Type | Description |
|--------|------|-------------|
| timestamp | TEXT | Primary key |
| spot_price_eur_mwh | REAL | OMIE spot price €/MWh |
| source | TEXT | `entsoe` \| `esios` |

### equipment_snapshots

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| timestamp | TEXT | |
| equipment_id | TEXT | |
| type | TEXT | `solar` \| `battery` \| `grid` \| `load` \| `ev` \| `heat_pump` |
| power_w | REAL | |
| soc_percent | REAL | State of charge (battery) |
| raw_json | TEXT | Raw payload |

UNIQUE(timestamp, equipment_id)

### three_phase_metrics

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| timestamp | TEXT | |
| equipment_id | TEXT | |
| l1_voltage_v, l2_voltage_v, l3_voltage_v | REAL | |
| l1_current_a, l2_current_a, l3_current_a | REAL | |
| l1_power_w, l2_power_w, l3_power_w | REAL | |
| total_power_w | REAL | |
| frequency_hz | REAL | |
| power_factor | REAL | |

### consumption

| Column | Type | Description |
|--------|------|-------------|
| timestamp | TEXT | Primary key |
| building_load_kw | REAL | |
| grid_kw | REAL | |
| solar_kw | REAL | |
| battery_kw | REAL | |
| battery_soc | REAL | |
| ev_kw | REAL | |
| heat_pump_kw | REAL | |

### usage_profiles

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| profile_id | TEXT | |
| day_type | TEXT | `weekday` \| `weekend` |
| hour | INTEGER | |
| slot_15min | INTEGER | 0–95 for 15-min slot in day |
| typical_load_kw | REAL | |
| typical_solar_kw | REAL | |
| typical_battery_kw | REAL | |
| typical_grid_kw | REAL | |

UNIQUE(profile_id, day_type, slot_15min)

### erse_tariff_definitions

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| tariff_type | TEXT | `simple` \| `two_rate` \| `three_rate` \| `four_rate` |
| valid_from | TEXT | ISO date (inclusive) |
| valid_to | TEXT | ISO date (inclusive) |
| loss_factor | REAL | Loss factor (default 1.08) |
| buy_spread_eur_kwh | REAL | Buy spread €/kWh (default 0.005) |
| vat_rate | REAL | VAT multiplier, e.g. 1.23 for 23% (default 1.23) |
| export_multiplier | REAL | Multiplier for spot when exporting (default 0.8) |

### portuguese_holidays

| Column | Type | Description |
|--------|------|-------------|
| date | TEXT | Primary key, ISO date (e.g. 2025-12-25) |
| name | TEXT | Holiday name (e.g. Christmas Day) |

Holidays are treated as sunday for tariff day_of_week resolution.

### grid_tariff_costs

| Column | Type | Description |
|--------|------|-------------|
| tariff_type | TEXT | simple \| two_rate \| three_rate \| four_rate |
| voltage_level | TEXT | low_voltage \| medium_voltage |
| season | TEXT | summer \| winter |
| day_of_week | TEXT | weekday \| saturday \| sunday |
| slot_name | TEXT | standard \| off_peak \| peak \| super_off_peak |
| start_time | TEXT | HH:MM 24h |
| end_time | TEXT | HH:MM 24h (exclusive) |
| grid_access_eur_kwh | REAL | Grid access (TAR) €/kWh |

Slot ranges embedded in each row. Query by (tariff_type, voltage_level, season, day_of_week), find row where hour ∈ [start_time, end_time). Source: ERSE_TAR_Complete_2026.xlsx.

### site_settings

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT | Primary key |
| value | TEXT | Setting value |

Keys: voltage_level, tariff_type (e.g. four_rate for medium_voltage), contracted_power_kva, assumed_daily_kwh.

## Indexes

- `idx_equipment_snapshots_ts` on `equipment_snapshots(timestamp)`
- `idx_three_phase_metrics_ts` on `three_phase_metrics(timestamp)`

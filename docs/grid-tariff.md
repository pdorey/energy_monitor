# Energy Monitor – Grid Tariff Module

> See [MANIFEST](MANIFEST.md) for full documentation index.

**Module**: [backend/app/grid_tariff.py](backend/app/grid_tariff.py)

Central module for grid tariff logic: Portuguese holidays, season/day resolution, slot lookup, and price calculation.

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| DAY_WEEKDAY | "weekday" | Monday–Friday |
| DAY_SATURDAY | "saturday" | Saturday |
| DAY_SUNDAY | "sunday" | Sunday; also used for holidays |
| SLOT_PEAK | "peak" | Tri-horary ponta |
| SLOT_STANDARD | "standard" | Tri-horary cheias |
| SLOT_OFF_PEAK | "off_peak" | Tri-horary vazio |
| SLOT_SUPER_OFF_PEAK | "super_off_peak" | Four-rate (medium_voltage) |
| DEFAULT_GRID_ACCESS_EUR_KWH | 0.05 | Fallback when DB empty |
| DEFAULT_EXPORT_MULTIPLIER | 0.8 | Fallback when DB empty |

## Functions

### get_season(dt: datetime) -> Literal["summer", "winter"]

Returns season for Portugal: summer from last Sunday of March to last Sunday of October; winter otherwise.

### get_day_of_week(dt: datetime, repo=None) -> Literal["weekday", "saturday", "sunday"]

Returns day type for tariff. Holidays (from portuguese_holidays) are treated as sunday. Monday–Friday = weekday, Saturday = saturday, Sunday = sunday.

### get_grid_access(tariff_type, voltage_level, season, day_of_week, hour, repo=None) -> float

Looks up grid_tariff_costs and returns grid_access_eur_kwh for the given hour. Finds row where hour ∈ [start_time, end_time). Handles wrap-around (e.g. 22:00–08:00).

### compute_buy_price(spot_price_eur_mwh, timestamp, tariff_type, repo=None, site_settings=None) -> float

Returns buy price (€/kWh) = ((spot/1000) × loss_factor + buy_spread + grid_access) × vat_rate. Uses site_settings or repo.get_site_settings() for voltage_level, tariff_type.

### compute_export_price(spot_price_eur_mwh, tariff_type, timestamp, repo=None) -> float

Returns export price (€/kWh) = spot/1000 × export_multiplier. Export multiplier from erse_tariff_definitions.

## Database Tables Used

| Table | Purpose |
|-------|---------|
| portuguese_holidays | Holiday dates → sunday |
| grid_tariff_costs | Grid access (TAR) by tariff_type, voltage_level, season, day_of_week, with slot ranges embedded |
| erse_tariff_definitions | loss_factor, buy_spread, vat_rate, export_multiplier |
| site_settings | voltage_level, tariff_type (e.g. four_rate for medium_voltage) |

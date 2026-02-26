# Energy Monitor – Price Flow

> See [MANIFEST](MANIFEST.md) for full documentation index.

## Grid Tariff Module

All price logic is in [backend/app/grid_tariff.py](backend/app/grid_tariff.py).

### Functions

| Function | Purpose |
|----------|---------|
| `get_season(dt)` | Summer (last Sun Mar → last Sun Oct) or winter |
| `get_day_of_week(dt, repo)` | weekday, saturday, sunday; holidays → sunday |
| `get_grid_access(tariff_type, voltage_level, season, day_of_week, hour, repo)` | Lookup from grid_tariff_costs (hour-in-range) |
| `compute_buy_price(spot, timestamp, tariff_type, repo, site_settings)` | ((spot/1000)*loss_factor + buy_spread + grid_access) × vat_rate |
| `compute_export_price(spot, tariff_type, timestamp, repo)` | spot/1000 × export_multiplier |

### Formulas

- **Buy price** = ((spot/1000) × loss_factor + buy_spread + grid_access) × vat_rate
- **Export price** = spot (€/kWh) × export_multiplier

### Data Flow

1. Timestamp → season (summer/winter), day_of_week (weekday/saturday/sunday; holidays=sunday)
2. (tariff_type, voltage_level, season, day_of_week, hour) → grid_access from grid_tariff_costs (find row where hour ∈ [start_time, end_time))
3. tariff_type → loss_factor, buy_spread, vat_rate, export_multiplier from erse_tariff_definitions

## Price Transformer

**Module**: [backend/app/transformers/prices.py](backend/app/transformers/prices.py)

**Function**: `compute_buy_export_prices(spot_price_eur_mwh, timestamp, tariff_type, repo, site_settings)`

Delegates to `grid_tariff.compute_buy_price` and `grid_tariff.compute_export_price`.

## Current Behaviour

### Simulator mode

- **Source**: Consumption.csv
- **Columns**: SPOT PRICE, TARIFF, BUY PRICE, EXPORT PRICE (all in €/kWh)
- **No calculation**: Values are read directly from the CSV
- **Fallback** (if BUY/EXPORT missing): `buy = spot * 3.2`, `export = spot * 0.8`
- **Display**: API multiplies by 1000 for €/MWh in the frontend

### Live mode

- **Spot price**: From `energy_prices` (ENTSO-E or ESIOS)
- **Buy/export**: `compute_buy_export_prices` uses grid_tariff; not yet wired into simulator or consumption-data
- **Consumption table**: Stores load, grid, solar, battery metrics (no price fields)

## Wiring (Simulator Live Prices Plan)

When implemented:
- Simulator will call `repo.get_spot_price_for_timestamp(timestamp)` and `compute_buy_export_prices(spot, timestamp, ...)` with site_settings
- Consumption-data and intraday-analytics will return computed prices

# Energy Monitor – ERSE Tariffs

> See [MANIFEST](MANIFEST.md) for full documentation index.

**ERSE** – Entidade Reguladora dos Serviços Energéticos – is the Portuguese energy regulator. It defines regulated tariffs for grid access and energy supply.

## Grid Tariff Module

Price calculation is handled by [backend/app/grid_tariff.py](backend/app/grid_tariff.py), which uses:

- **portuguese_holidays** – Holidays treated as sunday for day_of_week
- **grid_tariff_costs** – Grid access (TAR) €/kWh with slot ranges embedded (tariff_type, voltage_level, season, day_of_week, start_time, end_time)
- **erse_tariff_definitions** – loss_factor, buy_spread_eur_kwh, vat_rate, export_multiplier
- **site_settings** – voltage_level, tariff_type (e.g. four_rate for medium_voltage)

**Buy price** = ((spot/1000) × loss_factor + buy_spread + grid_access) × vat_rate

## Tri-Horary Periods (ERSE)

| Period | Summer | Winter |
|--------|--------|--------|
| off_peak (vazio) | 22:00–08:00 | 22:00–08:00 |
| standard (cheias) | 08:00–10:30, 13:00–19:30, 21:00–22:00 | 08:00–09:00, 10:30–18:00, 20:30–22:00 |
| peak (ponta) | 10:30–13:00, 19:30–21:00 | 09:00–10:30, 18:00–20:30 |

## ERSE API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/erse-tariff-definitions` | GET | List all (optional `?tariff_type=`) |
| `/api/erse-tariff-definitions` | POST | Create new definition |
| `/api/erse-tariff-definitions/{id}` | PUT | Update definition |
| `/api/erse-tariff-definitions/{id}` | DELETE | Delete definition |

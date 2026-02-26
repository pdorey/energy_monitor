# Energy Monitor – File Reference

> See [MANIFEST](MANIFEST.md) for full documentation index.

| Path | Purpose |
|------|---------|
| `Consumption.csv` | Simulator base data (96 rows, 15-min) |
| `Paths.csv` | Energy flow path definitions (path_id, from, to, status, lineColor) |
| `backend/app/collectors/` | Data collectors |
| `backend/app/grid_tariff.py` | Grid tariff logic (season, day, slot, prices) |
| `backend/app/transformers/prices.py` | Buy/export price (delegates to grid_tariff) |
| `backend/app/db/schema.sql` | SQLite schema |
| `backend/app/db/seeds/erse_tariff_definitions.sql` | ERSE tariff seed data |

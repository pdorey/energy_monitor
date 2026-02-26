-- Energy Monitor Database Schema
-- SQLite, 7-day retention

PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS weather (
    timestamp TEXT NOT NULL PRIMARY KEY,
    temperature_c REAL,
    relative_humidity REAL,
    cloud_cover REAL,
    shortwave_radiation_wm2 REAL,
    precipitation_mm REAL,
    wind_speed_kmh REAL,
    weather_code INTEGER
);

CREATE TABLE IF NOT EXISTS energy_prices (
    timestamp TEXT NOT NULL,
    spot_price_eur_mwh REAL NOT NULL,
    source TEXT NOT NULL,  -- 'entsoe' | 'esios'
    PRIMARY KEY (timestamp)
);

CREATE TABLE IF NOT EXISTS equipment_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    equipment_id TEXT NOT NULL,
    type TEXT NOT NULL,  -- solar | battery | grid | load | ev | heat_pump
    power_w REAL,
    soc_percent REAL,
    raw_json TEXT,
    UNIQUE(timestamp, equipment_id)
);

CREATE TABLE IF NOT EXISTS three_phase_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    equipment_id TEXT NOT NULL,
    l1_voltage_v REAL,
    l2_voltage_v REAL,
    l3_voltage_v REAL,
    l1_current_a REAL,
    l2_current_a REAL,
    l3_current_a REAL,
    l1_power_w REAL,
    l2_power_w REAL,
    l3_power_w REAL,
    total_power_w REAL,
    frequency_hz REAL,
    power_factor REAL
);

CREATE INDEX IF NOT EXISTS idx_equipment_snapshots_ts ON equipment_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_three_phase_metrics_ts ON three_phase_metrics(timestamp);

CREATE TABLE IF NOT EXISTS consumption (
    timestamp TEXT NOT NULL PRIMARY KEY,
    building_load_kw REAL,
    grid_kw REAL,
    solar_kw REAL,
    battery_kw REAL,
    battery_soc REAL,
    ev_kw REAL,
    heat_pump_kw REAL
);

CREATE TABLE IF NOT EXISTS usage_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    day_type TEXT NOT NULL,  -- weekday | weekend
    hour INTEGER NOT NULL,
    slot_15min INTEGER NOT NULL,  -- 0-95 for 15-min slot in day
    typical_load_kw REAL,
    typical_solar_kw REAL,
    typical_battery_kw REAL,
    typical_grid_kw REAL,
    UNIQUE(profile_id, day_type, slot_15min)
);

-- ERSE tariff parameters: loss_factor, buy_spread, vat_rate, export_multiplier.
DROP TABLE IF EXISTS erse_tariff_definitions;
CREATE TABLE erse_tariff_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tariff_type TEXT NOT NULL,       -- simple | two_rate | three_rate | four_rate
    valid_from TEXT NOT NULL,
    valid_to TEXT NOT NULL,
    loss_factor REAL DEFAULT 1.08,
    buy_spread_eur_kwh REAL DEFAULT 0.005,
    vat_rate REAL DEFAULT 1.23,     -- 23% VAT (multiply by 1.23)
    export_multiplier REAL DEFAULT 0.8,
    UNIQUE(tariff_type, valid_from)
);

-- Portuguese public holidays. Holidays treated as sunday for tariff day_of_week.
CREATE TABLE IF NOT EXISTS portuguese_holidays (
    date TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL
);

-- Grid access (TAR) costs with slot ranges embedded. Source: ERSE_TAR_Complete_2026.xlsx.
DROP TABLE IF EXISTS grid_tariff_costs;
CREATE TABLE grid_tariff_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tariff_type TEXT NOT NULL,       -- simple | two_rate | three_rate | four_rate
    voltage_level TEXT NOT NULL,     -- low_voltage | medium_voltage
    season TEXT NOT NULL,
    day_of_week TEXT NOT NULL,
    slot_name TEXT NOT NULL,         -- standard | off_peak | peak | super_off_peak
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    grid_access_eur_kwh REAL NOT NULL,
    UNIQUE(tariff_type, voltage_level, season, day_of_week, slot_name, start_time, end_time)
);

-- Removed: grid_tariff_slot_ranges, erse_capacity_tiers
DROP TABLE IF EXISTS grid_tariff_slot_ranges;
DROP TABLE IF EXISTS erse_capacity_tiers;

-- Site-level settings for tariff resolution.
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

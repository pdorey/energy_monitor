-- Default site settings for tariff resolution.
INSERT OR IGNORE INTO site_settings (key, value) VALUES
('voltage_level', 'medium_voltage'),
('contracted_power_kva', '250'),
('assumed_daily_kwh', '500'),
('tariff_type', 'four_rate');

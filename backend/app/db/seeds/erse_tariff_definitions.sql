-- ERSE tariff definitions: loss_factor, buy_spread, vat_rate, export_multiplier.
-- buy_spread_eur_kwh: €/kWh (same units as grid_access). Spot from Consumption.csv is €/MWh; formula converts via spot/1000.

INSERT OR IGNORE INTO erse_tariff_definitions (
    tariff_type, valid_from, valid_to,
    loss_factor, buy_spread_eur_kwh, vat_rate, export_multiplier
) VALUES
('simple', '2024-01-01', '2099-12-31', 1.08, 0.005, 1.23, 0.8),
('two_rate', '2024-01-01', '2099-12-31', 1.08, 0.005, 1.23, 0.8),
('three_rate', '2024-01-01', '2099-12-31', 1.08, 0.005, 1.23, 0.8),
('four_rate', '2024-01-01', '2099-12-31', 1.08, 0.005, 1.23, 0.8);

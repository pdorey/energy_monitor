-- ERSE tariff definitions: loss_factor, buy_spread, vat_rate, export_multiplier.
-- Grid access costs come from grid_tariff_costs (TAR).

INSERT OR IGNORE INTO erse_tariff_definitions (
    tariff_type, valid_from, valid_to,
    loss_factor, buy_spread_eur_kwh, vat_rate, export_multiplier
) VALUES
('simple', '2024-01-01', '2099-12-31', 1.08, 0.005, 1.23, 0.8),
('two_rate', '2024-01-01', '2099-12-31', 1.08, 0.005, 1.23, 0.8),
('three_rate', '2024-01-01', '2099-12-31', 1.08, 0.005, 1.23, 0.8),
('four_rate', '2024-01-01', '2099-12-31', 1.08, 0.005, 1.23, 0.8);

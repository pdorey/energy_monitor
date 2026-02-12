-- Initial ERSE tariff definitions for Portugal
-- Tariff types: Simple, Two-Rate, Three-Rate
-- peak_hours_json: {"peak": [[start,end],...], "super_off_peak": [[start,end],...]}
-- Hours in 24h format. Off-peak = rest.

INSERT INTO erse_tariff_definitions (
    tariff_type, valid_from, valid_to,
    peak_hours_json,
    access_charge_peak, access_charge_off_peak, access_charge_super_off_peak,
    export_multiplier
) VALUES
-- Simple: single rate (all hours use off_peak charge)
('simple', '2024-01-01', '2099-12-31',
 '{}',
 0.05, 0.05, 0.05,
 0.8),

-- Two-Rate: peak 9h-13h, 18h-22h; off-peak rest
('two_rate', '2024-01-01', '2099-12-31',
 '{"peak":[[9,13],[18,22]]}',
 0.08, 0.04, 0.04,
 0.8),

-- Three-Rate: peak 9h-13h, 18h-22h; super-off-peak 0h-7h; off-peak rest
('three_rate', '2024-01-01', '2099-12-31',
 '{"peak":[[9,13],[18,22]],"super_off_peak":[[0,7]]}',
 0.10, 0.05, 0.02,
 0.8);

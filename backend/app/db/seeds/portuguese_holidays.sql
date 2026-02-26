-- Portuguese public holidays (fixed + variable).
-- Holidays are treated as sunday for tariff day_of_week resolution.
-- Source: https://www.portaldasfinancas.gov.pt/

INSERT OR IGNORE INTO portuguese_holidays (date, name) VALUES
-- 2025
('2025-01-01', 'Ano Novo'),
('2025-04-18', 'Sexta-feira Santa'),
('2025-04-25', 'Dia da Liberdade'),
('2025-05-01', 'Dia do Trabalhador'),
('2025-06-10', 'Dia de Portugal'),
('2025-06-19', 'Corpo de Deus'),
('2025-08-15', 'Assunção de Nossa Senhora'),
('2025-10-05', 'Implantação da República'),
('2025-11-01', 'Todos os Santos'),
('2025-12-01', 'Restauração da Independência'),
('2025-12-08', 'Imaculada Conceição'),
('2025-12-25', 'Natal'),
-- 2026
('2026-01-01', 'Ano Novo'),
('2026-04-03', 'Sexta-feira Santa'),
('2026-04-25', 'Dia da Liberdade'),
('2026-05-01', 'Dia do Trabalhador'),
('2026-06-04', 'Corpo de Deus'),
('2026-06-10', 'Dia de Portugal'),
('2026-08-15', 'Assunção de Nossa Senhora'),
('2026-10-05', 'Implantação da República'),
('2026-11-01', 'Todos os Santos'),
('2026-12-01', 'Restauração da Independência'),
('2026-12-08', 'Imaculada Conceição'),
('2026-12-25', 'Natal'),
-- 2027
('2027-01-01', 'Ano Novo'),
('2027-03-26', 'Sexta-feira Santa'),
('2027-04-25', 'Dia da Liberdade'),
('2027-05-01', 'Dia do Trabalhador'),
('2027-05-27', 'Corpo de Deus'),
('2027-06-10', 'Dia de Portugal'),
('2027-08-15', 'Assunção de Nossa Senhora'),
('2027-10-05', 'Implantação da República'),
('2027-11-01', 'Todos os Santos'),
('2027-12-01', 'Restauração da Independência'),
('2027-12-08', 'Imaculada Conceição'),
('2027-12-25', 'Natal');

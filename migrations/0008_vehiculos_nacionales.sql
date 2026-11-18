-- Migración 0008: nueva línea de negocio "Arrendamiento de vehículos nacionales" (NATIONAL_VEHICLE_LEASING).
--
-- CETES y FOREIGN_VEHICLES ya no se ofrecen para contratos nuevos (lo controla la aplicación), pero siguen siendo
-- valores válidos aquí para conservar los contratos históricos.
--
-- El catálogo deja de vivir en un CHECK de columna (SQLite no permite modificarlo y cada cambio obligaba a
-- reemplazar la columna, ver 0006) y pasa a los triggers de alta y edición: agregar una línea en el futuro solo
-- requiere recrear estos dos triggers. Se reemplaza la columna una última vez sin CHECK; ninguna fila se borra ni
-- cambia de valor.
--
-- Reversión (solo si ningún contrato usa NATIONAL_VEHICLE_LEASING): recrear los triggers con la lista de 0006.

DROP TRIGGER IF EXISTS trg_investment_business_line_insert;
DROP TRIGGER IF EXISTS trg_investment_business_line_update;
DROP INDEX IF EXISTS idx_investments_business_line;

ALTER TABLE investments ADD COLUMN business_line_v3 TEXT NULL;
UPDATE investments SET business_line_v3 = business_line;
ALTER TABLE investments DROP COLUMN business_line;
ALTER TABLE investments RENAME COLUMN business_line_v3 TO business_line;

-- Línea obligatoria, del catálogo, y "CETES" coincide en ambas columnas (reglas de 0005 y 0006).
CREATE TRIGGER IF NOT EXISTS trg_investment_business_line_insert
BEFORE INSERT ON investments
WHEN NEW.business_line IS NULL
  OR NEW.business_line NOT IN ('ELECTRIC_MOBILITY', 'FOOD_TRUCKS', 'FOREIGN_VEHICLES', 'CARGO_TRANSPORT', 'TECH_SOLUTIONS',
                               'MECHANIC_LIFTS', 'IT_EQUIPMENT_LEASING', 'NATIONAL_VEHICLE_LEASING', 'CETES')
  OR ((NEW.business_line = 'CETES') <> (NEW.investment_type = 'CETES'))
BEGIN SELECT RAISE(ABORT, 'INVALID_BUSINESS_LINE'); END;

CREATE TRIGGER IF NOT EXISTS trg_investment_business_line_update
BEFORE UPDATE OF business_line, investment_type ON investments
WHEN NEW.business_line IS NULL
  OR NEW.business_line NOT IN ('ELECTRIC_MOBILITY', 'FOOD_TRUCKS', 'FOREIGN_VEHICLES', 'CARGO_TRANSPORT', 'TECH_SOLUTIONS',
                               'MECHANIC_LIFTS', 'IT_EQUIPMENT_LEASING', 'NATIONAL_VEHICLE_LEASING', 'CETES')
  OR ((NEW.business_line = 'CETES') <> (NEW.investment_type = 'CETES'))
BEGIN SELECT RAISE(ABORT, 'INVALID_BUSINESS_LINE'); END;

CREATE INDEX IF NOT EXISTS idx_investments_business_line ON investments(business_line);

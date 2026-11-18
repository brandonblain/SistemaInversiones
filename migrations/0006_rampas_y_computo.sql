-- Migración 0006: nuevas líneas de negocio "Rampas para taller mecánico" (MECHANIC_LIFTS) y
-- "Arrendamiento de equipo de cómputo" (IT_EQUIPMENT_LEASING).
--
-- "Vehículos extranjeros legalizados" (FOREIGN_VEHICLES) se retira del catálogo en la aplicación, pero sigue
-- siendo un valor válido aquí para conservar los contratos históricos.
--
-- SQLite no permite cambiar el CHECK de una columna y `investments` no se puede reconstruir (ver 0005), así que
-- se reemplaza solo la columna: se agrega con el CHECK nuevo, se copian los valores, se elimina la anterior y se
-- renombra. Ninguna fila se borra ni cambia de valor.
--
-- Reversión (solo si ningún contrato usa los códigos nuevos): repetir estos pasos con la lista de 0005.

DROP TRIGGER IF EXISTS trg_investment_business_line_insert;
DROP TRIGGER IF EXISTS trg_investment_business_line_update;
DROP INDEX IF EXISTS idx_investments_business_line;

ALTER TABLE investments ADD COLUMN business_line_v2 TEXT NULL
  CHECK (business_line_v2 IS NULL OR business_line_v2 IN ('ELECTRIC_MOBILITY', 'FOOD_TRUCKS', 'FOREIGN_VEHICLES', 'CARGO_TRANSPORT', 'TECH_SOLUTIONS', 'MECHANIC_LIFTS', 'IT_EQUIPMENT_LEASING', 'CETES'));
UPDATE investments SET business_line_v2 = business_line;
ALTER TABLE investments DROP COLUMN business_line;
ALTER TABLE investments RENAME COLUMN business_line_v2 TO business_line;

-- Mismas reglas que 0005: todo contrato tiene línea de negocio, y "CETES" coincide en ambas columnas.
CREATE TRIGGER IF NOT EXISTS trg_investment_business_line_insert
BEFORE INSERT ON investments
WHEN NEW.business_line IS NULL OR ((NEW.business_line = 'CETES') <> (NEW.investment_type = 'CETES'))
BEGIN SELECT RAISE(ABORT, 'INVALID_BUSINESS_LINE'); END;

CREATE TRIGGER IF NOT EXISTS trg_investment_business_line_update
BEFORE UPDATE OF business_line, investment_type ON investments
WHEN NEW.business_line IS NULL OR ((NEW.business_line = 'CETES') <> (NEW.investment_type = 'CETES'))
BEGIN SELECT RAISE(ABORT, 'INVALID_BUSINESS_LINE'); END;

CREATE INDEX IF NOT EXISTS idx_investments_business_line ON investments(business_line);

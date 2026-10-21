-- Migración 0005: líneas de negocio de Pimex Fortex Capital S.A.S. como giro de cada contrato.
--
-- Se agrega la columna `business_line` en lugar de reconstruir `investments`: producción ya tiene contratos,
-- y en D1 (llaves foráneas siempre activas) borrar la tabla dispararía el borrado en cascada de
-- `investment_terms` y chocaría con los libros protegidos (capital_movements no admite borrados).
--
--   business_line       giro mostrado y filtrado en el portal
--     ELECTRIC_MOBILITY   Movilidad y vehículos eléctricos
--     FOOD_TRUCKS         Food trucks y unidades móviles gastronómicas
--     FOREIGN_VEHICLES    Vehículos extranjeros legalizados
--     CARGO_TRANSPORT     Transporte de carga
--     TECH_SOLUTIONS      Soluciones tecnológicas y creativas
--     CETES               CETES − 1 punto (solo en pesos)
--   investment_type     columna heredada; solo distingue CETES (regla "CETES solo en pesos")
--
-- Los contratos existentes conservan todos sus datos; su giro se convierte así:
--   MOBILITY, ELECTRIC_VEHICLES → ELECTRIC_MOBILITY · FAST_FOOD → FOOD_TRUCKS · TRANSPORT → CARGO_TRANSPORT

ALTER TABLE investments ADD COLUMN business_line TEXT NULL
  CHECK (business_line IS NULL OR business_line IN ('ELECTRIC_MOBILITY', 'FOOD_TRUCKS', 'FOREIGN_VEHICLES', 'CARGO_TRANSPORT', 'TECH_SOLUTIONS', 'CETES'));

UPDATE investments SET business_line = CASE investment_type
  WHEN 'MOBILITY' THEN 'ELECTRIC_MOBILITY'
  WHEN 'ELECTRIC_VEHICLES' THEN 'ELECTRIC_MOBILITY'
  WHEN 'FAST_FOOD' THEN 'FOOD_TRUCKS'
  WHEN 'TRANSPORT' THEN 'CARGO_TRANSPORT'
  WHEN 'CETES' THEN 'CETES'
END;

-- Todo contrato tiene línea de negocio, y "CETES" coincide en ambas columnas.
CREATE TRIGGER IF NOT EXISTS trg_investment_business_line_insert
BEFORE INSERT ON investments
WHEN NEW.business_line IS NULL OR ((NEW.business_line = 'CETES') <> (NEW.investment_type = 'CETES'))
BEGIN SELECT RAISE(ABORT, 'INVALID_BUSINESS_LINE'); END;

CREATE TRIGGER IF NOT EXISTS trg_investment_business_line_update
BEFORE UPDATE OF business_line, investment_type ON investments
WHEN NEW.business_line IS NULL OR ((NEW.business_line = 'CETES') <> (NEW.investment_type = 'CETES'))
BEGIN SELECT RAISE(ABORT, 'INVALID_BUSINESS_LINE'); END;

CREATE INDEX IF NOT EXISTS idx_investments_business_line ON investments(business_line);

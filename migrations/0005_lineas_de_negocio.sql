-- Migración 0005: giros de contrato = líneas de negocio de Pimex Fortex Capital S.A.S.
--   ELECTRIC_MOBILITY  Movilidad y vehículos eléctricos
--   FOOD_TRUCKS        Food trucks y unidades móviles gastronómicas
--   FOREIGN_VEHICLES   Vehículos extranjeros legalizados
--   TECH_SOLUTIONS     Soluciones tecnológicas y creativas
--   CETES              Se conserva (CETES − 1 punto, solo en pesos)
--
-- Cambiar una restricción CHECK obliga a reconstruir `investments` (SQLite no altera CHECK).
-- Igual que 0003 y 0004, se detiene sin tocar nada si ya hay contratos capturados.
-- Producción tiene 0 contratos al crear esta migración. Bases locales: npm run setup:local -- --reset

CREATE TABLE _mig0005_requiere_base_sin_contratos (n INTEGER NOT NULL CHECK (n = 0));
INSERT INTO _mig0005_requiere_base_sin_contratos SELECT COUNT(*) FROM investments;
DROP TABLE _mig0005_requiere_base_sin_contratos;

DROP INDEX IF EXISTS idx_investments_user;
DROP TABLE investments;
CREATE TABLE investments (
  id TEXT PRIMARY KEY,
  investor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  investment_type TEXT NOT NULL CHECK (investment_type IN ('ELECTRIC_MOBILITY', 'FOOD_TRUCKS', 'FOREIGN_VEHICLES', 'TECH_SOLUTIONS', 'CETES')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'MATURED', 'CANCELLED')),
  currency TEXT NOT NULL CHECK (currency IN ('MXN', 'USD')),
  start_date TEXT NOT NULL,
  maturity_date TEXT NOT NULL,
  initial_capital_cents INTEGER NOT NULL CHECK (initial_capital_cents > 0),
  current_capital_cents INTEGER NOT NULL CHECK (current_capital_cents >= 0),
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (investment_type != 'CETES' OR currency = 'MXN'),
  CHECK (maturity_date > start_date)
);
CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(investor_user_id);

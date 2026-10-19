-- Migración 0004: nuevo tipo de inversión "Vehículos eléctricos" (ELECTRIC_VEHICLES).
--
-- Agregar un valor a una restricción CHECK obliga a reconstruir `investments` (SQLite no altera CHECK).
-- Igual que 0003, se aplica ANTES del primer despliegue y se detiene si ya hay inversiones, sin tocar nada.
-- Bases locales con datos de prueba: npm run setup:local -- --reset

CREATE TABLE _mig0004_requiere_base_sin_inversiones (n INTEGER NOT NULL CHECK (n = 0));
INSERT INTO _mig0004_requiere_base_sin_inversiones SELECT COUNT(*) FROM investments;
DROP TABLE _mig0004_requiere_base_sin_inversiones;

DROP INDEX IF EXISTS idx_investments_user;
DROP TABLE investments;
CREATE TABLE investments (
  id TEXT PRIMARY KEY,
  investor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  investment_type TEXT NOT NULL CHECK (investment_type IN ('FAST_FOOD', 'MOBILITY', 'TRANSPORT', 'ELECTRIC_VEHICLES', 'CETES')),
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

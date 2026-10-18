-- Migración 0003: moneda MXN/USD, inversión a CETES (tasa de referencia + diferencial) y modalidad ANUAL.
--
-- SQLite no permite modificar restricciones CHECK; hay que reconstruir `investments` e `investment_terms`.
-- Se aplica ANTES del primer despliegue (aún no existe información real). Para no arriesgar datos, la
-- migración se detiene si encuentra inversiones: el INSERT en la tabla guardia falla con
-- "CHECK constraint failed" y D1 revierte el archivo completo. Bases locales con datos de prueba:
--   npm run setup:local -- --reset

CREATE TABLE _mig0003_requiere_base_sin_inversiones (n INTEGER NOT NULL CHECK (n = 0));
INSERT INTO _mig0003_requiere_base_sin_inversiones SELECT COUNT(*) FROM investments;
DROP TABLE _mig0003_requiere_base_sin_inversiones;

-- ---------------------------------------------------------------------------
-- 1. Inversiones: moneda MXN/USD y producto CETES (solo en pesos)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_investments_user;
DROP TABLE investments;
CREATE TABLE investments (
  id TEXT PRIMARY KEY,
  investor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  investment_type TEXT NOT NULL CHECK (investment_type IN ('FAST_FOOD', 'MOBILITY', 'TRANSPORT', 'CETES')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'MATURED', 'CANCELLED')),
  currency TEXT NOT NULL CHECK (currency IN ('MXN', 'USD')),
  start_date TEXT NOT NULL,
  maturity_date TEXT NOT NULL,
  initial_capital_cents INTEGER NOT NULL CHECK (initial_capital_cents > 0),
  current_capital_cents INTEGER NOT NULL CHECK (current_capital_cents >= 0),
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- CETES son instrumentos en pesos
  CHECK (investment_type != 'CETES' OR currency = 'MXN'),
  CHECK (maturity_date > start_date)
);
CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(investor_user_id);

-- ---------------------------------------------------------------------------
-- 2. Términos: tasa FIJA o de REFERENCIA (CETES + diferencial) y modalidad ANUAL
--    REFERENCE: tasa aplicada = tasa CETES vigente al inicio del periodo + spread_bps (p. ej. −100 = −1 punto).
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_terms_investment;
DROP TABLE investment_terms;
CREATE TABLE investment_terms (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  rate_type TEXT NOT NULL CHECK (rate_type IN ('FIXED', 'REFERENCE')),
  fixed_annual_rate_bps INTEGER NULL CHECK (fixed_annual_rate_bps IS NULL OR (fixed_annual_rate_bps > 0 AND fixed_annual_rate_bps <= 100000)),
  reference_rate_code TEXT NULL CHECK (reference_rate_code IS NULL OR reference_rate_code IN ('CETES_28', 'CETES_91', 'CETES_182', 'CETES_364')),
  spread_bps INTEGER NULL CHECK (spread_bps IS NULL OR (spread_bps >= -10000 AND spread_bps <= 10000)),
  payout_frequency TEXT NOT NULL CHECK (payout_frequency IN ('MONTHLY', 'SEMIANNUAL', 'ANNUAL', 'AT_MATURITY')),
  day_count_convention TEXT NOT NULL DEFAULT 'ACT_365' CHECK (day_count_convention IN ('ACT_365', 'ACT_360', 'THIRTY_360')),
  capitalization_policy TEXT NOT NULL DEFAULT 'NONE' CHECK (capitalization_policy IN ('NONE', 'COMPOUND_TO_CAPITAL')),
  effective_from TEXT NOT NULL,
  effective_to TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (rate_type = 'FIXED' AND fixed_annual_rate_bps IS NOT NULL AND reference_rate_code IS NULL AND spread_bps IS NULL)
    OR (rate_type = 'REFERENCE' AND fixed_annual_rate_bps IS NULL AND reference_rate_code IS NOT NULL AND spread_bps IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_terms_investment ON investment_terms(investment_id);

-- ---------------------------------------------------------------------------
-- 3. Tasas de referencia (CETES publicadas por Banxico), capturadas por la administración
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reference_rates (
  id TEXT PRIMARY KEY,
  rate_code TEXT NOT NULL CHECK (rate_code IN ('CETES_28', 'CETES_91', 'CETES_182', 'CETES_364')),
  effective_date TEXT NOT NULL,
  annual_rate_bps INTEGER NOT NULL CHECK (annual_rate_bps > 0 AND annual_rate_bps <= 10000),
  source TEXT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rate_code, effective_date)
);

-- Cada devengo guarda qué tasa de referencia usó (reproducibilidad).
ALTER TABLE yield_entries ADD COLUMN reference_rate_id TEXT NULL REFERENCES reference_rates(id);

-- Una tasa ya usada por un rendimiento confirmado no se modifica ni se borra.
CREATE TRIGGER IF NOT EXISTS trg_reference_rate_locked_update
BEFORE UPDATE ON reference_rates
WHEN EXISTS (SELECT 1 FROM yield_entries WHERE reference_rate_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'REFERENCE_RATE_IN_USE'); END;

CREATE TRIGGER IF NOT EXISTS trg_reference_rate_locked_delete
BEFORE DELETE ON reference_rates
WHEN EXISTS (SELECT 1 FROM yield_entries WHERE reference_rate_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'REFERENCE_RATE_IN_USE'); END;

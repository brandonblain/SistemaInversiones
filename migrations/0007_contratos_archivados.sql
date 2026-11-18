-- Migración 0007: contratos archivados ("Eliminar" en el portal de administración).
--
-- Un contrato no se borra: su depósito inicial, rendimientos, pagos y documentos son registros contables que la
-- base protege. Al archivarlo se marca `archived_at` y deja de aparecer en listados, estadísticas, el portal del
-- cliente y los avisos automáticos. Restaurarlo vuelve `archived_at` a NULL.
--
-- Reversión: ALTER TABLE investments DROP COLUMN archived_at; (solo si ningún contrato está archivado).

ALTER TABLE investments ADD COLUMN archived_at TEXT NULL;

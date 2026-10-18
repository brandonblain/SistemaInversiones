// Errores de dominio con código estable para la UI. El manejador global los convierte en
// { success: false, error: { code, message, details } } con el estado HTTP indicado.

export class AppError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 423 | 429 | 500 | 503,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details: unknown = null) => new AppError(400, code, message, details);
export const notFound = (message = 'Recurso no encontrado.') => new AppError(404, 'NOT_FOUND', message);
export const forbidden = (message = 'Acceso no autorizado.') => new AppError(403, 'FORBIDDEN', message);
export const conflict = (code: string, message: string, details: unknown = null) => new AppError(409, code, message, details);

/**
 * Traduce errores de D1/SQLite (RAISE de triggers, UNIQUE, CHECK) a errores de dominio.
 * Devuelve null si no es un error reconocido.
 */
const TRIGGER_ERRORS: Record<string, AppError> = {
  YIELD_PERIOD_OVERLAP: conflict('YIELD_PERIOD_OVERLAP', 'El periodo se traslapa con un rendimiento automático ya confirmado.'),
  YIELD_ENTRY_IMMUTABLE: conflict('YIELD_ENTRY_IMMUTABLE', 'Las partidas confirmadas no se modifican; registre un ajuste o una reversión.'),
  YIELD_HAS_SETTLEMENTS: conflict('YIELD_HAS_SETTLEMENTS', 'No se puede reversar un rendimiento con pagos o reinversión asignados.'),
  ALLOCATION_YIELD_NOT_ALLOCATABLE: badRequest('ALLOCATION_YIELD_NOT_ALLOCATABLE', 'La partida no pertenece a la inversión o no está confirmada.'),
  ALLOCATION_EXCEEDS_PENDING: conflict('ALLOCATION_EXCEEDS_PENDING', 'La asignación excede el saldo pendiente de la partida.'),
  ALLOCATION_EXCEEDS_PAYMENT: badRequest('ALLOCATION_EXCEEDS_PAYMENT', 'El total asignado no puede ser mayor que el monto del pago.'),
  REINVEST_YIELD_NOT_ELIGIBLE: conflict('REINVEST_YIELD_NOT_ELIGIBLE', 'La partida no puede reinvertirse: debe estar confirmada, completa y sin pagos.'),
  AUDIT_LOG_IMMUTABLE: conflict('AUDIT_LOG_IMMUTABLE', 'La bitácora es inmutable.'),
  CAPITAL_MOVEMENT_IMMUTABLE: conflict('CAPITAL_MOVEMENT_IMMUTABLE', 'Los movimientos de capital son inmutables.'),
  PAYMENT_RECORD_IMMUTABLE: conflict('PAYMENT_RECORD_IMMUTABLE', 'Los pagos registrados no se eliminan.'),
  REFERENCE_RATE_IN_USE: conflict('REFERENCE_RATE_IN_USE', 'Esta tasa ya se usó en un rendimiento confirmado; no se puede modificar ni borrar.')
};

export function mapDbError(err: unknown): AppError | null {
  const msg = err instanceof Error ? err.message : String(err);
  for (const [key, appErr] of Object.entries(TRIGGER_ERRORS)) {
    if (msg.includes(key)) return appErr;
  }
  if (/UNIQUE constraint failed: payment_records/i.test(msg) || msg.includes('uq_payment_reference')) {
    return conflict('DUPLICATE_PAYMENT_REFERENCE', 'Ya existe un pago confirmado con esa referencia bancaria en esta inversión.');
  }
  if (/UNIQUE constraint failed: yield_entries\.reversal_of_yield_id/i.test(msg)) {
    return conflict('ALREADY_REVERSED', 'Esta partida ya fue reversada.');
  }
  if (/UNIQUE constraint failed: yield_entries/i.test(msg)) {
    return conflict('YIELD_ALREADY_CONFIRMED', 'Ya existe un rendimiento confirmado para ese periodo.');
  }
  if (/UNIQUE constraint failed: users\.email/i.test(msg)) {
    return conflict('EMAIL_ALREADY_EXISTS', 'El correo electrónico ya está registrado.');
  }
  if (/UNIQUE constraint failed: investments\.code/i.test(msg)) {
    return conflict('CODE_ALREADY_EXISTS', 'Ya existe una inversión con ese código.');
  }
  if (/UNIQUE constraint failed: reference_rates/i.test(msg)) {
    return conflict('REFERENCE_RATE_EXISTS', 'Ya existe una tasa capturada para ese plazo y fecha.');
  }
  if (/UNIQUE constraint failed: reinvestments/i.test(msg)) {
    return conflict('ALREADY_REINVESTED', 'Esta partida ya fue reinvertida.');
  }
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    return badRequest('INVALID_REFERENCE', 'Uno de los registros referenciados no existe.');
  }
  if (/CHECK constraint failed/i.test(msg)) {
    return badRequest('INVALID_INPUT', 'Algún valor está fuera del rango permitido.');
  }
  return null;
}

/** Ejecuta una operación de base de datos y convierte errores conocidos en AppError. */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    const mapped = mapDbError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

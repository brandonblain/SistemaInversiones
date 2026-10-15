// Servicio de Auditoría Inmutable
import { generateSecureToken } from './crypto';

export interface AuditLogEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAuditLog(db: D1Database, entry: AuditLogEntry): Promise<void> {
  const id = generateSecureToken('aud');
  const oldValuesJson = entry.oldValues ? JSON.stringify(entry.oldValues) : null;
  const newValuesJson = entry.newValues ? JSON.stringify(entry.newValues) : null;

  await db.prepare(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_values_json, new_values_json, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    entry.userId || null,
    entry.action,
    entry.entityType,
    entry.entityId,
    oldValuesJson,
    newValuesJson,
    entry.ipAddress || null,
    entry.userAgent || null
  ).run();
}

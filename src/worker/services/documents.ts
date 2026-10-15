// Servicio de Gestión de Documentos Privados en Cloudflare R2
import { generateSecureToken } from './crypto';
import { recordAuditLog } from './audit';

export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export interface UploadDocumentInput {
  investmentId: string;
  title: string;
  documentType: 'CONTRACT' | 'ADDENDUM' | 'ACCOUNT_STATEMENT' | 'TAX_RECEIPT' | 'OTHER';
  originalFilename: string;
  contentType: string;
  fileBuffer: ArrayBuffer | Uint8Array;
  uploadedByUserId: string;
}

export async function uploadPrivateDocument(
  db: D1Database,
  bucket: R2Bucket,
  input: UploadDocumentInput
): Promise<{ id: string; r2Key: string; sizeBytes: number }> {
  const sizeBytes = input.fileBuffer.byteLength;

  if (sizeBytes <= 0) {
    throw new Error('El archivo está vacío.');
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(`El archivo excede el tamaño máximo permitido de 15 MB (tamaño recibido: ${sizeBytes} bytes).`);
  }

  if (!ALLOWED_MIME_TYPES.includes(input.contentType)) {
    throw new Error(
      `Tipo de archivo no permitido: ${input.contentType}. Solo se admiten archivos PDF (.pdf) e imágenes (.png, .jpeg).`
    );
  }

  // Verificar que la inversión exista
  const inv = await db.prepare('SELECT id, investor_user_id FROM investments WHERE id = ?').bind(input.investmentId).first<{ id: string; investor_user_id: string }>();
  if (!inv) {
    throw new Error(`Inversión no encontrada: ${input.investmentId}`);
  }

  const docId = generateSecureToken('doc');
  const sanitizedFilename = input.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const r2Key = `investments/${input.investmentId}/${docId}_${sanitizedFilename}`;

  // 1. Guardar en R2 privado
  await bucket.put(r2Key, input.fileBuffer, {
    httpMetadata: { contentType: input.contentType },
    customMetadata: {
      documentId: docId,
      investmentId: input.investmentId,
      uploadedBy: input.uploadedByUserId
    }
  });

  // 2. Registrar en base de datos D1
  await db.prepare(
    `INSERT INTO investment_documents (
      id, investment_id, title, document_type, r2_key, original_filename,
      content_type, size_bytes, is_archived, uploaded_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).bind(
    docId,
    input.investmentId,
    input.title,
    input.documentType,
    r2Key,
    input.originalFilename,
    input.contentType,
    sizeBytes,
    input.uploadedByUserId
  ).run();

  // 3. Registrar evento de notificación para el inversionista
  const user = await db.prepare('SELECT email FROM users WHERE id = ?').bind(inv.investor_user_id).first<{ email: string }>();
  if (user) {
    await db.prepare(
      `INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview)
       VALUES (?, ?, 'DOCUMENT_UPLOADED', ?, 'Nuevo documento disponible en su portal', ?)`
    ).bind(
      generateSecureToken('not'),
      inv.investor_user_id,
      user.email,
      `Se ha publicado un nuevo documento (${input.title}) en su portal privado. Ingrese con sus credenciales para consultarlo.`
    ).run();
  }

  await recordAuditLog(db, {
    userId: input.uploadedByUserId,
    action: 'DOCUMENT_UPLOADED',
    entityType: 'DOCUMENT',
    entityId: docId,
    newValues: {
      investment_id: input.investmentId,
      title: input.title,
      r2_key: r2Key,
      size_bytes: sizeBytes
    }
  });

  return { id: docId, r2Key, sizeBytes };
}

export async function getDocumentStream(
  db: D1Database,
  bucket: R2Bucket,
  documentId: string,
  requestingUserId: string,
  requestingUserRole: 'ADMIN' | 'INVESTOR'
): Promise<{
  body: ReadableStream;
  contentType: string;
  originalFilename: string;
  sizeBytes: number;
}> {
  const doc = await db.prepare(
    `SELECT d.id, d.investment_id, d.title, d.r2_key, d.original_filename, d.content_type, d.size_bytes, d.is_archived,
            i.investor_user_id
     FROM investment_documents d
     JOIN investments i ON d.investment_id = i.id
     WHERE d.id = ?`
  ).bind(documentId).first<Record<string, unknown>>();

  if (!doc || Number(doc.is_archived) === 1) {
    throw new Error('Documento no encontrado o no disponible.');
  }

  // Autorización estricta: Inversionista solo puede acceder a documentos de sus propias inversiones
  if (requestingUserRole === 'INVESTOR' && String(doc.investor_user_id) !== requestingUserId) {
    throw new Error('No autorizado: no tiene permisos para consultar este documento.');
  }

  const r2Object = await bucket.get(String(doc.r2_key));
  if (!r2Object || !r2Object.body) {
    throw new Error('El archivo físico no se encuentra en el almacenamiento privado.');
  }

  return {
    body: r2Object.body,
    contentType: String(doc.content_type),
    originalFilename: String(doc.original_filename),
    sizeBytes: Number(doc.size_bytes)
  };
}

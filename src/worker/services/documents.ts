// Documentos privados en Cloudflare R2 — exclusivos de la administración.
// El bucket no es público: la única forma de leer un archivo es la ruta autenticada de administración.
import { AppError } from '../lib/errors';
import { auditStatement } from './audit';
import { generateSecureToken } from './crypto';

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_TYPES = ['CONTRACT', 'ADDENDUM', 'ACCOUNT_STATEMENT', 'TAX_RECEIPT', 'OTHER'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Tipo real del archivo por su firma (magic bytes); no se confía en el Content-Type del navegador. */
export function sniffContentType(bytes: Uint8Array): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

export interface UploadDocumentInput {
  investmentId: string;
  title: string;
  documentType: DocumentType;
  originalFilename: string;
  fileBuffer: ArrayBuffer;
  uploadedByUserId: string;
  ip: string | null;
}

export async function uploadPrivateDocument(db: D1Database, bucket: R2Bucket, input: UploadDocumentInput) {
  const bytes = new Uint8Array(input.fileBuffer);
  if (bytes.byteLength === 0) throw new AppError(400, 'EMPTY_FILE', 'El archivo está vacío.');
  if (bytes.byteLength > MAX_FILE_SIZE_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'El archivo excede el tamaño máximo de 15 MB.');
  const contentType = sniffContentType(bytes);
  if (!contentType) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Solo se admiten archivos PDF, PNG o JPEG válidos.');

  const inv = await db.prepare('SELECT id FROM investments WHERE id = ?').bind(input.investmentId).first<{ id: string }>();
  if (!inv) throw new AppError(404, 'NOT_FOUND', 'Contrato no encontrado.');

  const docId = generateSecureToken('doc');
  const safeName = (input.originalFilename || 'documento').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const r2Key = `investments/${input.investmentId}/${docId}_${safeName}`;

  await bucket.put(r2Key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { documentId: docId, investmentId: input.investmentId, uploadedBy: input.uploadedByUserId }
  });

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO investment_documents (id, investment_id, title, document_type, r2_key, original_filename, content_type, size_bytes, is_archived, uploaded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      ).bind(docId, input.investmentId, input.title, input.documentType, r2Key, input.originalFilename.slice(0, 200), contentType, bytes.byteLength, input.uploadedByUserId),
      auditStatement(db, {
        userId: input.uploadedByUserId,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'DOCUMENT',
        entityId: docId,
        ipAddress: input.ip,
        newValues: { investment_id: input.investmentId, title: input.title, document_type: input.documentType, size_bytes: bytes.byteLength, content_type: contentType }
      })
    ]);
  } catch (err) {
    // Sin registro en D1 no debe quedar un archivo huérfano en R2.
    await bucket.delete(r2Key).catch(() => undefined);
    throw err;
  }

  return { id: docId, size_bytes: bytes.byteLength, content_type: contentType };
}

export async function getDocumentForAdmin(db: D1Database, bucket: R2Bucket, documentId: string) {
  const doc = await db
    .prepare('SELECT id, r2_key, original_filename, content_type, size_bytes FROM investment_documents WHERE id = ? AND is_archived = 0')
    .bind(documentId)
    .first<{ id: string; r2_key: string; original_filename: string; content_type: string; size_bytes: number }>();
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Documento no encontrado o archivado.');
  const object = await bucket.get(doc.r2_key);
  if (!object?.body) throw new AppError(404, 'FILE_MISSING', 'El archivo no se encuentra en el almacenamiento privado.');
  return { body: object.body, contentType: doc.content_type, filename: doc.original_filename, sizeBytes: doc.size_bytes };
}

/** Archiva (no borra): el archivo se conserva en R2 para auditoría y deja de listarse. */
export async function archiveDocument(db: D1Database, documentId: string, adminId: string, ip: string | null) {
  const doc = await db.prepare('SELECT id, title, is_archived FROM investment_documents WHERE id = ?').bind(documentId).first<{ id: string; title: string; is_archived: number }>();
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Documento no encontrado.');
  if (doc.is_archived === 1) return;
  await db.batch([
    db.prepare('UPDATE investment_documents SET is_archived = 1 WHERE id = ?').bind(documentId),
    auditStatement(db, { userId: adminId, action: 'DOCUMENT_ARCHIVED', entityType: 'DOCUMENT', entityId: documentId, ipAddress: ip, newValues: { title: doc.title } })
  ]);
}

// Utilidades compartidas por los scripts de semilla (Node 20+, WebCrypto nativo).
// Usa el MISMO formato de hash que el Worker (src/worker/services/crypto.ts).

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:sha256:100000:${hex(salt)}:${hex(new Uint8Array(bits))}`;
}

export const id = (prefix) => `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(12))).map((x) => x.toString(16).padStart(2, '0')).join('')}`;

/** Literal SQL seguro para texto (o NULL). */
export const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

export function assertStrongPassword(pw, varName) {
  if (!pw || pw.length < 12 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    console.error(`Defina ${varName} con al menos 12 caracteres, letras y números.`);
    process.exit(1);
  }
}

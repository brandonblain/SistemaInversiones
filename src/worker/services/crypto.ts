// Servicio de Criptografía Seguro y Compatible con Cloudflare Workers (WebCrypto standard)

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const iterations = 100000;
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `pbkdf2:sha256:${iterations}:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    return false;
  }

  const iterations = parseInt(parts[2] || '100000', 10);
  const saltHex = parts[3] || '';
  const expectedHashHex = parts[4] || '';

  const salt = new Uint8Array(
    (saltHex.match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16))
  );

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  const actualHashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return constantTimeCompare(expectedHashHex, actualHashHex);
}

export async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSecureToken(prefix = ''): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return prefix ? `${prefix}_${token}` : token;
}

export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Generación y Verificación de Códigos TOTP (RFC 6238) para MFA Admin
export async function generateTotpCode(secretBase32: string, timeStepSeconds = 30): Promise<string> {
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStepSeconds);
  return computeHotp(secretBase32, counter);
}

export async function verifyTotpCode(secretBase32: string, token: string, window = 1): Promise<boolean> {
  const epoch = Math.floor(Date.now() / 1000);
  const currentCounter = Math.floor(epoch / 30);

  for (let i = -window; i <= window; i++) {
    const validCode = await computeHotp(secretBase32, currentCounter + i);
    if (constantTimeCompare(validCode, token.trim())) {
      return true;
    }
  }
  return false;
}

async function computeHotp(secretBase32: string, counter: number): Promise<string> {
  const keyBytes = base32ToBytes(secretBase32);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  // Escribir 64-bit integer big-endian
  view.setUint32(4, counter, false);

  const signature = await crypto.subtle.sign('HMAC', key, counterBuffer);
  const hmac = new Uint8Array(signature);
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;

  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export function generateBase32Secret(length = 20): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += alphabet[(bytes[i] ?? 0) % 32];
  }
  return result;
}

function base32ToBytes(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i] ?? '');
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

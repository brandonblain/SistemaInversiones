// Genera el SQL de los usuarios iniciales de una base NUEVA (administración + cuentas de inversionistas
// sin inversiones), con una contraseña temporal aleatoria por usuario. Mismo formato que el portal:
// users + investor_profiles + bitácora (ADMIN_BOOTSTRAPPED / INVESTOR_CREATED).
//
// Uso (las salidas contienen credenciales: escríbalas FUERA del repositorio y bórrelas al terminar):
//   node scripts/create-initial-users.mjs usuarios.json <carpeta-salida>
//   npx wrangler d1 execute DB --env production --remote --file=<carpeta-salida>/usuarios-iniciales.sql
//
// usuarios.json: [{ "role": "ADMIN" | "INVESTOR", "email": "...", "full_name": "..." }, ...]
// Debe incluir al menos un ADMIN; las altas de inversionistas quedan registradas a su nombre.
// Si algún correo ya existe, la restricción UNIQUE de users.email detiene la carga.
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword, id, q } from './lib-sql.mjs';

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
  console.error('Uso: node scripts/create-initial-users.mjs usuarios.json <carpeta-salida>');
  process.exit(1);
}
if (path.resolve(outDir).startsWith(path.resolve(process.cwd()))) {
  console.error('La carpeta de salida debe estar FUERA del repositorio (contiene contraseñas).');
  process.exit(1);
}

const users = JSON.parse(fs.readFileSync(input, 'utf8'));
const isEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const emails = new Set();
for (const u of users) {
  if (!['ADMIN', 'INVESTOR'].includes(u.role)) throw new Error(`Rol no válido: ${u.role}`);
  if (!isEmail(u.email)) throw new Error(`Correo no válido: ${u.email}`);
  if (typeof u.full_name !== 'string' || u.full_name.trim().length < 3 || u.full_name.length > 150) throw new Error(`Nombre no válido: ${u.full_name}`);
  const e = u.email.toLowerCase();
  if (emails.has(e)) throw new Error(`Correo repetido: ${e}`);
  emails.add(e);
}
const admins = users.filter((u) => u.role === 'ADMIN');
if (!admins.length) throw new Error('Incluya al menos un usuario ADMIN.');

/** Contraseña temporal: 16 caracteres sin ambiguos (0/O, 1/l/I), con mayúsculas, minúsculas y números. */
function tempPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789'];
  const all = sets.join('');
  const pick = (chars) => {
    const lim = 256 - (256 % chars.length); // sin sesgo de módulo
    for (;;) {
      const [b] = crypto.getRandomValues(new Uint8Array(1));
      if (b < lim) return chars[b % chars.length];
    }
  };
  for (;;) {
    const pw = Array.from({ length: 16 }, () => pick(all)).join('');
    if (sets.every((s) => [...pw].some((ch) => s.includes(ch)))) return pw;
  }
}

const sql = ['-- Usuarios iniciales (generado por scripts/create-initial-users.mjs). Solo hashes PBKDF2; sin contraseñas.'];
const creds = [];
let creatorId = null;
for (const u of [...admins, ...users.filter((x) => x.role === 'INVESTOR')]) {
  const email = u.email.toLowerCase();
  const name = u.full_name.trim();
  const password = tempPassword();
  const userId = id('usr');
  creds.push({ role: u.role, email, name, password });
  sql.push(`\n-- ${u.role === 'ADMIN' ? 'Administración' : 'Inversionista'}: ${email} (${name})`);
  if (u.role === 'ADMIN') {
    creatorId ??= userId;
    sql.push(`INSERT INTO users (id, email, password_hash, role, is_active, mfa_enabled) VALUES (${q(userId)}, ${q(email)}, ${q(await hashPassword(password))}, 'ADMIN', 1, 0);`);
    sql.push(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_values_json) VALUES (${q(id('aud'))}, NULL, 'ADMIN_BOOTSTRAPPED', 'USER', ${q(userId)}, ${q(JSON.stringify({ email, name }))});`
    );
  } else {
    sql.push(`INSERT INTO users (id, email, password_hash, role, is_active) VALUES (${q(userId)}, ${q(email)}, ${q(await hashPassword(password))}, 'INVESTOR', 1);`);
    sql.push(`INSERT INTO investor_profiles (id, user_id, full_name) VALUES (${q(id('prof'))}, ${q(userId)}, ${q(name)});`);
    sql.push(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_values_json) VALUES (${q(id('aud'))}, ${q(creatorId)}, 'INVESTOR_CREATED', 'USER', ${q(userId)}, ${q(JSON.stringify({ email, full_name: name, beneficiaries: [], source: 'carga inicial' }))});`
    );
  }
}

fs.mkdirSync(outDir, { recursive: true });
const sqlPath = path.join(outDir, 'usuarios-iniciales.sql');
const credPath = path.join(outDir, 'credenciales-temporales.txt');
fs.writeFileSync(sqlPath, `${sql.join('\n')}\n`);
fs.writeFileSync(
  credPath,
  [
    'CONTRASEÑAS TEMPORALES — guárdelas en un gestor de contraseñas y BORRE este archivo.',
    'Cada persona debe cambiarla al entrar (Perfil › Cambiar contraseña). Administración: activar MFA en Seguridad.',
    '',
    ...creds.map((c) => `${c.role.padEnd(8)}  ${c.email.padEnd(44)}  ${c.password}   (${c.name})`),
    ''
  ].join('\n')
);
console.log(`SQL:          ${sqlPath}\nCredenciales: ${credPath}\nUsuarios:     ${creds.length} (${admins.length} administración, ${creds.length - admins.length} inversionistas)`);

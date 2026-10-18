// Genera el SQL para crear el PRIMER administrador (sin MFA; lo activará en su primer acceso desde
// Administración › Seguridad). La contraseña se lee de una variable de entorno para no dejarla en el historial.
//
// Uso:
//   ADMIN_INITIAL_PASSWORD='...' node scripts/create-admin.mjs admin@dominio.com "Nombre" > admin.sql
//   npx wrangler d1 execute DB --env production --remote --file=admin.sql
//   (borre admin.sql al terminar)
import { assertStrongPassword, hashPassword, id, q } from './lib-sql.mjs';

const [email, name = 'Administración'] = process.argv.slice(2);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: ADMIN_INITIAL_PASSWORD=... node scripts/create-admin.mjs correo@dominio.com "Nombre"');
  process.exit(1);
}
const password = process.env.ADMIN_INITIAL_PASSWORD;
assertStrongPassword(password, 'ADMIN_INITIAL_PASSWORD');

const userId = id('usr');
console.log(`-- Administrador inicial: ${email.toLowerCase()} (${name})`);
console.log(
  `INSERT INTO users (id, email, password_hash, role, is_active, mfa_enabled) VALUES (${q(userId)}, ${q(email.toLowerCase())}, ${q(await hashPassword(password))}, 'ADMIN', 1, 0);`
);
console.log(
  `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_values_json) VALUES (${q(id('aud'))}, NULL, 'ADMIN_BOOTSTRAPPED', 'USER', ${q(userId)}, ${q(JSON.stringify({ email: email.toLowerCase(), name }))});`
);

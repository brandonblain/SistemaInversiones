// Prepara la base D1 LOCAL para probar el portal completo: aplica migraciones y carga los datos FICTICIOS
// (Héctor Galeana, Cesar Daniel, Victoria Pérez y admin@ficticio.test).
//
// Uso:  npm run setup:local            (no recarga si ya hay usuarios)
//       npm run setup:local -- --reset (borra la base local y la vuelve a crear)
// Contraseña de los usuarios de prueba: SEED_PASSWORD o, por omisión, "Ficticio123!" (solo local).
import { execSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8', ...opts });

if (process.argv.includes('--reset')) {
  const d1State = join('.wrangler', 'state', 'v3', 'd1');
  if (existsSync(d1State)) {
    rmSync(d1State, { recursive: true, force: true });
    console.log('Base D1 local eliminada.');
  }
}

console.log('\n1) Migraciones locales');
run('npx wrangler d1 migrations apply DB --local');

const out = run('npx wrangler d1 execute DB --local --json --command "SELECT COUNT(*) AS n FROM users"', { capture: true });
const count = JSON.parse(out)[0]?.results?.[0]?.n ?? 0;
if (count > 0) {
  console.log(`\nLa base local ya tiene ${count} usuarios; no se recarga la semilla (use --reset para empezar de cero).`);
  process.exit(0);
}

console.log('\n2) Datos FICTICIOS');
const password = process.env.SEED_PASSWORD || 'Ficticio123!';
const sql = run('node scripts/seed-staging.mjs', { capture: true, env: { ...process.env, SEED_PASSWORD: password } });
const dir = mkdtempSync(join(tmpdir(), 'seed-'));
const file = join(dir, 'seed.sql');
writeFileSync(file, sql);
try {
  run(`npx wrangler d1 execute DB --local --file="${file}"`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`
Listo. Usuarios de prueba (contraseña: ${process.env.SEED_PASSWORD ? '(la de SEED_PASSWORD)' : password}):
  admin@ficticio.test            Administración (MFA desactivado solo en local)
  hector.galeana@ficticio.test   Inversionista
  cesar.daniel@ficticio.test     Inversionista
  victoria.perez@ficticio.test   Inversionista
`);

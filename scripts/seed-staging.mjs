// Datos FICTICIOS para staging/desarrollo local, iguales a los del modo mock del frontend.
// Nombres tomados de los "Socios capital" del material comercial; correos, RFC, domicilios y montos son inventados.
// NUNCA ejecutar en producción.
//
// Uso:
//   SEED_PASSWORD='...' node scripts/seed-staging.mjs > seed.sql
//   npx wrangler d1 execute DB --local --file=seed.sql            (desarrollo)
//   npx wrangler d1 execute DB --env staging --remote --file=seed.sql
//
// Crea: admin@ficticio.test (sin MFA; actívelo en Seguridad) e inversionistas con sus inversiones y capital inicial.
// Los rendimientos y pagos se generan después desde la UI (vista previa → confirmar), como en operación real.
import { assertStrongPassword, hashPassword, id, q } from './lib-sql.mjs';

const password = process.env.SEED_PASSWORD;
assertStrongPassword(password, 'SEED_PASSWORD');
const hash = await hashPassword(password);
const out = ['-- SEMILLA FICTICIA (staging / local). No usar en producción.'];

const adminId = 'usr_fict_admin';
out.push(`INSERT INTO users (id, email, password_hash, role, is_active, mfa_enabled) VALUES (${q(adminId)}, 'admin@ficticio.test', ${q(hash)}, 'ADMIN', 1, 0);`);

const investors = [
  {
    id: 'usr_fict_01', email: 'hector.galeana@ficticio.test', name: 'Héctor Galeana', phone: '+52 55 0000 0001', address: 'Domicilio FICTICIO, Ciudad de México',
    beneficiaries: [['Beneficiaria FICTICIA Galeana', 'SPOUSE', 6000], ['Beneficiario FICTICIO Galeana', 'CHILD', 4000]],
    investments: [
      { code: 'FICT-2026-001', type: 'MOBILITY', start: '2026-01-15', end: '2027-01-15', capital: 25_000_000, bps: 1600, freq: 'MONTHLY', cap: 'NONE' },
      { code: 'FICT-2025-002', type: 'TRANSPORT', start: '2025-11-01', end: '2027-05-01', capital: 40_000_000, bps: 2500, freq: 'SEMIANNUAL', cap: 'COMPOUND_TO_CAPITAL' },
      { code: 'FICT-2025-003', type: 'FAST_FOOD', start: '2025-01-10', end: '2026-01-10', capital: 10_000_000, bps: 1300, freq: 'AT_MATURITY', cap: 'NONE', status: 'MATURED' }
    ]
  },
  {
    id: 'usr_fict_02', email: 'cesar.daniel@ficticio.test', name: 'Cesar Daniel', phone: '+52 33 0000 0002', address: 'Domicilio FICTICIO, Guadalajara, Jalisco',
    beneficiaries: [['Beneficiaria FICTICIA Daniel', 'PARENT', 10000]],
    investments: [{ code: 'FICT-2026-004', type: 'TRANSPORT', start: '2026-03-01', end: '2027-09-01', capital: 40_000_000, bps: 2500, freq: 'MONTHLY', cap: 'NONE' }]
  },
  {
    id: 'usr_fict_03', email: 'victoria.perez@ficticio.test', name: 'Victoria Pérez', phone: '+52 222 000 0003', address: 'Domicilio FICTICIO, Puebla, Puebla',
    beneficiaries: [['Beneficiario FICTICIO Pérez', 'CHILD', 5000], ['Beneficiaria FICTICIA Pérez', 'CHILD', 5000]],
    investments: [{ code: 'FICT-2026-005', type: 'FAST_FOOD', start: '2026-05-01', end: '2027-05-01', capital: 10_000_000, bps: 1300, freq: 'MONTHLY', cap: 'NONE' }]
  }
];

for (const inv of investors) {
  out.push(`INSERT INTO users (id, email, password_hash, role, is_active) VALUES (${q(inv.id)}, ${q(inv.email)}, ${q(hash)}, 'INVESTOR', 1);`);
  out.push(
    `INSERT INTO investor_profiles (id, user_id, full_name, rfc, phone, address) VALUES (${q(id('prof'))}, ${q(inv.id)}, ${q(inv.name)}, 'XAXX010101000', ${q(inv.phone)}, ${q(inv.address)});`
  );
  for (const [name, rel, bps] of inv.beneficiaries) {
    out.push(
      `INSERT INTO investor_beneficiaries (id, investor_user_id, full_name, relationship, percentage_bps, created_by_user_id) VALUES (${q(id('ben'))}, ${q(inv.id)}, ${q(name)}, ${q(rel)}, ${bps}, ${q(adminId)});`
    );
  }
  for (const i of inv.investments) {
    const invId = id('inv');
    out.push(
      `INSERT INTO investments (id, investor_user_id, code, investment_type, status, start_date, maturity_date, initial_capital_cents, current_capital_cents, notes) VALUES (${q(invId)}, ${q(inv.id)}, ${q(i.code)}, ${q(i.type)}, ${q(i.status ?? 'ACTIVE')}, ${q(i.start)}, ${q(i.end)}, ${i.capital}, ${i.capital}, 'Contrato FICTICIO de staging');`
    );
    out.push(
      `INSERT INTO investment_terms (id, investment_id, fixed_annual_rate_bps, payout_frequency, day_count_convention, capitalization_policy, effective_from) VALUES (${q(id('trm'))}, ${q(invId)}, ${i.bps}, ${q(i.freq)}, 'ACT_365', ${q(i.cap)}, ${q(i.start)});`
    );
    out.push(
      `INSERT INTO capital_movements (id, investment_id, movement_type, amount_cents, effective_date, notes, recorded_by_user_id) VALUES (${q(id('mov'))}, ${q(invId)}, 'INITIAL_DEPOSIT', ${i.capital}, ${q(i.start)}, 'Capital inicial FICTICIO', ${q(adminId)});`
    );
  }
}

console.log(out.join('\n'));

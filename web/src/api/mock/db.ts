// ⚠️ DATOS INEQUÍVOCAMENTE FICTICIOS — solo para prototipo y pruebas de interfaz.
// Este módulo simula al backend en memoria. Cualquier cifra que se derive aquí es parte del
// servidor simulado, NO de la interfaz: la UI solo muestra lo que recibe de la API.

import type {
  AuditLogRow,
  Beneficiary,
  InvestmentType,
  CapitalizationPolicy,
  DayCountConvention,
  DocumentType,
  InvestmentStatus,
  NotificationEvent,
  PayoutFrequency,
  YieldSource,
  YieldStatus
} from '../types';

export const MOCK_PASSWORD = 'Ficticio123!';
export const MOCK_MFA_CODE = '123456';

export interface MockUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'INVESTOR';
  is_active: boolean;
  mfa_enabled: boolean;
  password: string;
  created_at: string;
  profile: { id: string; full_name: string; rfc: string | null; phone: string | null; address: string | null } | null;
  beneficiaries: Beneficiary[];
}

export interface MockInvestment {
  id: string;
  investor_user_id: string;
  code: string;
  investment_type: InvestmentType;
  status: InvestmentStatus;
  start_date: string;
  maturity_date: string;
  initial_capital_cents: number;
  current_capital_cents: number;
  rate_bps: number;
  payout_frequency: PayoutFrequency;
  day_count_convention: DayCountConvention;
  capitalization_policy: CapitalizationPolicy;
  notes: string | null;
  created_at: string;
}

export interface MockYield {
  id: string;
  investment_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  status: YieldStatus;
  source: YieldSource;
  note: string | null;
  reversal_of?: string;
  created_at: string;
}

export interface MockPayment {
  id: string;
  investment_id: string;
  amount_cents: number;
  paid_at: string;
  status: 'CONFIRMED' | 'CANCELLED';
  reference: string;
  notes: string | null;
  allocations: Array<{ yield_entry_id: string; amount_cents: number }>;
}

export interface MockCapitalMovement {
  id: string;
  investment_id: string;
  movement_type: 'INITIAL_DEPOSIT' | 'CAPITAL_CONTRIBUTION' | 'REINVESTMENT_CREDIT';
  amount_cents: number;
  effective_date: string;
  yield_entry_id?: string;
}

export interface MockDocument {
  id: string;
  investment_id: string;
  title: string;
  document_type: DocumentType;
  original_filename: string;
  size_bytes: number;
  content_type: string;
  created_at: string;
  is_archived: boolean;
}

export interface MockNotification extends NotificationEvent {
  user_id: string;
}

export interface MockDb {
  users: MockUser[];
  investments: MockInvestment[];
  yields: MockYield[];
  payments: MockPayment[];
  movements: MockCapitalMovement[];
  documents: MockDocument[];
  notifications: MockNotification[];
  audit: AuditLogRow[];
  seq: number;
}

// ---------- utilidades del servidor simulado ----------

const DAY_MS = 86_400_000;
const toUtc = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y!, m! - 1, day!);
};
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1 + months, d!));
  return dt.toISOString().slice(0, 10);
}
/** Simulación ilustrativa (interés simple, días reales/base). NO es la convención aprobada. */
export function mockYieldAmount(capital: number, bps: number, start: string, end: string, base = 365) {
  return Math.round((capital * bps * daysBetween(start, end)) / (10_000 * base));
}

export function createMockDb(): MockDb {
  const db: MockDb = {
    users: [
      {
        id: 'usr_fict_admin',
        email: 'admin@ficticio.test',
        role: 'ADMIN',
        is_active: true,
        mfa_enabled: true,
        password: MOCK_PASSWORD,
        created_at: '2025-12-01T16:00:00Z',
        profile: null,
        beneficiaries: []
      },
      {
        // Socio capital (material comercial): "Llevo 4 años con este producto financiero y he logrado duplicar mi capital."
        id: 'usr_fict_01',
        email: 'hector.galeana@ficticio.test',
        role: 'INVESTOR',
        is_active: true,
        mfa_enabled: false,
        password: MOCK_PASSWORD,
        created_at: '2022-10-03T16:00:00Z',
        profile: {
          id: 'prof_fict_01',
          full_name: 'Héctor Galeana',
          rfc: 'XAXX010101000',
          phone: '+52 55 0000 0001',
          address: 'Domicilio FICTICIO, Ciudad de México'
        },
        beneficiaries: [
          { id: 'ben_fict_01', full_name: 'Beneficiaria FICTICIA Galeana', relationship: 'SPOUSE', percentage_bps: 6000 },
          { id: 'ben_fict_02', full_name: 'Beneficiario FICTICIO Galeana', relationship: 'CHILD', percentage_bps: 4000 }
        ]
      },
      {
        // Socio capital: "Con mi inversión en dos años logré pagar las mensualidades de mi crédito de auto."
        id: 'usr_fict_02',
        email: 'cesar.daniel@ficticio.test',
        role: 'INVESTOR',
        is_active: true,
        mfa_enabled: false,
        password: MOCK_PASSWORD,
        created_at: '2024-10-07T16:00:00Z',
        profile: {
          id: 'prof_fict_02',
          full_name: 'Cesar Daniel',
          rfc: 'XAXX010101000',
          phone: '+52 33 0000 0002',
          address: 'Domicilio FICTICIO, Guadalajara, Jalisco'
        },
        beneficiaries: [{ id: 'ben_fict_03', full_name: 'Beneficiaria FICTICIA Daniel', relationship: 'PARENT', percentage_bps: 10000 }]
      },
      {
        // Socia capital: "Como jubilada he logrado crear un ingreso pasivo mensual incrementando mi pensión."
        id: 'usr_fict_03',
        email: 'victoria.perez@ficticio.test',
        role: 'INVESTOR',
        is_active: true,
        mfa_enabled: false,
        password: MOCK_PASSWORD,
        created_at: '2026-04-20T16:00:00Z',
        profile: {
          id: 'prof_fict_03',
          full_name: 'Victoria Pérez',
          rfc: 'XAXX010101000',
          phone: '+52 222 000 0003',
          address: 'Domicilio FICTICIO, Puebla, Puebla'
        },
        beneficiaries: [
          { id: 'ben_fict_04', full_name: 'Beneficiario FICTICIO Pérez', relationship: 'CHILD', percentage_bps: 5000 },
          { id: 'ben_fict_05', full_name: 'Beneficiaria FICTICIA Pérez', relationship: 'CHILD', percentage_bps: 5000 }
        ]
      }
    ],
    investments: [
      {
        id: 'inv_fict_001', investor_user_id: 'usr_fict_01', code: 'FICT-2026-001', investment_type: 'MOBILITY', status: 'ACTIVE',
        start_date: '2026-01-15', maturity_date: '2027-01-15',
        initial_capital_cents: 25_000_000, current_capital_cents: 25_000_000, rate_bps: 1600,
        payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE',
        notes: 'Contrato FICTICIO de prueba', created_at: '2026-01-15T17:00:00Z'
      },
      {
        id: 'inv_fict_002', investor_user_id: 'usr_fict_01', code: 'FICT-2025-002', investment_type: 'TRANSPORT', status: 'ACTIVE',
        start_date: '2025-11-01', maturity_date: '2027-05-01',
        initial_capital_cents: 40_000_000, current_capital_cents: 40_000_000, rate_bps: 2500,
        payout_frequency: 'SEMIANNUAL', day_count_convention: 'ACT_365', capitalization_policy: 'COMPOUND_TO_CAPITAL',
        notes: null, created_at: '2025-11-01T17:00:00Z'
      },
      {
        id: 'inv_fict_003', investor_user_id: 'usr_fict_01', code: 'FICT-2025-003', investment_type: 'FAST_FOOD', status: 'MATURED',
        start_date: '2025-01-10', maturity_date: '2026-01-10',
        initial_capital_cents: 10_000_000, current_capital_cents: 10_000_000, rate_bps: 1300,
        payout_frequency: 'AT_MATURITY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE',
        notes: null, created_at: '2025-01-10T17:00:00Z'
      },
      {
        id: 'inv_fict_004', investor_user_id: 'usr_fict_02', code: 'FICT-2026-004', investment_type: 'TRANSPORT', status: 'ACTIVE',
        start_date: '2026-03-01', maturity_date: '2027-09-01',
        initial_capital_cents: 40_000_000, current_capital_cents: 40_000_000, rate_bps: 2500,
        payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE',
        notes: null, created_at: '2026-03-01T17:00:00Z'
      },
      {
        id: 'inv_fict_005', investor_user_id: 'usr_fict_03', code: 'FICT-2026-005', investment_type: 'FAST_FOOD', status: 'ACTIVE',
        start_date: '2026-05-01', maturity_date: '2027-05-01',
        initial_capital_cents: 10_000_000, current_capital_cents: 10_000_000, rate_bps: 1300,
        payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE',
        notes: 'Pago mensual para complementar pensión (FICTICIO)', created_at: '2026-05-01T17:00:00Z'
      }
    ],
    yields: [],
    payments: [],
    movements: [],
    documents: [],
    notifications: [],
    audit: [],
    seq: 1
  };

  const id = (p: string) => `${p}_fict_${String(db.seq++).padStart(4, '0')}`;

  for (const inv of db.investments) {
    db.movements.push({
      id: id('mov'), investment_id: inv.id, movement_type: 'INITIAL_DEPOSIT',
      amount_cents: inv.initial_capital_cents, effective_date: inv.start_date
    });
  }

  const addYield = (invId: string, start: string, end: string, capital: number, bps: number) => {
    const y: MockYield = {
      id: id('yid'), investment_id: invId, period_start: start, period_end: end,
      amount_cents: mockYieldAmount(capital, bps, start, end), status: 'CONFIRMED', source: 'AUTO',
      note: null, created_at: `${end}T18:00:00Z`
    };
    db.yields.push(y);
    return y;
  };
  const pay = (invId: string, y: MockYield, amount: number, paidAt: string) => {
    const n = db.seq;
    db.payments.push({
      id: id('pay'), investment_id: invId, amount_cents: amount, paid_at: paidAt, status: 'CONFIRMED',
      reference: `FICTICIO-SPEI-${String(n).padStart(5, '0')}`, notes: 'Pago externo FICTICIO',
      allocations: [{ yield_entry_id: y.id, amount_cents: amount }]
    });
  };

  // FICT-2026-001: mensual, 8 periodos confirmados; 7 pagados, el último pendiente.
  let start = '2026-01-15';
  for (let i = 0; i < 8; i++) {
    const end = addMonths('2026-01-15', i + 1);
    const y = addYield('inv_fict_001', start, end, 25_000_000, 1600);
    if (i < 7) pay('inv_fict_001', y, y.amount_cents, `${end.slice(0, 8)}16T16:30:00Z`);
    start = end;
  }

  // FICT-2025-002: semestral con reinversión contractual del primer semestre.
  const s1 = addYield('inv_fict_002', '2025-11-01', '2026-05-01', 40_000_000, 2500);
  db.movements.push({
    id: id('mov'), investment_id: 'inv_fict_002', movement_type: 'REINVESTMENT_CREDIT',
    amount_cents: s1.amount_cents, effective_date: '2026-05-01', yield_entry_id: s1.id
  });
  db.investments[1]!.current_capital_cents += s1.amount_cents;

  // FICT-2025-003: al vencimiento, un solo periodo, pagado.
  const m1 = addYield('inv_fict_003', '2025-01-10', '2026-01-10', 10_000_000, 1300);
  pay('inv_fict_003', m1, m1.amount_cents, '2026-01-12T17:00:00Z');

  // FICT-2026-004: mensual; 5 pagados, 1 con pago parcial, 1 pendiente.
  start = '2026-03-01';
  for (let i = 0; i < 7; i++) {
    const end = addMonths('2026-03-01', i + 1);
    const y = addYield('inv_fict_004', start, end, 40_000_000, 2500);
    if (i < 5) pay('inv_fict_004', y, y.amount_cents, `${end}T19:00:00Z`);
    if (i === 5) pay('inv_fict_004', y, 500_000, `${end}T19:00:00Z`);
    start = end;
  }

  // FICT-2026-005: Fast Food mensual (complemento de pensión); 4 pagados, el último pendiente.
  start = '2026-05-01';
  for (let i = 0; i < 5; i++) {
    const end = addMonths('2026-05-01', i + 1);
    const y = addYield('inv_fict_005', start, end, 10_000_000, 1300);
    if (i < 4) pay('inv_fict_005', y, y.amount_cents, `${end}T17:00:00Z`);
    start = end;
  }

  const doc = (invId: string, title: string, type: DocumentType, file: string, size: number, created: string) =>
    db.documents.push({
      id: id('doc'), investment_id: invId, title, document_type: type, original_filename: file,
      size_bytes: size, content_type: 'application/pdf', created_at: created, is_archived: false
    });
  doc('inv_fict_001', 'Contrato de inversión FICTICIO FICT-2026-001', 'CONTRACT', 'Contrato_FICTICIO_001.pdf', 482_133, '2026-01-15T18:00:00Z');
  doc('inv_fict_002', 'Contrato de inversión FICTICIO FICT-2025-002', 'CONTRACT', 'Contrato_FICTICIO_002.pdf', 391_022, '2025-11-01T18:00:00Z');
  doc('inv_fict_002', 'Adenda FICTICIA de reinversión', 'ADDENDUM', 'Adenda_FICTICIA_002.pdf', 120_447, '2026-05-02T18:00:00Z');
  doc('inv_fict_003', 'Contrato de inversión FICTICIO FICT-2025-003', 'CONTRACT', 'Contrato_FICTICIO_003.pdf', 402_908, '2025-01-10T18:00:00Z');
  doc('inv_fict_004', 'Contrato de inversión FICTICIO FICT-2026-004', 'CONTRACT', 'Contrato_FICTICIO_004.pdf', 455_610, '2026-03-01T18:00:00Z');
  doc('inv_fict_005', 'Contrato de inversión FICTICIO FICT-2026-005', 'CONTRACT', 'Contrato_FICTICIO_005.pdf', 438_201, '2026-05-01T18:00:00Z');

  const note = (userId: string, email: string, type: string, subject: string, status: MockNotification['status'], created: string) =>
    db.notifications.push({
      id: id('not'), user_id: userId, recipient_email: email, event_type: type, subject, status,
      created_at: created, attempts_count: status === 'FAILED' ? 3 : 1, error_message: status === 'FAILED' ? 'Buzón FICTICIO no disponible' : null
    });
  note('usr_fict_01', 'hector.galeana@ficticio.test', 'PAYMENT_RECORDED', 'Confirmación de pago registrado', 'SENT', '2026-09-16T17:00:00Z');
  note('usr_fict_03', 'victoria.perez@ficticio.test', 'PAYMENT_RECORDED', 'Confirmación de pago registrado', 'SENT', '2026-09-01T17:05:00Z');
  note('usr_fict_01', 'hector.galeana@ficticio.test', 'PASSWORD_CHANGED', 'Aviso de seguridad: su contraseña ha sido modificada', 'SENT', '2026-02-03T15:00:00Z');
  note('usr_fict_02', 'cesar.daniel@ficticio.test', 'PAYMENT_RECORDED', 'Confirmación de pago registrado', 'FAILED', '2026-09-01T19:05:00Z');

  const audit = (action: string, entity: string, entityId: string, created: string, newValues: Record<string, unknown>) =>
    db.audit.push({
      id: id('aud'), user_id: 'usr_fict_admin', actor_email: 'admin@ficticio.test', action, entity_type: entity,
      entity_id: entityId, old_values_json: null, new_values_json: JSON.stringify(newValues), ip_address: '203.0.113.10',
      created_at: created
    });
  audit('INVESTMENT_CREATED', 'INVESTMENT', 'inv_fict_001', '2026-01-15T17:00:00Z', { code: 'FICT-2026-001' });
  audit('YIELD_CONFIRMED', 'YIELD_ENTRY', db.yields[0]!.id, '2026-02-15T18:00:00Z', { amount_cents: db.yields[0]!.amount_cents });
  audit('EXTERNAL_PAYMENT_RECORDED', 'PAYMENT_RECORD', db.payments[0]!.id, '2026-02-16T16:30:00Z', { reference: db.payments[0]!.reference });
  audit('YIELD_REINVESTED', 'REINVESTMENT', s1.id, '2026-05-01T18:30:00Z', { amount_cents: s1.amount_cents });
  audit('DOCUMENT_UPLOADED', 'DOCUMENT', db.documents[2]!.id, '2026-05-02T18:00:00Z', { title: 'Adenda FICTICIA de reinversión' });

  return db;
}

export function nextId(db: MockDb, prefix: string) {
  return `${prefix}_fict_${String(db.seq++).padStart(4, '0')}`;
}

/** PDF mínimo de una página con la leyenda DOCUMENTO FICTICIO. */
export function fictitiousPdf(title: string): Blob {
  const text = `DOCUMENTO FICTICIO - ${title}`.replace(/[()\\]/g, '');
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${text.length + 40}>>stream
BT /F1 16 Tf 60 720 Td (${text}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

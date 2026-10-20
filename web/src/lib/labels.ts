import { formatRateBps, formatSpreadBps } from './format';
import type {
  CapitalizationPolicy,
  DayCountConvention,
  DocumentType,
  InvestmentStatus,
  InvestmentTerms,
  InvestmentType,
  ReferenceRateCode,
  NotificationStatus,
  PayoutFrequency,
  Relationship,
  YieldSource,
  YieldStatus
} from '../api/types';

export const investmentStatusLabel: Record<InvestmentStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Vigente',
  MATURED: 'Vencida',
  CANCELLED: 'Cancelada'
};

/** "A liquidación": interpretación pendiente de confirmar con el cliente (docs/01, decisión 1). */
export const payoutFrequencyLabel: Record<PayoutFrequency, string> = {
  MONTHLY: 'Mensual',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
  AT_MATURITY: 'Al vencimiento (liquidación)'
};

export const capitalizationLabel: Record<CapitalizationPolicy, string> = {
  NONE: 'Pago al inversionista',
  COMPOUND_TO_CAPITAL: 'Reinversión a capital'
};

export const dayCountLabel: Record<DayCountConvention, string> = {
  ACT_365: 'Días reales / 365',
  ACT_360: 'Días reales / 360',
  THIRTY_360: '30 / 360'
};

export const documentTypeLabel: Record<DocumentType, string> = {
  CONTRACT: 'Contrato',
  ADDENDUM: 'Adenda',
  ACCOUNT_STATEMENT: 'Constancia',
  TAX_RECEIPT: 'Comprobante fiscal',
  OTHER: 'Otro'
};

export const yieldStatusLabel: Record<YieldStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  REVERSED: 'Reversado'
};

export const yieldSourceLabel: Record<YieldSource, string> = {
  AUTO: 'Cálculo',
  MANUAL: 'Manual',
  ADJUSTMENT: 'Ajuste',
  REVERSAL: 'Reversión'
};

export const notificationStatusLabel: Record<NotificationStatus, string> = {
  PENDING: 'En cola',
  SENT: 'Enviado',
  FAILED: 'Falló'
};

export const notificationEventLabel: Record<string, string> = {
  PASSWORD_CHANGED: 'Cambio de contraseña',
  PASSWORD_RESET_REQUESTED: 'Recuperación de contraseña',
  PAYMENT_RECORDED: 'Pago registrado',
  DOCUMENT_UPLOADED: 'Documento publicado',
  CONTRACT_EXPIRING_SOON: 'Vencimiento próximo'
};

/** Glosario de indicadores: un solo texto para cada concepto, usado en tarjetas y ayudas. */
export const kpiHelp = {
  capital: 'Capital invertido que actualmente genera rendimiento según contrato.',
  generated: 'Rendimiento calculado (devengado) para los periodos ya transcurridos.',
  confirmed: 'Rendimiento revisado y confirmado por la administración.',
  reinvested: 'Rendimiento que, por contrato, se sumó a su capital.',
  paid: 'Rendimiento que ya se le transfirió fuera del portal y la administración confirmó.',
  pending: 'Rendimiento confirmado que aún no se ha pagado ni reinvertido. No es dinero disponible en una cuenta bancaria.'
} as const;

export const investmentTypeLabel: Record<InvestmentType, string> = {
  FAST_FOOD: 'Fast Food',
  MOBILITY: 'Movilidad',
  TRANSPORT: 'Transporte',
  ELECTRIC_VEHICLES: 'Vehículos eléctricos',
  CETES: 'CETES'
};

/**
 * Condiciones de referencia publicadas por Pimex Fortex Capital (material comercial).
 * Solo prellenan el formulario; el contrato firmado manda.
 */
export const investmentTypeReference: Partial<Record<InvestmentType, { capital_cents?: number; months?: number; rate_bps: number }>> = {
  MOBILITY: { capital_cents: 25_000_000, months: 12, rate_bps: 1600 },
  TRANSPORT: { capital_cents: 40_000_000, months: 18, rate_bps: 2500 },
  FAST_FOOD: { capital_cents: 10_000_000, months: 12, rate_bps: 1300 },
  // Solo la tasa está definida en el material; capital y plazo los fija cada contrato.
  ELECTRIC_VEHICLES: { rate_bps: 1600 }
};

export const relationshipLabel: Record<Relationship, string> = {
  SPOUSE: 'Cónyuge',
  CHILD: 'Hijo(a)',
  PARENT: 'Padre / Madre',
  SIBLING: 'Hermano(a)',
  OTHER: 'Otro'
};

export const currencyLabel: Record<string, string> = {
  MXN: 'Pesos mexicanos (MXN)',
  USD: 'Dólares estadounidenses (USD)'
};

export const referenceRateLabel: Record<ReferenceRateCode, string> = {
  CETES_28: 'CETES 28 días',
  CETES_91: 'CETES 91 días',
  CETES_182: 'CETES 182 días',
  CETES_364: 'CETES 364 días'
};

/** Descripción de la tasa: "16.00 % anual fija" o "CETES 28 días − 1.00 punto". */
export function rateSummary(t: Pick<InvestmentTerms, 'rate_type' | 'fixed_annual_rate_bps' | 'reference_rate_code' | 'spread_bps'>): string {
  if (t.rate_type === 'REFERENCE' && t.reference_rate_code) {
    return `${referenceRateLabel[t.reference_rate_code]} ${formatSpreadBps(t.spread_bps)}`;
  }
  return `${formatRateBps(t.fixed_annual_rate_bps)} anual fija`;
}

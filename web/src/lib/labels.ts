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
  MATURED: 'Vencido',
  CANCELLED: 'Cancelado'
};

/** "A liquidación": interpretación pendiente de confirmar con el cliente (docs/01, decisión 1). */
export const payoutFrequencyLabel: Record<PayoutFrequency, string> = {
  MONTHLY: 'Mensual',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
  AT_MATURITY: 'Al vencimiento (liquidación)'
};

export const capitalizationLabel: Record<CapitalizationPolicy, string> = {
  NONE: 'Pago al cliente',
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
  capital: 'Capital aportado que actualmente genera rendimiento según contrato.',
  generated: 'Rendimiento calculado (devengado) para los periodos ya transcurridos.',
  confirmed: 'Rendimiento revisado y confirmado por la administración.',
  reinvested: 'Rendimiento que, por contrato, se sumó a su capital.',
  paid: 'Rendimiento que ya se le transfirió fuera del portal y la administración confirmó.',
  pending: 'Rendimiento confirmado que aún no se ha pagado ni reinvertido. No es dinero disponible en una cuenta bancaria.'
} as const;

export const investmentTypeLabel: Record<InvestmentType, string> = {
  ELECTRIC_MOBILITY: 'Movilidad y vehículos eléctricos',
  FOOD_TRUCKS: 'Food trucks y unidades móviles',
  FOREIGN_VEHICLES: 'Vehículos extranjeros legalizados',
  CARGO_TRANSPORT: 'Transporte de carga',
  TECH_SOLUTIONS: 'Soluciones tecnológicas y creativas',
  CETES: 'CETES'
};

/** Descripción breve de cada giro (formulario de nuevo contrato). */
export const investmentTypeHint: Record<InvestmentType, string> = {
  ELECTRIC_MOBILITY: 'Comercialización y arrendamiento de vehículos eléctricos ligeros.',
  FOOD_TRUCKS: 'Renta y venta de food trucks y unidades móviles comerciales.',
  FOREIGN_VEHICLES: 'Vehículos con pedimento de importación definitiva, listos para su venta.',
  CARGO_TRANSPORT: 'Unidades para el transporte de carga y mercancía.',
  TECH_SOLUTIONS: 'Software, aplicaciones, drones, video, audio y diseño.',
  CETES: 'Tasa variable: CETES más un diferencial (p. ej. − 1 punto). Solo en pesos.'
};

/**
 * Condiciones de referencia por giro para prellenar el formulario. Las líneas de negocio actuales no
 * publican condiciones de referencia: cada contrato fija las suyas.
 */
export const investmentTypeReference: Partial<Record<InvestmentType, { capital_cents?: number; months?: number; rate_bps: number }>> = {};

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

import { formatMoney } from '../lib/format';
import { kpiHelp } from '../lib/labels';
import { KpiTile } from './ui';

export interface BalanceValues {
  capital: number;
  generated: number;
  confirmed: number;
  reinvested: number;
  paid: number;
  pending: number;
}

/**
 * Seis indicadores separados y agrupados para no confundirlos. Las cifras vienen tal cual de la API.
 */
export function BalanceTiles({ v, currency = 'MXN', idPrefix = '' }: { v: BalanceValues; currency?: string; idPrefix?: string }) {
  const m = (cents: number) => formatMoney(cents, currency);
  const tid = (k: string) => `${idPrefix}kpi-${k}`;
  return (
    <div className="space-y-5">
      <section aria-labelledby={`${idPrefix}kpi-capital`}>
        <h2 id={`${idPrefix}kpi-capital`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Capital</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile testId={tid('capital')} tone="brand" label="Capital vigente" value={m(v.capital)} help={kpiHelp.capital} />
        </dl>
      </section>

      <section aria-labelledby={`${idPrefix}kpi-rend`}>
        <h2 id={`${idPrefix}kpi-rend`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Rendimientos</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiTile testId={tid('generated')} label="Rendimiento generado" value={m(v.generated)} help={kpiHelp.generated} />
          <KpiTile testId={tid('confirmed')} label="Rendimiento confirmado" value={m(v.confirmed)} help={kpiHelp.confirmed} />
        </dl>
      </section>

      <section aria-labelledby={`${idPrefix}kpi-destino`}>
        <h2 id={`${idPrefix}kpi-destino`} className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">¿Qué pasó con el rendimiento confirmado?</h2>
        <p className="mb-2 text-xs text-ink-muted">Cada {currency === 'USD' ? 'dólar' : 'peso'} confirmado está en uno de estos tres estados.</p>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile testId={tid('paid')} label="Pagado" value={m(v.paid)} help={kpiHelp.paid} />
          <KpiTile testId={tid('reinvested')} label="Reinvertido" value={m(v.reinvested)} help={kpiHelp.reinvested} />
          <KpiTile testId={tid('pending')} tone="attention" label="Pendiente de pago" value={m(v.pending)} help={kpiHelp.pending} />
        </dl>
      </section>
    </div>
  );
}

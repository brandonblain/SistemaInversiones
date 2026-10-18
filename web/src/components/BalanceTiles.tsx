import { formatMXN } from '../lib/format';
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
export function BalanceTiles({ v }: { v: BalanceValues }) {
  return (
    <div className="space-y-5">
      <section aria-labelledby="kpi-capital">
        <h2 id="kpi-capital" className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Capital</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile testId="kpi-capital" tone="brand" label="Capital vigente" value={formatMXN(v.capital)} help={kpiHelp.capital} />
        </dl>
      </section>

      <section aria-labelledby="kpi-rend">
        <h2 id="kpi-rend" className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Rendimientos</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiTile testId="kpi-generated" label="Rendimiento generado" value={formatMXN(v.generated)} help={kpiHelp.generated} />
          <KpiTile testId="kpi-confirmed" label="Rendimiento confirmado" value={formatMXN(v.confirmed)} help={kpiHelp.confirmed} />
        </dl>
      </section>

      <section aria-labelledby="kpi-destino">
        <h2 id="kpi-destino" className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">¿Qué pasó con el rendimiento confirmado?</h2>
        <p className="mb-2 text-xs text-ink-muted">Cada peso confirmado está en uno de estos tres estados.</p>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile testId="kpi-paid" label="Pagado" value={formatMXN(v.paid)} help={kpiHelp.paid} />
          <KpiTile testId="kpi-reinvested" label="Reinvertido" value={formatMXN(v.reinvested)} help={kpiHelp.reinvested} />
          <KpiTile testId="kpi-pending" tone="attention" label="Pendiente de pago" value={formatMXN(v.pending)} help={kpiHelp.pending} />
        </dl>
      </section>
    </div>
  );
}

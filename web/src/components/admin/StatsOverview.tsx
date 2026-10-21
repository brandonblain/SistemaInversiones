import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import type { AdminStatistics } from '../../api/types';
import { formatDate, formatMoney, formatRateBps } from '../../lib/format';
import { currencyLabel, payoutFrequencyLabel } from '../../lib/labels';
import { DataTable, type Column } from '../DataTable';
import { Card, EmptyState, KpiTile, LoadingBlock } from '../ui';

const StatsCharts = lazy(() => import('../../charts/StatsCharts'));

type Totals = AdminStatistics['totals'][number];

/** Tarjetas + gráficas + vencimientos, un bloque por moneda. Sirve para estadísticas generales y de un cliente. */
export function StatsOverview({ stats, scope }: { stats: AdminStatistics; scope: 'general' | 'cliente' }) {
  if (stats.totals.length === 0) {
    return <EmptyState icon="chart" title="Sin contratos registrados">Las estadísticas aparecen cuando hay contratos.</EmptyState>;
  }
  return (
    <div className="space-y-8">
      {stats.totals.map((t) => (
        <section key={t.currency} aria-labelledby={`stats-${t.currency}`} className="space-y-4">
          <h2 id={`stats-${t.currency}`} className="border-b border-line pb-2 text-lg font-bold text-brand">{currencyLabel[t.currency] ?? t.currency}</h2>
          <Tiles t={t} scope={scope} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <Suspense fallback={<LoadingBlock rows={6} label="Cargando gráficas…" />}>
                <StatsCharts stats={stats} currency={t.currency} />
              </Suspense>
            </Card>
            <Card title="Por modalidad de cobro">
              <p className="mb-2 text-xs text-ink-muted">Número de contratos y capital vigente.</p>
              <ul className="divide-y divide-line text-sm">
                {stats.by_payout.filter((p) => p.currency === t.currency).map((p) => (
                  <li key={p.payout_frequency} className="flex items-center justify-between py-2">
                    <span>{payoutFrequencyLabel[p.payout_frequency]} <span className="text-xs text-ink-muted">({p.investments_count})</span></span>
                    <span className="tabular font-semibold">{formatMoney(p.capital_cents, t.currency)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>
      ))}
      <Card title="Vencimientos en los próximos 90 días">
        <Maturities rows={stats.upcoming_maturities} />
      </Card>
    </div>
  );
}

function Tiles({ t, scope }: { t: Totals; scope: 'general' | 'cliente' }) {
  const m = (c: number) => formatMoney(c, t.currency);
  return (
    <dl className="metric-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile tone="brand" label="Capital vigente" value={m(t.capital_cents)} help={`${t.investments_active} vigentes · ${t.investments_matured} vencidos · ${t.investments_total} en total`} />
      <KpiTile label="Capital inicial colocado" value={m(t.initial_capital_cents)} help="Suma del capital inicial de todos los contratos." />
      <KpiTile label="Rendimiento confirmado" value={m(t.yield_confirmed_cents)} />
      <KpiTile tone="attention" label="Pendiente de pago" value={m(t.yield_pending_cents)} />
      <KpiTile label="Pagado" value={m(t.yield_paid_cents)} />
      <KpiTile label="Reinvertido" value={m(t.yield_reinvested_cents)} />
      <KpiTile
        label="Tasa fija promedio ponderada"
        value={t.weighted_fixed_rate_bps === null ? '—' : formatRateBps(t.weighted_fixed_rate_bps)}
        help="Ponderada por capital vigente; no incluye CETES."
      />
      {scope === 'general' ? (
        <KpiTile label="Clientes" value={t.investors_count} help={`Con contratos en ${t.currency}`} />
      ) : (
        <KpiTile label="Contratos" value={t.investments_total} help={`${t.investments_active} vigentes`} />
      )}
    </dl>
  );
}

const maturityColumns: Column<AdminStatistics['upcoming_maturities'][number]>[] = [
  { key: 'date', header: 'Vence', primary: true, render: (r) => formatDate(r.maturity_date) },
  { key: 'code', header: 'Contrato', render: (r) => <Link className="font-semibold text-brand hover:underline" to={`/admin/inversiones/${r.investment_id}`}>{r.code}</Link> },
  { key: 'who', header: 'Cliente', render: (r) => <Link className="hover:underline" to={`/admin/clientes/${r.investor_user_id}`}>{r.investor_name ?? '—'}</Link> },
  { key: 'capital', header: 'Capital vigente', align: 'right', render: (r) => formatMoney(r.capital_cents, r.currency) }
];

function Maturities({ rows }: { rows: AdminStatistics['upcoming_maturities'] }) {
  return <DataTable caption="Vencimientos próximos" columns={maturityColumns} rows={rows} rowKey={(r) => r.investment_id} empty={<EmptyState icon="clock" title="Sin vencimientos en los próximos 90 días" />} />;
}

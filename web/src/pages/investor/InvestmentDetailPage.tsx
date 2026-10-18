import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import type { HistoryEntry, HistoryType } from '../../api/types';
import { BalanceTiles } from '../../components/BalanceTiles';
import { InvestmentStatusBadge } from '../../components/badges';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Icon } from '../../components/icons';
import { Async, Badge, Card, DefinitionList, EmptyState, LoadingBlock, PageHeader, SelectInput, Tabs } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMXN, formatPeriod, formatRateBps } from '../../lib/format';
import { capitalizationLabel, investmentTypeLabel, payoutFrequencyLabel } from '../../lib/labels';

const InvestmentCharts = lazy(() => import('../../charts/InvestmentCharts'));

type TabId = 'resumen' | 'evolucion' | 'movimientos';
const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'evolucion', label: 'Evolución' },
  { id: 'movimientos', label: 'Rendimientos y pagos' }
];

export function InvestmentDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<TabId>('resumen');
  const inv = useAsync(() => api.investor.investment(id), [id]);

  const back = (
    <Link to="/app/inversiones" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
      <Icon name="chevronLeft" className="h-4 w-4" /> Mis inversiones
    </Link>
  );

  return (
    <Async state={inv} loading={<><PageHeader back={back} title="Inversión" /><LoadingBlock rows={6} /></>}>
      {(d) => (
        <>
          <PageHeader
            back={back}
            title={<span className="flex flex-wrap items-center gap-3">{d.code} <InvestmentStatusBadge status={d.status} /></span>}
            subtitle={`${investmentTypeLabel[d.investment_type]} · ${formatRateBps(d.terms.fixed_annual_rate_bps)} anual fija · cobro ${payoutFrequencyLabel[d.terms.payout_frequency].toLowerCase()} · ${formatDate(d.start_date)} – ${formatDate(d.maturity_date)}`}
          />
          <Tabs label="Secciones de la inversión" tabs={tabs} value={tab} onChange={setTab} />

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'resumen' && (
              <div className="space-y-6">
                <BalanceTiles
                  v={{
                    capital: d.balance.capital_cents,
                    generated: d.balance.yield_generated_cents,
                    confirmed: d.balance.yield_confirmed_cents,
                    reinvested: d.balance.yield_reinvested_cents,
                    paid: d.balance.yield_paid_cents,
                    pending: d.balance.yield_pending_cents
                  }}
                />
                <Card title="Condiciones del contrato">
                  <DefinitionList
                    items={[
                      { label: 'Ramo', value: investmentTypeLabel[d.investment_type] },
                      { label: 'Capital inicial', value: formatMXN(d.initial_capital_cents) },
                      { label: 'Tasa anual fija', value: formatRateBps(d.terms.fixed_annual_rate_bps) },
                      { label: 'Cobro de rendimiento', value: payoutFrequencyLabel[d.terms.payout_frequency] },
                      { label: 'Destino del rendimiento', value: capitalizationLabel[d.terms.capitalization_policy] },
                      { label: 'Fecha de inicio', value: formatDate(d.start_date, 'long') },
                      { label: 'Fecha de vencimiento', value: formatDate(d.maturity_date, 'long') }
                    ]}
                  />
                </Card>
              </div>
            )}
            {tab === 'evolucion' && <EvolutionTab id={id} />}
            {tab === 'movimientos' && <HistoryTab id={id} />}
          </div>
        </>
      )}
    </Async>
  );
}

function EvolutionTab({ id }: { id: string }) {
  const series = useAsync(() => api.investor.series(id), [id]);
  return (
    <Card>
      <Async state={series} loading={<LoadingBlock rows={8} label="Cargando gráficas…" />}>
        {(s) => (
          <Suspense fallback={<LoadingBlock rows={8} label="Cargando gráficas…" />}>
            <InvestmentCharts series={s} />
          </Suspense>
        )}
      </Async>
    </Card>
  );
}

const typeLabel: Record<HistoryEntry['entry_type'], { text: string; tone: 'ok' | 'brand' | 'info' }> = {
  YIELD: { text: 'Rendimiento', tone: 'ok' },
  PAYMENT: { text: 'Pago recibido', tone: 'brand' },
  CAPITAL: { text: 'Capital', tone: 'info' }
};

const historyColumns: Column<HistoryEntry>[] = [
  { key: 'date', header: 'Fecha', primary: true, render: (r) => formatDate(r.effective_date) },
  { key: 'type', header: 'Tipo', render: (r) => <Badge tone={typeLabel[r.entry_type].tone}>{typeLabel[r.entry_type].text}</Badge> },
  {
    key: 'concept',
    header: 'Detalle',
    render: (r) => (
      <span className="text-ink-2">
        {r.entry_type === 'YIELD' && r.period_start ? `Periodo ${formatPeriod(r.period_start, r.period_end)}` : r.note}
        {r.reference && <span className="block text-xs text-ink-muted">Ref. {r.reference}</span>}
        {r.entry_type === 'YIELD' && r.note && <span className="block text-xs text-ink-muted">{r.note}</span>}
      </span>
    )
  },
  { key: 'amount', header: 'Importe', align: 'right', render: (r) => formatMXN(r.amount_cents) },
  {
    key: 'pending',
    header: 'Pendiente de pago',
    align: 'right',
    render: (r) => (r.entry_type === 'YIELD' && r.pending_amount_cents !== undefined ? formatMXN(r.pending_amount_cents) : '—')
  }
];

function HistoryTab({ id }: { id: string }) {
  const [type, setType] = useState<HistoryType>('ALL');
  const [page, setPage] = useState(1);
  const history = useAsync(() => api.investor.history(id, { type, page, pageSize: 10 }), [id, type, page]);

  return (
    <Card>
      <div className="mb-4 max-w-xs">
        <SelectInput label="Mostrar" value={type} onChange={(e) => { setType(e.target.value as HistoryType); setPage(1); }}>
          <option value="ALL">Todo</option>
          <option value="YIELDS">Rendimientos confirmados</option>
          <option value="PAYMENTS">Pagos recibidos</option>
          <option value="CAPITAL">Movimientos de capital</option>
        </SelectInput>
      </div>
      <Async state={history}>
        {(res) => (
          <>
            <DataTable
              caption="Historial de rendimientos y pagos"
              columns={historyColumns}
              rows={res.data}
              rowKey={(r) => `${r.entry_type}-${r.id}`}
              empty={<EmptyState title="Sin movimientos registrados">Los rendimientos confirmados y los pagos realizados aparecerán aquí.</EmptyState>}
            />
            <Pagination info={res.pagination} onPage={setPage} />
          </>
        )}
      </Async>
      <p className="mt-4 text-xs text-ink-muted">
        Un pago aparece solo cuando la administración confirma que la transferencia externa se realizó.
      </p>
    </Card>
  );
}


import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import type { AdminPaymentRow } from '../../api/types';
import { YieldEntriesTable } from '../../components/admin/YieldEntriesTable';
import { BalanceTiles } from '../../components/BalanceTiles';
import { InvestmentStatusBadge } from '../../components/badges';
import { DataTable, type Column } from '../../components/DataTable';
import { DocumentList } from '../../components/DocumentList';
import { Icon } from '../../components/icons';
import { Async, Card, DefinitionList, EmptyState, LinkButton, PageHeader, Tabs } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatDateTime, formatMoney, formatRateBps } from '../../lib/format';
import { capitalizationLabel, currencyLabel, dayCountLabel, investmentTypeLabel, payoutFrequencyLabel, rateSummary } from '../../lib/labels';

type TabId = 'resumen' | 'rendimientos' | 'pagos' | 'documentos';

const paymentColumns: Column<AdminPaymentRow>[] = [
  { key: 'date', header: 'Fecha de pago', primary: true, render: (r) => formatDateTime(r.paid_at) },
  { key: 'ref', header: 'Referencia', render: (r) => r.reference },
  { key: 'amount', header: 'Monto', align: 'right', render: (r) => formatMoney(r.amount_cents, r.currency) },
  { key: 'alloc', header: 'Asignado', align: 'right', render: (r) => formatMoney(r.allocated_cents, r.currency) },
  { key: 'notes', header: 'Notas', hideOnMobile: true, render: (r) => r.notes ?? '—' }
];

export function AdminInvestmentDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<TabId>('resumen');
  const inv = useAsync(() => api.admin.investment(id), [id]);

  const back = (
    <Link to="/admin/inversiones" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
      <Icon name="chevronLeft" className="h-4 w-4" /> Contratos
    </Link>
  );

  return (
    <Async state={inv}>
      {(d) => (
        <>
          <PageHeader
            back={back}
            title={<span className="flex flex-wrap items-center gap-3">{d.code} <InvestmentStatusBadge status={d.status} /></span>}
            subtitle={
              <>
                <Link className="font-medium text-brand hover:underline" to={`/admin/clientes/${d.investor_user_id}`}>{d.investor_name ?? 'Cliente'}</Link>
                {' · '}{investmentTypeLabel[d.investment_type]}{' · '}{formatDate(d.start_date)} – {formatDate(d.maturity_date)}
              </>
            }
            actions={
              <>
                <LinkButton variant="secondary" to={`/admin/rendimientos?inversion=${d.id}`} icon="percent">Rendimientos</LinkButton>
                <LinkButton variant="secondary" to={`/admin/pagos?inversion=${d.id}`} icon="cash">Registrar pago</LinkButton>
              </>
            }
          />
          <Tabs
            label="Secciones"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'resumen', label: 'Resumen' },
              { id: 'rendimientos', label: 'Rendimientos' },
              { id: 'pagos', label: 'Pagos' },
              { id: 'documentos', label: 'Documentos' }
            ]}
          />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'resumen' && (
              <div className="space-y-6">
                <BalanceTiles
                  currency={d.currency}
                  v={{
                    capital: d.balance.capital_cents,
                    generated: d.balance.yield_generated_cents,
                    confirmed: d.balance.yield_confirmed_cents,
                    reinvested: d.balance.yield_reinvested_cents,
                    paid: d.balance.yield_paid_cents,
                    pending: d.balance.yield_pending_cents
                  }}
                />
                <Card title="Términos contractuales vigentes">
                  <DefinitionList
                    items={[
                      { label: 'Giro', value: investmentTypeLabel[d.investment_type] },
                      { label: 'Moneda', value: currencyLabel[d.currency] ?? d.currency },
                      { label: 'Capital inicial', value: formatMoney(d.initial_capital_cents, d.currency) },
                      { label: 'Tasa', value: d.terms.rate_type === 'FIXED' ? `${rateSummary(d.terms)} (${d.terms.fixed_annual_rate_bps} pb)` : `${rateSummary(d.terms)} (${d.terms.spread_bps} pb)` },
                      ...(d.current_reference_rate
                        ? [{ label: 'Tasa CETES vigente', value: `${formatRateBps(d.current_reference_rate.annual_rate_bps)} al ${formatDate(d.current_reference_rate.effective_date)} → aplicada ${formatRateBps(d.current_reference_rate.applied_rate_bps)}` }]
                        : []),
                      { label: 'Cobro del rendimiento', value: payoutFrequencyLabel[d.terms.payout_frequency] },
                      { label: 'Destino del rendimiento', value: capitalizationLabel[d.terms.capitalization_policy] },
                      { label: 'Convención de días', value: `${dayCountLabel[d.terms.day_count_convention]} · pendiente de aprobación` },
                      { label: 'Notas internas', value: d.notes ?? '—' }
                    ]}
                  />
                </Card>
              </div>
            )}
            {tab === 'rendimientos' && <YieldsTab id={d.id} currency={d.currency} policy={d.terms.capitalization_policy} onChanged={inv.reload} />}
            {tab === 'pagos' && <PaymentsTab id={d.id} />}
            {tab === 'documentos' && <DocsTab id={d.id} />}
          </div>
        </>
      )}
    </Async>
  );
}

function YieldsTab({ id, currency, policy, onChanged }: { id: string; currency: string; policy: Parameters<typeof YieldEntriesTable>[0]['policy']; onChanged: () => void }) {
  const ys = useAsync(() => api.admin.yields(id), [id]);
  return (
    <Card>
      <Async state={ys}>
        {(list) => <YieldEntriesTable entries={list} currency={currency} policy={policy} investmentId={id} onChanged={() => { ys.reload(); onChanged(); }} />}
      </Async>
    </Card>
  );
}

function PaymentsTab({ id }: { id: string }) {
  const ps = useAsync(() => api.admin.payments({ investment_id: id, pageSize: 50 }), [id]);
  return (
    <Card>
      <Async state={ps}>
        {(res) => <DataTable caption="Pagos externos" columns={paymentColumns} rows={res.data} rowKey={(r) => r.id} empty={<EmptyState icon="cash" title="Sin pagos registrados" />} />}
      </Async>
    </Card>
  );
}

function DocsTab({ id }: { id: string }) {
  const docs = useAsync(() => api.admin.documents({ investment_id: id, pageSize: 50 }), [id]);
  return (
    <Card actions={<LinkButton variant="secondary" icon="plus" to={`/admin/documentos?inversion=${id}`}>Publicar documento</LinkButton>} title="Documentos">
      <Async state={docs}>{(res) => <DocumentList docs={res.data} />}</Async>
    </Card>
  );
}

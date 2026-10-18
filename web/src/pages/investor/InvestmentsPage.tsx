import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import type { InvestmentListItem, InvestmentStatus } from '../../api/types';
import { InvestmentStatusBadge } from '../../components/badges';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Async, Card, EmptyState, PageHeader, SelectInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMoney } from '../../lib/format';
import { capitalizationLabel, investmentTypeLabel, payoutFrequencyLabel, rateSummary } from '../../lib/labels';

const columns: Column<InvestmentListItem>[] = [
  { key: 'code', header: 'Inversión', primary: true, render: (r) => <span className="font-semibold text-brand">{r.code}</span> },
  { key: 'type', header: 'Ramo', render: (r) => investmentTypeLabel[r.investment_type] },
  { key: 'status', header: 'Estado', render: (r) => <InvestmentStatusBadge status={r.status} /> },
  { key: 'capital', header: 'Capital vigente', align: 'right', render: (r) => formatMoney(r.current_capital_cents, r.currency) },
  { key: 'rate', header: 'Tasa', render: (r) => rateSummary(r.terms) },
  {
    key: 'freq',
    header: 'Cobro de rendimiento',
    render: (r) => (
      <>
        {payoutFrequencyLabel[r.terms.payout_frequency]}
        <span className="block text-xs text-ink-muted">{capitalizationLabel[r.terms.capitalization_policy]}</span>
      </>
    )
  },
  { key: 'start', header: 'Inicio', render: (r) => formatDate(r.start_date) },
  { key: 'end', header: 'Vencimiento', render: (r) => formatDate(r.maturity_date) },
  { key: 'pending', header: 'Pendiente de pago', align: 'right', render: (r) => formatMoney(r.stats.yield_pending_cents, r.currency) }
];

export function InvestmentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('estado') ?? '') as InvestmentStatus | '';
  const page = Math.max(1, Number(params.get('pagina') ?? 1) || 1);
  const list = useAsync(() => api.investor.investments({ status, page, pageSize: 10 }), [status, page]);

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageHeader title="Mis inversiones" subtitle="Cada inversión tiene su propio contrato, tasa anual fija y modalidad de cobro." />
      <Card>
        <div className="mb-4 max-w-xs">
          <SelectInput label="Estado" value={status} onChange={(e) => update({ estado: e.target.value, pagina: '' })}>
            <option value="">Todas</option>
            <option value="ACTIVE">Vigentes</option>
            <option value="MATURED">Vencidas</option>
            <option value="CANCELLED">Canceladas</option>
          </SelectInput>
        </div>
        <Async state={list}>
          {(res) => (
            <>
              <DataTable
                caption="Lista de inversiones"
                columns={columns}
                rows={res.data}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/app/inversiones/${r.id}`)}
                empty={<EmptyState title="Sin inversiones con este filtro">Cambie el filtro de estado para ver otras inversiones.</EmptyState>}
              />
              <Pagination info={res.pagination} onPage={(p) => update({ pagina: String(p) })} />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { AdminInvestmentRow, InvestmentStatus } from '../../api/types';
import { InvestmentStatusBadge } from '../../components/badges';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Async, Card, EmptyState, LinkButton, PageHeader, SelectInput, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useDebounced } from '../../hooks/useDebounced';
import { useListParams } from '../../hooks/useListParams';
import { formatDate, formatMoney } from '../../lib/format';
import { capitalizationLabel, investmentTypeLabel, payoutFrequencyLabel, rateSummary } from '../../lib/labels';

const columns: Column<AdminInvestmentRow>[] = [
  { key: 'code', header: 'Código', primary: true, render: (r) => <span className="font-semibold text-brand">{r.code}</span> },
  { key: 'investor', header: 'Inversionista', render: (r) => r.investor_name ?? r.investor_email },
  { key: 'type', header: 'Ramo', render: (r) => investmentTypeLabel[r.investment_type] },
  { key: 'status', header: 'Estado', render: (r) => <InvestmentStatusBadge status={r.status} /> },
  { key: 'capital', header: 'Capital vigente', align: 'right', render: (r) => formatMoney(r.current_capital_cents, r.currency) },
  { key: 'rate', header: 'Tasa', render: (r) => rateSummary(r) },
  {
    key: 'freq',
    header: 'Cobro / destino',
    render: (r) => (
      <>
        {payoutFrequencyLabel[r.payout_frequency]}
        <span className="block text-xs text-ink-muted">{capitalizationLabel[r.capitalization_policy]}</span>
      </>
    )
  },
  { key: 'dates', header: 'Vigencia', hideOnMobile: true, render: (r) => `${formatDate(r.start_date)} – ${formatDate(r.maturity_date)}` }
];

export function AdminInvestmentsPage() {
  const navigate = useNavigate();
  const { values, page, set, setPage } = useListParams(['q', 'estado'] as const);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search);
  useEffect(() => {
    if (debounced !== values.q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = useAsync(
    () => api.admin.investments({ q: values.q, status: values.estado as InvestmentStatus | '', page, pageSize: 20 }),
    [values.q, values.estado, page]
  );

  return (
    <>
      <PageHeader title="Inversiones" actions={<LinkButton to="/admin/inversiones/nueva" icon="plus">Nueva inversión</LinkButton>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <TextInput label="Buscar por código o inversionista" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <SelectInput label="Estado" value={values.estado} onChange={(e) => set({ estado: e.target.value })}>
            <option value="">Todos</option>
            <option value="ACTIVE">Vigentes</option>
            <option value="MATURED">Vencidas</option>
            <option value="CANCELLED">Canceladas</option>
            <option value="DRAFT">Borrador</option>
          </SelectInput>
        </div>
        <Async state={list}>
          {(res) => (
            <>
              <DataTable
                caption="Inversiones"
                columns={columns}
                rows={res.data}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/admin/inversiones/${r.id}`)}
                empty={<EmptyState title="Sin inversiones con estos filtros" />}
              />
              <Pagination info={res.pagination} onPage={setPage} />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

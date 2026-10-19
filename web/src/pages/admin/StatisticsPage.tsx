import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import type { AdminInvestmentRow, AdminStatistics, Currency, InvestmentStatus, InvestmentType } from '../../api/types';
import { StatsOverview } from '../../components/admin/StatsOverview';
import { InvestmentStatusBadge } from '../../components/badges';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Async, Card, EmptyState, LoadingBlock, PageHeader, SelectInput, Tabs, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useDebounced } from '../../hooks/useDebounced';
import { formatDate, formatMoney } from '../../lib/format';
import { investmentTypeLabel, payoutFrequencyLabel, rateSummary } from '../../lib/labels';

type TabId = 'general' | 'clientes' | 'inversiones';

export function StatisticsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('vista') as TabId) || 'general';
  const stats = useAsync(() => api.admin.statistics(), []);

  return (
    <>
      <PageHeader
        title="Estadísticas"
        subtitle={stats.data ? `Cifras al ${formatDate(stats.data.as_of_date, 'long')} · pesos y dólares se muestran por separado` : undefined}
      />
      <Tabs
        label="Vistas de estadísticas"
        value={tab}
        onChange={(t) => setParams(t === 'general' ? {} : { vista: t }, { replace: true })}
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'clientes', label: 'Por cliente' },
          { id: 'inversiones', label: 'Todas las inversiones' }
        ]}
      />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'general' && (
          <Async state={stats} loading={<LoadingBlock rows={8} />}>{(s) => <StatsOverview stats={s} scope="general" />}</Async>
        )}
        {tab === 'clientes' && <Async state={stats}>{(s) => <ByClient stats={s} />}</Async>}
        {tab === 'inversiones' && <AllInvestments />}
      </div>
    </>
  );
}

// ---------------- Por cliente ----------------
type ClientRow = AdminStatistics['investors'][number];

function ByClient({ stats }: { stats: AdminStatistics }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return stats.investors.filter(
      (r) => (!currency || r.currency === currency) && (!term || (r.full_name ?? '').toLowerCase().includes(term) || r.email.includes(term))
    );
  }, [stats, q, currency]);

  const columns: Column<ClientRow>[] = [
    { key: 'name', header: 'Inversionista', primary: true, render: (r) => <span className="font-semibold text-brand">{r.full_name ?? r.email}</span> },
    { key: 'cur', header: 'Moneda', render: (r) => r.currency },
    { key: 'count', header: 'Inversiones', align: 'right', render: (r) => `${r.active_count} / ${r.investments_count}` },
    { key: 'capital', header: 'Capital vigente', align: 'right', render: (r) => formatMoney(r.capital_cents, r.currency) },
    { key: 'conf', header: 'Confirmado', align: 'right', render: (r) => formatMoney(r.yield_confirmed_cents, r.currency) },
    { key: 'paid', header: 'Pagado', align: 'right', render: (r) => formatMoney(r.yield_paid_cents, r.currency) },
    { key: 'reinv', header: 'Reinvertido', align: 'right', hideOnMobile: true, render: (r) => formatMoney(r.yield_reinvested_cents, r.currency) },
    { key: 'pend', header: 'Pendiente', align: 'right', render: (r) => formatMoney(r.yield_pending_cents, r.currency) },
    { key: 'next', header: 'Próximo vencimiento', render: (r) => (r.next_maturity ? formatDate(r.next_maturity) : '—') }
  ];

  return (
    <Card>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><TextInput label="Buscar inversionista" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <SelectInput label="Moneda" value={currency} onChange={(e) => setCurrency(e.target.value as Currency | '')}>
          <option value="">Todas</option>
          <option value="MXN">Pesos (MXN)</option>
          <option value="USD">Dólares (USD)</option>
        </SelectInput>
      </div>
      <DataTable
        caption="Estadísticas por cliente"
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.user_id}-${r.currency}`}
        onRowClick={(r) => navigate(`/admin/clientes/${r.user_id}`)}
        empty={<EmptyState icon="users" title="Sin resultados" />}
      />
      <p className="mt-3 text-xs text-ink-muted">Un cliente con inversiones en pesos y en dólares aparece en un renglón por moneda. "Inversiones" = vigentes / total.</p>
    </Card>
  );
}

// ---------------- Todas las inversiones (con saldos) ----------------
function AllInvestments() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [filters, setFilters] = useState({ status: '' as InvestmentStatus | '', currency: '' as Currency | '', investment_type: '' as InvestmentType | '' });
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, filters]);
  const list = useAsync(() => api.admin.investments({ q, ...filters, page, pageSize: 20 }), [q, filters, page]);

  const columns: Column<AdminInvestmentRow>[] = [
    { key: 'code', header: 'Inversión', primary: true, render: (r) => <span className="font-semibold text-brand">{r.code}</span> },
    { key: 'who', header: 'Inversionista', render: (r) => <Link onClick={(e) => e.stopPropagation()} className="hover:underline" to={`/admin/clientes/${r.investor_user_id}`}>{r.investor_name ?? r.investor_email}</Link> },
    { key: 'type', header: 'Ramo', render: (r) => investmentTypeLabel[r.investment_type] },
    { key: 'status', header: 'Estado', render: (r) => <InvestmentStatusBadge status={r.status} /> },
    { key: 'rate', header: 'Tasa / cobro', hideOnMobile: true, render: (r) => <>{rateSummary(r)}<span className="block text-xs text-ink-muted">{payoutFrequencyLabel[r.payout_frequency]}</span></> },
    { key: 'capital', header: 'Capital vigente', align: 'right', render: (r) => formatMoney(r.current_capital_cents, r.currency) },
    { key: 'conf', header: 'Confirmado', align: 'right', render: (r) => formatMoney(r.yield_confirmed_cents, r.currency) },
    { key: 'paid', header: 'Pagado', align: 'right', render: (r) => formatMoney(r.yield_paid_cents, r.currency) },
    { key: 'pend', header: 'Pendiente', align: 'right', render: (r) => formatMoney(r.yield_pending_cents, r.currency) },
    { key: 'end', header: 'Vence', render: (r) => formatDate(r.maturity_date) }
  ];

  return (
    <Card>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextInput label="Buscar por código o inversionista" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <SelectInput label="Estado" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as InvestmentStatus | '' })}>
          <option value="">Todos</option>
          <option value="ACTIVE">Vigentes</option>
          <option value="MATURED">Vencidas</option>
          <option value="CANCELLED">Canceladas</option>
        </SelectInput>
        <SelectInput label="Moneda" value={filters.currency} onChange={(e) => setFilters({ ...filters, currency: e.target.value as Currency | '' })}>
          <option value="">Todas</option>
          <option value="MXN">Pesos (MXN)</option>
          <option value="USD">Dólares (USD)</option>
        </SelectInput>
        <SelectInput label="Ramo" value={filters.investment_type} onChange={(e) => setFilters({ ...filters, investment_type: e.target.value as InvestmentType | '' })}>
          <option value="">Todos</option>
          {(Object.keys(investmentTypeLabel) as InvestmentType[]).map((k) => <option key={k} value={k}>{investmentTypeLabel[k]}</option>)}
        </SelectInput>
      </div>
      <Async state={list}>
        {(res) => (
          <>
            <DataTable
              caption="Todas las inversiones"
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
  );
}

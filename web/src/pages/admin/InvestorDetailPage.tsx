import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import type { Beneficiary, InvestmentListItem } from '../../api/types';
import { InvestmentStatusBadge } from '../../components/badges';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/icons';
import { StatsOverview } from '../../components/admin/StatsOverview';
import { Async, Badge, Card, DefinitionList, EmptyState, LinkButton, LoadingBlock, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMoney, formatRateBps } from '../../lib/format';
import { investmentTypeLabel, payoutFrequencyLabel, rateSummary, relationshipLabel } from '../../lib/labels';

const columns: Column<InvestmentListItem>[] = [
  { key: 'code', header: 'Código', primary: true, render: (r) => <span className="font-semibold text-brand">{r.code}</span> },
  { key: 'type', header: 'Giro', render: (r) => investmentTypeLabel[r.investment_type] },
  { key: 'status', header: 'Estado', render: (r) => <InvestmentStatusBadge status={r.status} /> },
  { key: 'capital', header: 'Capital vigente', align: 'right', render: (r) => formatMoney(r.current_capital_cents, r.currency) },
  { key: 'rate', header: 'Tasa', render: (r) => rateSummary(r.terms) },
  { key: 'freq', header: 'Cobro', render: (r) => payoutFrequencyLabel[r.terms.payout_frequency] },
  { key: 'end', header: 'Vencimiento', render: (r) => formatDate(r.maturity_date) },
  { key: 'pending', header: 'Pendiente', align: 'right', render: (r) => formatMoney(r.stats.yield_pending_cents, r.currency) }
];

const beneficiaryColumns: Column<Beneficiary>[] = [
  { key: 'name', header: 'Nombre', primary: true, render: (b) => b.full_name },
  { key: 'rel', header: 'Parentesco', render: (b) => relationshipLabel[b.relationship] ?? b.relationship },
  { key: 'pct', header: 'Porcentaje', align: 'right', render: (b) => formatRateBps(b.percentage_bps) }
];

export function InvestorDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useAsync(() => api.admin.investor(id), [id]);
  const stats = useAsync(() => api.admin.statistics(id), [id]);

  const back = (
    <Link to="/admin/clientes" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
      <Icon name="chevronLeft" className="h-4 w-4" /> Clientes
    </Link>
  );

  return (
    <Async state={detail}>
      {(d) => (
        <>
          <PageHeader
            back={back}
            title={d.profile?.full_name ?? d.user.email}
            subtitle={d.user.email}
            actions={<LinkButton to={`/admin/inversiones/nueva?cliente=${d.user.id}`} icon="plus">Nuevo contrato</LinkButton>}
          />
          <div className="space-y-6">
            <Card title="Datos del cliente">
              <DefinitionList
                items={[
                  { label: 'Cuenta', value: d.user.is_active ? <Badge tone="ok">Activa</Badge> : <Badge tone="bad">Deshabilitada</Badge> },
                  { label: 'Alta', value: formatDate(d.user.created_at.slice(0, 10), 'long') },
                  { label: 'Teléfono', value: d.profile?.phone ?? '—' },
                  { label: 'RFC', value: d.profile?.rfc ?? '—' },
                  { label: 'Domicilio', value: d.profile?.address ?? '—' }
                ]}
              />
            </Card>
            <Card title="Beneficiarios">
              <DataTable
                caption="Beneficiarios"
                columns={beneficiaryColumns}
                rows={d.beneficiaries}
                rowKey={(b) => b.id ?? b.full_name}
                empty={<EmptyState icon="users" title="Sin beneficiarios registrados" />}
              />
            </Card>
            <Card title="Estadísticas del cliente">
              <Async state={stats} loading={<LoadingBlock rows={6} />}>{(s) => <StatsOverview stats={s} scope="cliente" />}</Async>
            </Card>
            <Card title="Contratos">
              <DataTable
                caption="Contratos del cliente"
                columns={columns}
                rows={d.investments}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/admin/inversiones/${r.id}`)}
                empty={<EmptyState title="Sin contratos registrados" />}
              />
            </Card>
          </div>
        </>
      )}
    </Async>
  );
}

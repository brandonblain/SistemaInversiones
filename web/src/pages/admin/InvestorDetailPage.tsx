import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import type { Beneficiary, InvestmentListItem } from '../../api/types';
import { InvestmentStatusBadge } from '../../components/badges';
import { DataTable, type Column } from '../../components/DataTable';
import { Icon } from '../../components/icons';
import { Async, Badge, Card, DefinitionList, EmptyState, LinkButton, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMXN, formatRateBps } from '../../lib/format';
import { investmentTypeLabel, payoutFrequencyLabel, relationshipLabel } from '../../lib/labels';

const columns: Column<InvestmentListItem>[] = [
  { key: 'code', header: 'Código', primary: true, render: (r) => <span className="font-semibold text-brand">{r.code}</span> },
  { key: 'type', header: 'Ramo', render: (r) => investmentTypeLabel[r.investment_type] },
  { key: 'status', header: 'Estado', render: (r) => <InvestmentStatusBadge status={r.status} /> },
  { key: 'capital', header: 'Capital vigente', align: 'right', render: (r) => formatMXN(r.current_capital_cents) },
  { key: 'rate', header: 'Tasa', align: 'right', render: (r) => formatRateBps(r.terms.fixed_annual_rate_bps) },
  { key: 'freq', header: 'Cobro', render: (r) => payoutFrequencyLabel[r.terms.payout_frequency] },
  { key: 'end', header: 'Vencimiento', render: (r) => formatDate(r.maturity_date) },
  { key: 'pending', header: 'Pendiente', align: 'right', render: (r) => formatMXN(r.stats.yield_pending_cents) }
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

  const back = (
    <Link to="/admin/clientes" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
      <Icon name="chevronLeft" className="h-4 w-4" /> Inversionistas
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
            actions={<LinkButton to={`/admin/inversiones/nueva?cliente=${d.user.id}`} icon="plus">Nueva inversión</LinkButton>}
          />
          <div className="space-y-6">
            <Card title="Datos del inversionista">
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
            <Card title="Inversiones">
              <DataTable
                caption="Inversiones del inversionista"
                columns={columns}
                rows={d.investments}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/admin/inversiones/${r.id}`)}
                empty={<EmptyState title="Sin inversiones registradas" />}
              />
            </Card>
          </div>
        </>
      )}
    </Async>
  );
}

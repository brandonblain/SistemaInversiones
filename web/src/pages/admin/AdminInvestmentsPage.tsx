import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { AdminInvestmentRow, InvestmentStatus } from '../../api/types';
import { ArchiveInvestmentModal } from '../../components/admin/ArchiveInvestmentModal';
import { InvestmentStatusBadge } from '../../components/badges';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Alert, Async, Button, Card, EmptyState, errorMessage, LinkButton, PageHeader, SelectInput, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useDebounced } from '../../hooks/useDebounced';
import { useListParams } from '../../hooks/useListParams';
import { formatDate, formatMoney } from '../../lib/format';
import { capitalizationLabel, investmentTypeLabel, payoutFrequencyLabel, rateSummary } from '../../lib/labels';

const columns: Column<AdminInvestmentRow>[] = [
  { key: 'code', header: 'Código', primary: true, render: (r) => <span className="font-semibold text-brand">{r.code}</span> },
  { key: 'investor', header: 'Cliente', render: (r) => r.investor_name ?? r.investor_email },
  { key: 'type', header: 'Giro', render: (r) => investmentTypeLabel[r.investment_type] },
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
  const { values, page, set, setPage } = useListParams(['q', 'estado', 'ver'] as const);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search);
  const [toArchive, setToArchive] = useState<AdminInvestmentRow | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const archived = values.ver === 'eliminados';
  useEffect(() => {
    if (debounced !== values.q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = useAsync(
    () => api.admin.investments({ q: values.q, status: values.estado as InvestmentStatus | '', archived: archived ? '1' : '', page, pageSize: 20 }),
    [values.q, values.estado, archived, page]
  );

  const restore = async (r: AdminInvestmentRow) => {
    setRestoring(r.id);
    setRestoreError(null);
    try {
      await api.admin.restoreInvestment(r.id);
      list.reload();
    } catch (err) {
      setRestoreError(errorMessage(err));
    } finally {
      setRestoring(null);
    }
  };

  // La fila completa abre el detalle; los botones de acción no deben propagar ese clic
  const actions: Column<AdminInvestmentRow> = {
    key: 'actions',
    header: 'Acciones',
    render: (r) => (
      // En la tabla de escritorio solo ícono (con nombre accesible y tooltip); en las tarjetas móviles, con texto
      <div className="flex flex-nowrap gap-1" onClick={(e) => e.stopPropagation()}>
        {archived ? (
          <Button variant="secondary" loading={restoring === r.id} onClick={() => restore(r)} aria-label={`Restaurar ${r.code}`}>Restaurar</Button>
        ) : (
          <>
            <Button variant="ghost" icon="edit" title="Editar" onClick={() => navigate(`/admin/inversiones/${r.id}/editar`)} aria-label={`Editar ${r.code}`}>
              <span className="md:sr-only">Editar</span>
            </Button>
            <Button variant="ghost" icon="trash" title="Eliminar" className="text-bad" onClick={() => setToArchive(r)} aria-label={`Eliminar ${r.code}`}>
              <span className="md:sr-only">Eliminar</span>
            </Button>
          </>
        )}
      </div>
    )
  };

  return (
    <>
      <PageHeader title="Contratos" actions={<LinkButton to="/admin/inversiones/nueva" icon="plus">Nuevo contrato</LinkButton>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <TextInput label="Buscar por código o cliente" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <SelectInput label="Estado" value={values.estado} onChange={(e) => set({ estado: e.target.value })}>
            <option value="">Todos</option>
            <option value="ACTIVE">Vigentes</option>
            <option value="MATURED">Vencidos</option>
            <option value="CANCELLED">Cancelados</option>
            <option value="DRAFT">Borrador</option>
          </SelectInput>
          <SelectInput label="Mostrar" value={values.ver} onChange={(e) => set({ ver: e.target.value })}>
            <option value="">Contratos actuales</option>
            <option value="eliminados">Eliminados</option>
          </SelectInput>
        </div>
        {archived && (
          <div className="mb-4">
            <Alert tone="info">Contratos eliminados: no se muestran en el portal ni en las estadísticas. Puede restaurarlos con todo su historial.</Alert>
          </div>
        )}
        {restoreError && <div className="mb-4"><Alert tone="bad">{restoreError}</Alert></div>}
        <Async state={list}>
          {(res) => (
            <>
              <DataTable
                caption="Contratos"
                columns={[...columns, actions]}
                rows={res.data}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/admin/inversiones/${r.id}`)}
                empty={<EmptyState title={archived ? 'No hay contratos eliminados' : 'Sin contratos con estos filtros'} />}
              />
              <Pagination info={res.pagination} onPage={setPage} />
            </>
          )}
        </Async>
      </Card>
      <ArchiveInvestmentModal
        investment={toArchive}
        onClose={() => setToArchive(null)}
        onArchived={() => {
          setToArchive(null);
          list.reload();
        }}
      />
    </>
  );
}

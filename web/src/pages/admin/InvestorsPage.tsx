import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { AdminInvestorRow } from '../../api/types';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Async, Badge, Card, EmptyState, LinkButton, PageHeader, SelectInput, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useDebounced } from '../../hooks/useDebounced';
import { useListParams } from '../../hooks/useListParams';
import { formatDate } from '../../lib/format';

const columns: Column<AdminInvestorRow>[] = [
  { key: 'name', header: 'Nombre', primary: true, render: (r) => <span className="font-semibold text-brand">{r.full_name ?? '—'}</span> },
  { key: 'email', header: 'Correo', render: (r) => r.email },
  { key: 'phone', header: 'Teléfono', hideOnMobile: true, render: (r) => r.phone ?? '—' },
  { key: 'count', header: 'Inversiones', align: 'right', render: (r) => r.investments_count },
  { key: 'active', header: 'Cuenta', render: (r) => (r.is_active ? <Badge tone="ok">Activa</Badge> : <Badge tone="bad">Deshabilitada</Badge>) },
  { key: 'created', header: 'Alta', hideOnMobile: true, render: (r) => formatDate(r.created_at.slice(0, 10)) }
];

export function InvestorsPage() {
  const navigate = useNavigate();
  const { values, page, set, setPage } = useListParams(['q', 'cuenta'] as const);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search);
  useEffect(() => {
    if (debounced !== values.q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = useAsync(
    () => api.admin.investors({ q: values.q, active: values.cuenta as '' | '1' | '0', page, pageSize: 20 }),
    [values.q, values.cuenta, page]
  );

  return (
    <>
      <PageHeader
        title="Inversionistas"
        actions={<LinkButton to="/admin/clientes/nuevo" icon="plus">Nuevo cliente</LinkButton>}
      />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <TextInput label="Buscar por nombre o correo" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <SelectInput label="Cuenta" value={values.cuenta} onChange={(e) => set({ cuenta: e.target.value })}>
            <option value="">Todas</option>
            <option value="1">Activas</option>
            <option value="0">Deshabilitadas</option>
          </SelectInput>
        </div>
        <Async state={list}>
          {(res) => (
            <>
              <DataTable
                caption="Inversionistas"
                columns={columns}
                rows={res.data}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/admin/clientes/${r.id}`)}
                empty={<EmptyState icon="users" title="Sin resultados">Ajuste la búsqueda o dé de alta un inversionista.</EmptyState>}
              />
              <Pagination info={res.pagination} onPage={setPage} />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { AuditLogRow } from '../../api/types';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Async, Badge, Card, EmptyState, PageHeader, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useDebounced } from '../../hooks/useDebounced';
import { formatDateTime } from '../../lib/format';

function JsonDetails({ label, json }: { label: string; json: string | null }) {
  if (!json) return null;
  let pretty = json;
  try {
    pretty = JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    /* se muestra tal cual */
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium text-brand">{label}</summary>
      <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded bg-sunken p-2 text-ink-2">{pretty}</pre>
    </details>
  );
}

const columns: Column<AuditLogRow>[] = [
  { key: 'date', header: 'Fecha', primary: true, render: (r) => formatDateTime(r.created_at) },
  { key: 'actor', header: 'Usuario', render: (r) => r.actor_email ?? 'Sistema' },
  { key: 'action', header: 'Acción', render: (r) => <Badge tone="brand">{r.action}</Badge> },
  { key: 'entity', header: 'Entidad', render: (r) => <span className="break-all text-xs">{r.entity_type} · {r.entity_id}</span> },
  {
    key: 'values',
    header: 'Cambios',
    render: (r) => (
      <div className="space-y-1">
        <JsonDetails label="Antes" json={r.old_values_json} />
        <JsonDetails label="Después" json={r.new_values_json} />
        {!r.old_values_json && !r.new_values_json && '—'}
      </div>
    )
  }
];

export function AuditLogPage() {
  const [search, setSearch] = useState('');
  const action = useDebounced(search);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [action]);
  const logs = useAsync(() => api.admin.auditLogs({ action, page, pageSize: 20 }), [action, page]);

  return (
    <>
      <PageHeader title="Bitácora" subtitle="Registro inmutable de acciones administrativas y financieras." />
      <Card>
        <div className="mb-4 max-w-sm">
          <TextInput label="Filtrar por acción" type="search" placeholder="Ej. PAYMENT, YIELD, DOCUMENT" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Async state={logs}>
          {(res) => (
            <>
              <DataTable caption="Bitácora de auditoría" columns={columns} rows={res.data} rowKey={(r) => r.id} empty={<EmptyState icon="clock" title="Sin registros" />} />
              <Pagination info={res.pagination} onPage={setPage} />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

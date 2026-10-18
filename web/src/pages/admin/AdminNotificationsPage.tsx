import { useState } from 'react';
import { api } from '../../api';
import type { NotificationEvent } from '../../api/types';
import { NotificationStatusBadge } from '../../components/badges';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Async, Card, EmptyState, PageHeader, SelectInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../lib/format';
import { notificationEventLabel } from '../../lib/labels';

const columns: Column<NotificationEvent>[] = [
  { key: 'date', header: 'Fecha', primary: true, render: (r) => formatDateTime(r.created_at) },
  { key: 'to', header: 'Destinatario', render: (r) => r.recipient_email ?? '—' },
  { key: 'type', header: 'Evento', render: (r) => notificationEventLabel[r.event_type] ?? r.event_type },
  { key: 'subject', header: 'Asunto', hideOnMobile: true, render: (r) => r.subject },
  { key: 'status', header: 'Estado', render: (r) => <NotificationStatusBadge status={r.status} /> },
  {
    key: 'attempts',
    header: 'Intentos',
    align: 'right',
    render: (r) => (
      <>
        {r.attempts_count ?? 0}
        {r.error_message && <span className="block text-xs text-bad">{r.error_message}</span>}
      </>
    )
  }
];

export function AdminNotificationsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useAsync(() => api.admin.notifications({ status, page, pageSize: 20 }), [status, page]);

  return (
    <>
      <PageHeader title="Avisos por correo" subtitle="Registro de envíos. Los correos no incluyen saldos ni montos." />
      <Card>
        <div className="mb-4 max-w-xs">
          <SelectInput label="Estado" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="PENDING">En cola</option>
            <option value="SENT">Enviados</option>
            <option value="FAILED">Con error</option>
          </SelectInput>
        </div>
        <Async state={list}>
          {(res) => (
            <>
              <DataTable caption="Avisos por correo" columns={columns} rows={res.data} rowKey={(r) => r.id} empty={<EmptyState icon="bell" title="Sin avisos" />} />
              <Pagination info={res.pagination} onPage={setPage} />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

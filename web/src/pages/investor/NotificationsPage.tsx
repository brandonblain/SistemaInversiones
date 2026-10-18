import { useState } from 'react';
import { api } from '../../api';
import type { NotificationEvent } from '../../api/types';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Async, Card, EmptyState, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../lib/format';
import { notificationEventLabel } from '../../lib/labels';

const columns: Column<NotificationEvent>[] = [
  { key: 'date', header: 'Fecha', render: (r) => formatDateTime(r.created_at) },
  { key: 'type', header: 'Tipo', render: (r) => notificationEventLabel[r.event_type] ?? r.event_type },
  { key: 'subject', header: 'Asunto', primary: true, render: (r) => r.subject }
];

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const list = useAsync(() => api.investor.notifications({ page, pageSize: 20 }), [page]);
  return (
    <>
      <PageHeader title="Avisos" subtitle="Copia de los avisos importantes que le enviamos por correo electrónico." />
      <Card>
        <Async state={list}>
          {(res) => (
            <>
              <DataTable caption="Avisos enviados" columns={columns} rows={res.data} rowKey={(r) => r.id} empty={<EmptyState icon="bell" title="Sin avisos por ahora" />} />
              <Pagination info={res.pagination} onPage={setPage} />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

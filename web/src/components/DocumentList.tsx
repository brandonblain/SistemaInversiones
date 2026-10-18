import { useState } from 'react';
import { api } from '../api';
import type { InvestmentDocument } from '../api/types';
import { formatBytes, formatDateTime } from '../lib/format';
import { saveBlob } from '../lib/download';
import { documentTypeLabel } from '../lib/labels';
import { Icon } from './icons';
import { Alert, Badge, Button, EmptyState, errorMessage } from './ui';

/** Lista de documentos privados (solo administración) con descarga autenticada, sin enlaces públicos. */
export function DocumentList({ docs, showInvestment = false, extraAction }: { docs: InvestmentDocument[]; showInvestment?: boolean; extraAction?: (d: InvestmentDocument) => React.ReactNode }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (d: InvestmentDocument) => {
    if (busy) return;
    setBusy(d.id);
    setError(null);
    try {
      const { blob, filename } = await api.admin.downloadDocument(d.id);
      saveBlob(blob, filename ?? d.original_filename);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (docs.length === 0) {
    return <EmptyState icon="file" title="No hay documentos">Use “Subir documento” para agregar contratos o constancias.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="bad">{error}</Alert>}
      <ul className="divide-y divide-line">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="rounded-lg bg-brand-soft p-2 text-brand"><Icon name="file" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{d.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <Badge tone="brand">{documentTypeLabel[d.document_type] ?? d.document_type}</Badge>
                {showInvestment && d.investment_code && <span>{d.investment_code}</span>}
                <span>{formatDateTime(d.created_at)}</span>
                <span>{formatBytes(d.size_bytes)}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" icon="download" loading={busy === d.id} onClick={() => download(d)} aria-label={`Descargar ${d.title}`}>
                Descargar
              </Button>
              {extraAction?.(d)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

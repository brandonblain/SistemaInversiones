import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import type { DocumentType, InvestmentDocument } from '../../api/types';
import { InvestmentPicker } from '../../components/admin/InvestmentPicker';
import { Pagination } from '../../components/DataTable';
import { DocumentList } from '../../components/DocumentList';
import { Modal } from '../../components/Modal';
import { Alert, Async, Button, Card, errorMessage, PageHeader, SelectInput, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatBytes } from '../../lib/format';
import { documentTypeLabel } from '../../lib/labels';

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_BYTES = 15 * 1024 * 1024;

/** Gestor de documentos: exclusivo de administración (el inversionista no tiene acceso a documentos). */
export function AdminDocumentsPage() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('inversion') ?? '';
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(!!filter);
  const [toArchive, setToArchive] = useState<InvestmentDocument | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const docs = useAsync(() => api.admin.documents({ investment_id: filter || undefined, page, pageSize: 20 }), [filter, page]);

  const archive = async () => {
    if (!toArchive || archiving) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      await api.admin.archiveDocument(toArchive.id);
      setToArchive(null);
      docs.reload();
    } catch (err) {
      setArchiveError(errorMessage(err));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle="Contratos y documentos internos en almacenamiento privado. Solo la administración puede verlos."
        actions={!showUpload && <Button icon="plus" onClick={() => setShowUpload(true)}>Subir documento</Button>}
      />

      {showUpload && (
        <UploadForm
          defaultInvestmentId={filter}
          onCancel={() => setShowUpload(false)}
          onUploaded={(investmentId) => {
            if (filter && filter !== investmentId) setParams({ inversion: investmentId }, { replace: true });
            docs.reload();
          }}
        />
      )}

      <Card className="mt-4" title="Documentos registrados">
        <div className="mb-4 max-w-xl">
          <InvestmentPicker
            value={filter}
            label="Filtrar por contrato"
            onChange={(id) => { setParams(id ? { inversion: id } : {}, { replace: true }); setPage(1); }}
          />
        </div>
        <Async state={docs}>
          {(res) => (
            <>
              <DocumentList
                docs={res.data}
                showInvestment
                extraAction={(d) => (
                  <Button variant="ghost" className="text-bad" onClick={() => setToArchive(d)}>Archivar</Button>
                )}
              />
              <Pagination info={res.pagination} onPage={setPage} />
            </>
          )}
        </Async>
      </Card>

      <Modal
        open={!!toArchive}
        title="Archivar documento"
        onClose={() => setToArchive(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToArchive(null)}>Cancelar</Button>
            <Button variant="danger" loading={archiving} onClick={archive}>Archivar</Button>
          </>
        }
      >
        {archiveError && <Alert tone="bad">{archiveError}</Alert>}
        <p className="text-sm text-ink-2">“{toArchive?.title}” dejará de aparecer en la lista. La acción queda registrada en la bitácora.</p>
      </Modal>
    </>
  );
}

function UploadForm({ defaultInvestmentId, onUploaded, onCancel }: { defaultInvestmentId: string; onUploaded: (investmentId: string) => void; onCancel: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [investmentId, setInvestmentId] = useState(defaultInvestmentId);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocumentType>('CONTRACT');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const pick = (f: File | null) => {
    setOk(null);
    setError(null);
    if (f && !ALLOWED.includes(f.type)) {
      setError('Solo se admiten archivos PDF, PNG o JPEG.');
      setFile(null);
      return;
    }
    if (f && f.size > MAX_BYTES) {
      setError(`El archivo pesa ${formatBytes(f.size)}; el máximo es 15 MB.`);
      setFile(null);
      return;
    }
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setOk(null);
    if (!investmentId) return setError('Seleccione el contrato al que pertenece el documento.');
    if (!file) return setError('Seleccione un archivo.');
    if (title.trim().length < 3) return setError('Escriba un título descriptivo.');
    setPending(true);
    setError(null);
    try {
      await api.admin.uploadDocument({ investment_id: investmentId, title: title.trim(), document_type: type, file });
      setOk(`Documento “${title.trim()}” guardado.`);
      setFile(null);
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      onUploaded(investmentId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title="Subir documento" actions={<Button variant="ghost" onClick={onCancel}>Cerrar</Button>}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {error && <div className="sm:col-span-2"><Alert tone="bad">{error}</Alert></div>}
        {ok && <div className="sm:col-span-2"><Alert tone="ok">{ok}</Alert></div>}
        <div className="sm:col-span-2">
          <InvestmentPicker value={investmentId} onChange={setInvestmentId} label="Contrato" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="doc-file">Archivo (PDF, PNG o JPEG · máx. 15 MB)</label>
          <input
            id="doc-file"
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-2 file:mr-3 file:min-h-[44px] file:rounded-lg file:border-0 file:bg-brand file:px-4 file:font-semibold file:text-brand-ink"
          />
          {file && <p className="mt-1 text-xs text-ink-muted">{file.name} · {formatBytes(file.size)}</p>}
        </div>
        <TextInput label="Título del documento" value={title} onChange={(e) => setTitle(e.target.value)} />
        <SelectInput label="Tipo de documento" value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
          {(Object.keys(documentTypeLabel) as DocumentType[]).map((k) => <option key={k} value={k}>{documentTypeLabel[k]}</option>)}
        </SelectInput>
        <div className="sm:col-span-2">
          <Button type="submit" icon="plus" loading={pending}>Guardar documento</Button>
        </div>
      </form>
    </Card>
  );
}

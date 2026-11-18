import { useState } from 'react';
import { api } from '../../api';
import { Modal } from '../Modal';
import { Alert, Button, errorMessage } from '../ui';

/** Confirmación de "Eliminar contrato": lo archiva (se conserva con su historial y se puede restaurar). */
export function ArchiveInvestmentModal({ investment, onClose, onArchived }: { investment: { id: string; code: string } | null; onClose: () => void; onArchived: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };
  const archive = async () => {
    if (!investment || pending) return;
    setPending(true);
    setError(null);
    try {
      await api.admin.archiveInvestment(investment.id);
      onArchived();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={!!investment}
      title="Eliminar contrato"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancelar</Button>
          <Button variant="danger" loading={pending} onClick={archive}>Eliminar</Button>
        </>
      }
    >
      {error && <Alert tone="bad">{error}</Alert>}
      <p className="text-sm text-ink-2">
        El contrato <strong className="text-ink">{investment?.code}</strong> dejará de aparecer en las tablas, las estadísticas y el portal del cliente.
        Su historial (capital, rendimientos, pagos y documentos) se conserva y puede restaurarlo desde el filtro «Eliminados». La acción queda
        registrada en la bitácora.
      </p>
    </Modal>
  );
}

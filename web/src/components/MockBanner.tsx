import { USING_MOCKS } from '../api';

/** Franja visible en TODAS las pantallas cuando la app usa datos de prueba. */
export function MockBanner() {
  if (!USING_MOCKS) return null;
  return (
    <div role="note" className="border-b border-warn/50 bg-warn-soft px-4 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-ink">
      Prototipo con datos FICTICIOS · ninguna cifra corresponde a un inversionista real
    </div>
  );
}

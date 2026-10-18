import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { api } from '../api';
import { formatMXN } from '../lib/format';
import { INVESTOR_2_ID, INVESTOR_ID, renderApp } from './render';

describe('Área del inversionista', () => {
  it('muestra los seis indicadores por separado, con las cifras exactas de la API', async () => {
    renderApp('/app', { loginAs: INVESTOR_ID });
    await screen.findByTestId('kpi-capital');
    const s = await api.investor.summary();

    const expectTile = (id: string, label: string, cents: number) => {
      const tile = screen.getByTestId(id);
      expect(within(tile).getByText(label)).toBeInTheDocument();
      expect(within(tile).getByText(formatMXN(cents))).toBeInTheDocument();
    };
    expectTile('kpi-capital', 'Capital vigente', s.total_capital_cents);
    expectTile('kpi-generated', 'Rendimiento generado', s.total_yield_generated_cents);
    expectTile('kpi-confirmed', 'Rendimiento confirmado', s.total_yield_confirmed_cents);
    expectTile('kpi-paid', 'Pagado', s.total_yield_paid_cents);
    expectTile('kpi-reinvested', 'Reinvertido', s.total_yield_reinvested_cents);
    expectTile('kpi-pending', 'Pendiente de pago', s.total_yield_pending_cents);
    expect(screen.getByText(/No es dinero disponible en una cuenta bancaria/)).toBeInTheDocument();
  });

  it('no ofrece controles administrativos, transferencias ni retiros', async () => {
    renderApp('/app', { loginAs: INVESTOR_ID });
    await screen.findByTestId('kpi-capital');
    for (const text of [/transferir/i, /retir/i, /pagos externos/i, /bitácora/i, /registrar pago/i, /confirmar rendimiento/i]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: text })).not.toBeInTheDocument();
    }
  });

  it('lista varias inversiones con tasa, modalidad y fechas, y filtra por estado', async () => {
    const user = userEvent.setup();
    renderApp('/app/inversiones', { loginAs: INVESTOR_ID });
    expect((await screen.findAllByText('FICT-2026-001')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('FICT-2025-002').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FICT-2025-003').length).toBeGreaterThan(0);
    expect(screen.getAllByText('16.00 %').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Semestral').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Al vencimiento (liquidación)').length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText('Estado'), 'MATURED');
    expect(await screen.findAllByText('FICT-2025-003')).not.toHaveLength(0);
    expect(screen.queryByText('FICT-2026-001')).not.toBeInTheDocument();
  });

  it('el detalle separa rendimientos y pagos reales en el historial', async () => {
    const user = userEvent.setup();
    renderApp('/app/inversiones/inv_fict_001', { loginAs: INVESTOR_ID });
    expect(await screen.findByText('Condiciones del contrato')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Rendimientos y pagos' }));
    expect((await screen.findAllByText('Pago recibido')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ref\. FICTICIO-SPEI-/).length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText('Mostrar'), 'YIELDS');
    await screen.findAllByText('Rendimiento');
    expect(screen.queryByText('Pago recibido')).not.toBeInTheDocument();
  });

  it('la gráfica ofrece vista de tabla con capital y rendimiento por destino', async () => {
    const user = userEvent.setup();
    renderApp('/app/inversiones/inv_fict_002', { loginAs: INVESTOR_ID });
    await screen.findByText('Condiciones del contrato');
    await user.click(screen.getByRole('tab', { name: 'Evolución' }));
    await user.click(await screen.findByRole('button', { name: 'Ver como tabla' }, { timeout: 8000 }));
    expect(screen.getByRole('columnheader', { name: 'Reinvertido' })).toBeInTheDocument();
    expect(screen.getByText(/No incluyen proyecciones/)).toBeInTheDocument();
  });

  it('no permite ver la inversión de otro inversionista', async () => {
    renderApp('/app/inversiones/inv_fict_001', { loginAs: INVESTOR_2_ID });
    expect(await screen.findByText('Sin acceso a esta información')).toBeInTheDocument();
  });

  it('el inversionista no tiene menú ni pestaña de documentos y ve el ramo', async () => {
    renderApp('/app/inversiones/inv_fict_001', { loginAs: INVESTOR_ID });
    await screen.findByText('Condiciones del contrato');
    expect(screen.queryByRole('link', { name: /Documentos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Documentos/ })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Movilidad/).length).toBeGreaterThan(0);
  });

  it('la antigua ruta de documentos del inversionista ya no existe', async () => {
    renderApp('/app/documentos', { loginAs: INVESTOR_ID });
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });

  it('sus avisos no incluyen publicaciones de documentos', async () => {
    renderApp('/app/avisos', { loginAs: INVESTOR_ID });
    expect((await screen.findAllByText('Pago registrado')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Documento publicado')).not.toBeInTheDocument();
  });

  it('el perfil es de solo lectura salvo la contraseña', async () => {
    const user = userEvent.setup();
    renderApp('/app/perfil', { loginAs: INVESTOR_ID });
    expect((await screen.findAllByText('Héctor Galeana')).length).toBeGreaterThan(0);
    const inputs = screen.getAllByLabelText(/contraseña/i);
    expect(inputs).toHaveLength(3);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Contraseña actual'), 'Ficticio123!');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'corta');
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'corta');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('Use al menos 10 caracteres.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Nueva contraseña'));
    await user.clear(screen.getByLabelText('Confirmar nueva contraseña'));
    await user.type(screen.getByLabelText('Nueva contraseña'), 'NuevaClave2026');
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'NuevaClave2026');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText(/Contraseña actualizada/)).toBeInTheDocument();
  });
});

import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { ADMIN_ID, INVESTOR_ID, renderApp } from './render';

afterEach(() => vi.restoreAllMocks());

const unavailable = () =>
  vi.spyOn(api.public, 'market').mockResolvedValue({ available: false, fx: null, cetes: {}, source: 'Banco de México (SIE)', fetched_at: null, stale: false });

describe('Indicadores de Banxico', () => {
  it('página web: tipo de cambio FIX y CETES − 1 con la tasa del día', async () => {
    renderApp('/');
    expect(await screen.findByTestId('fx-publico')).toHaveTextContent('Tipo de cambio FIX: $18.4253 por dólar');
    expect(screen.getByTestId('cetes-publico')).toHaveTextContent('CETES 28 días: 6.25 %');
    expect(screen.getByText('punto · hoy ≈ 5.25 % anual')).toBeInTheDocument();
    expect(screen.getByText('CETES − 1')).toBeInTheDocument();
  });

  it('página web sin datos de Banxico: se mantiene el contenido fijo', async () => {
    unavailable();
    renderApp('/');
    expect(await screen.findByText('CETES − 1')).toBeInTheDocument();
    expect(screen.getByText('punto · variable, solo en pesos')).toBeInTheDocument();
    expect(screen.queryByTestId('fx-publico')).not.toBeInTheDocument();
  });

  it('cuenta del cliente: tipo de cambio y CETES 28 como referencia informativa', async () => {
    renderApp('/app', { loginAs: INVESTOR_ID });
    const panel = (await screen.findByRole('heading', { name: 'Indicadores de Banco de México' })).closest('section') as HTMLElement;
    expect(await within(panel).findByText('$18.4253')).toBeInTheDocument();
    expect(within(panel).getByText('6.25 %')).toBeInTheDocument();
    expect(within(panel).getByText(/no modifica sus saldos/)).toBeInTheDocument();
    expect(within(panel).queryByText('Importar tasas')).not.toBeInTheDocument();
  });

  it('cuenta del cliente sin datos de Banxico: el panel no aparece', async () => {
    unavailable();
    renderApp('/app', { loginAs: INVESTOR_ID });
    await screen.findByTestId('kpi-capital');
    expect(screen.queryByRole('heading', { name: 'Indicadores de Banco de México' })).not.toBeInTheDocument();
  });

  it('administración: FIX, los cuatro plazos y aviso de tasas nuevas por importar', async () => {
    renderApp('/admin', { loginAs: ADMIN_ID });
    const panel = (await screen.findByRole('heading', { name: 'Indicadores de Banco de México' })).closest('section') as HTMLElement;
    expect(await within(panel).findByText('$18.4253')).toBeInTheDocument();
    for (const rate of ['6.25 %', '6.55 %', '6.79 %', '7.11 %']) expect(within(panel).getByText(rate)).toBeInTheDocument();
    expect(within(panel).getAllByText('Nueva en Banxico').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Tasas CETES en el sistema (para cálculos)' })).toBeInTheDocument();
  });

  it('administración sin datos de Banxico: indica revisar el token', async () => {
    unavailable();
    renderApp('/admin', { loginAs: ADMIN_ID });
    expect(await screen.findByText(/BANXICO_TOKEN/)).toBeInTheDocument();
  });
});

import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { ADMIN_ID, INVESTOR_ID, renderApp } from './render';

afterEach(() => vi.restoreAllMocks());

const unavailable = () =>
  vi.spyOn(api.public, 'market').mockResolvedValue({ available: false, fx: null, cetes: {}, indicators: [], source: 'Banco de México (SIE)', fetched_at: null, stale: false });

describe('Indicadores de Banxico', () => {
  it('página web sin datos de Banxico: no aparece la cinta y el resto de la página sigue igual', async () => {
    unavailable();
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Negocios B2B/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Indicadores de Banco de México' })).not.toBeInTheDocument();
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

  it('cinta de indicadores en la página web, la cuenta del cliente y la administración', async () => {
    for (const [path, opts] of [['/', {}], ['/app', { loginAs: INVESTOR_ID }], ['/admin', { loginAs: ADMIN_ID }]] as const) {
      const view = renderApp(path, opts);
      const ticker = await screen.findByRole('region', { name: 'Indicadores de Banco de México' });
      const [visible, copy] = ticker.querySelectorAll('ul');
      expect(copy).toHaveAttribute('aria-hidden', 'true'); // la copia del bucle no se lee dos veces
      for (const label of ['Dólar FIX', 'Euro', 'Libra esterlina', 'UDIS', 'Tasa objetivo Banxico', 'TIIE 28 días', 'CETES 28 días', 'Inflación anual']) {
        expect(within(visible as HTMLElement).getByText(label)).toBeInTheDocument();
      }
      expect(within(visible as HTMLElement).getByText('$18.4253')).toBeInTheDocument();
      expect(within(visible as HTMLElement).getByText('8.861350')).toBeInTheDocument();
      // La variación no depende solo del color: flecha + texto para lectores de pantalla
      expect(within(visible as HTMLElement).getAllByText('sube', { exact: false }).length).toBeGreaterThan(0);
      view.unmount();
    }
  });
});

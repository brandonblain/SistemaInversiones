import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN_ID, INVESTOR_ID, renderApp } from './render';

describe('Página web pública', () => {
  it('muestra los tipos de inversión y el acceso para clientes arriba a la derecha', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Unimos a los dueños del capital/ })).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: /Acceso clientes/ })).toHaveAttribute('href', '/login');
    for (const name of ['Movilidad', 'Transporte', 'Fast Food', 'CETES']) {
      expect(screen.getAllByRole('heading', { name }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('16 %')).toHaveLength(2); // Movilidad y Vehículos eléctricos
    expect(screen.getByRole('heading', { name: 'Vehículos eléctricos' })).toBeInTheDocument();
    expect(await screen.findByTestId('cetes-tasa')).toHaveTextContent('5.25 %'); // CETES 28 (6.25 %) − 1 punto
    for (const m of ['Mensual', 'Semestral', 'Anual', 'A liquidación']) expect(screen.getByRole('heading', { name: m })).toBeInTheDocument();
    expect(screen.getByText('Héctor Galeana')).toBeInTheDocument();
    expect(screen.getByText(/rendimientos pasados no garantizan/)).toBeInTheDocument();
  });

  it('el botón lleva al login y con sesión iniciada dice "Ir a mi portal"', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: /Acceso clientes/ }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al sitio/ })).toBeInTheDocument();
  });

  it('el menú móvil abre las secciones y se cierra con Escape o al elegir una', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const toggle = await screen.findByRole('button', { name: 'Abrir menú' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    const menu = document.getElementById('menu-sitio')!;
    expect(within(menu).getByRole('link', { name: /Inversiones/ })).toHaveAttribute('href', '#inversiones');
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(document.getElementById('menu-sitio')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    await user.click(within(document.getElementById('menu-sitio')!).getByRole('link', { name: /Ramos/ }));
    expect(document.getElementById('menu-sitio')).toBeNull();
  });

  it('con sesión iniciada ofrece ir al portal', async () => {
    renderApp('/', { loginAs: INVESTOR_ID });
    expect(await within(screen.getByRole('banner')).findByRole('link', { name: /Ir a mi portal/ })).toHaveAttribute('href', '/app');
  });
});

describe('Estadísticas de administración', () => {
  it('general: bloques por moneda con capital, rendimientos y tasa ponderada', async () => {
    renderApp('/admin/estadisticas', { loginAs: ADMIN_ID });
    expect(await screen.findByRole('heading', { name: 'Pesos mexicanos (MXN)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dólares estadounidenses (USD)' })).toBeInTheDocument();
    expect(screen.getAllByText('Tasa fija promedio ponderada').length).toBe(2);
    expect(screen.getAllByText('Capital inicial colocado').length).toBe(2);
    expect(screen.getByText('Vencimientos en los próximos 90 días')).toBeInTheDocument();
  });

  it('por cliente y todas las inversiones con saldos y filtros', async () => {
    const user = userEvent.setup();
    renderApp('/admin/estadisticas', { loginAs: ADMIN_ID });
    await user.click(await screen.findByRole('tab', { name: 'Por cliente' }));
    expect((await screen.findAllByText('Héctor Galeana')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cesar Daniel').length).toBe(4); // tabla + tarjeta, en MXN y USD

    await user.click(screen.getByRole('tab', { name: 'Todas las inversiones' }));
    expect((await screen.findAllByText('FICT-2026-007')).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText('Moneda'), 'USD');
    await screen.findAllByText('FICT-2026-006');
    expect(screen.queryByText('FICT-2026-001')).not.toBeInTheDocument();
    expect(screen.getAllByText('US$20,000.00').length).toBeGreaterThan(0);
  });

  it('el detalle del cliente incluye sus estadísticas', async () => {
    renderApp('/admin/clientes/usr_fict_03', { loginAs: ADMIN_ID });
    expect(await screen.findByText('Estadísticas del cliente')).toBeInTheDocument();
    expect((await screen.findAllByText('Capital inicial colocado')).length).toBeGreaterThan(0);
  });
});

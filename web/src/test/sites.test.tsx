import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { portalHref, publicHref, readSiteConfig, resetSiteConfig } from '../lib/site';
import { ADMIN_ID, INVESTOR_ID, renderApp } from './render';

const PUBLIC = 'https://pimexfortexcapital.com.mx';
const PORTAL = 'https://clientes.pimexfortexcapital.com.mx';

/** Simula la etiqueta <meta name="site"> que inyecta el Worker según el dominio. */
function asSite(kind: 'public' | 'portal') {
  const meta = document.createElement('meta');
  meta.name = 'site';
  meta.dataset.kind = kind;
  meta.dataset.publicUrl = PUBLIC;
  meta.dataset.portalUrl = PORTAL;
  document.head.appendChild(meta);
  resetSiteConfig();
}

afterEach(() => {
  document.head.querySelectorAll('meta[name="site"]').forEach((m) => m.remove());
  resetSiteConfig();
});

describe('Configuración del sitio', () => {
  it('sin etiqueta (desarrollo/pruebas) es un solo sitio con enlaces relativos', () => {
    expect(readSiteConfig()).toEqual({ kind: 'combined', publicUrl: '', portalUrl: '' });
    expect(portalHref('/')).toBe('/');
    expect(publicHref()).toBe('/');
  });

  it('ignora direcciones que no son un origen http(s) limpio', () => {
    asSite('portal');
    document.head.querySelector<HTMLMetaElement>('meta[name="site"]')!.dataset.publicUrl = 'javascript:alert(1)';
    resetSiteConfig();
    expect(readSiteConfig().publicUrl).toBe('');
    expect(publicHref()).toBe('/');
  });
});

describe('Sitio público (pimexfortexcapital.com.mx)', () => {
  it('muestra la página corporativa y "Acceso clientes" lleva al subdominio privado', async () => {
    asSite('public');
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Negocios B2B para desarrollar/ })).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: /Acceso clientes/ })).toHaveAttribute('href', `${PORTAL}/`);
    for (const link of screen.getAllByRole('link', { name: /Acceso clientes/ })) expect(link).toHaveAttribute('href', `${PORTAL}/`);
  });

  it('aunque exista sesión en el mock, el sitio público no la consulta ni ofrece "Ir a mi portal"', async () => {
    asSite('public');
    renderApp('/', { loginAs: INVESTOR_ID });
    expect(await screen.findByRole('heading', { level: 1, name: /Negocios B2B/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ir a mi portal/ })).not.toBeInTheDocument();
  });
});

describe('Portal de clientes (clientes.pimexfortexcapital.com.mx)', () => {
  it('sin sesión, la raíz muestra directamente el login y "Volver al sitio" va al dominio público', async () => {
    asSite('portal');
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /Negocios B2B/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al sitio/ })).toHaveAttribute('href', `${PUBLIC}/`);
  });

  it('inversionista con sesión: la raíz lo lleva a su panel', async () => {
    asSite('portal');
    renderApp('/', { loginAs: INVESTOR_ID });
    expect(await screen.findByTestId('kpi-capital')).toBeInTheDocument();
  });

  it('administrador con sesión: la raíz lo lleva a la administración', async () => {
    asSite('portal');
    renderApp('/', { loginAs: ADMIN_ID });
    expect(await screen.findByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Estadísticas/ }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('kpi-capital')).not.toBeInTheDocument();
  });

  it('un inversionista que entra a /admin vuelve a su propio panel', async () => {
    asSite('portal');
    renderApp('/admin', { loginAs: INVESTOR_ID });
    expect(await screen.findByTestId('kpi-capital')).toBeInTheDocument();
  });
});

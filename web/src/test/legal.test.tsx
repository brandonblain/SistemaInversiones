import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LEGAL_DOCS } from '../legal/documents';
import { INVESTOR_ID, renderApp } from './render';

describe('Documentos legales', () => {
  it('el índice lista los 8 documentos en dos grupos', async () => {
    renderApp('/legal');
    expect(await screen.findByRole('heading', { level: 1, name: 'Documentos legales' })).toBeInTheDocument();
    expect(LEGAL_DOCS).toHaveLength(8);
    for (const d of LEGAL_DOCS) expect(screen.getByRole('link', { name: new RegExp(d.title.replace(/[()]/g, '.')) })).toHaveAttribute('href', `/legal/${d.slug}`);
    expect(screen.getByRole('heading', { name: /Para inversionistas/ })).toBeInTheDocument();
  });

  it.each(LEGAL_DOCS.map((d) => [d.slug, d.title]))('%s: título, aviso de borrador y datos por completar resaltados', async (slug, title) => {
    const { container } = renderApp(`/legal/${slug}`);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText('Borrador pendiente de revisión legal')).toBeInTheDocument();
    expect(container.querySelectorAll('article mark.legal-placeholder').length).toBeGreaterThan(0);
    // Navegación entre documentos con el actual marcado
    const nav = screen.getByRole('navigation', { name: 'Documentos legales' });
    expect(within(nav).getAllByRole('link')).toHaveLength(8);
  });

  it('la política de cookies describe la única cookie real y no inventa analítica ni publicidad', async () => {
    renderApp('/legal/politica-de-cookies');
    expect(await screen.findByRole('cell', { name: 'auth_session' })).toBeInTheDocument();
    expect(screen.getByText(/No usamos cookies analíticas/)).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2); // encabezado + auth_session
  });

  it('la declaración de riesgos destaca las advertencias obligatorias', async () => {
    renderApp('/legal/declaracion-de-riesgos');
    expect(await screen.findByText(/conlleva riesgos inherentes al mercado financiero, incluido el de pérdida parcial o total/)).toBeInTheDocument();
    expect(screen.getByText(/no es una institución bancaria ni realiza actividades reguladas de intermediación financiera/)).toBeInTheDocument();
    expect(screen.getByText('Rendimientos pasados no garantizan rendimientos futuros.')).toBeInTheDocument();
  });

  it('documento inexistente', async () => {
    renderApp('/legal/no-existe');
    expect(await screen.findByText('Documento no encontrado')).toBeInTheDocument();
  });

  it('enlaces desde la página web, el login y el perfil del inversionista', async () => {
    let view = renderApp('/');
    const footerNav = await screen.findByRole('navigation', { name: 'Documentos legales' });
    expect(within(footerNav).getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '/legal/aviso-de-privacidad');
    view.unmount();

    view = renderApp('/login');
    expect(await screen.findByRole('link', { name: 'Términos y condiciones' })).toHaveAttribute('href', '/legal/terminos-y-condiciones');
    view.unmount();

    renderApp('/app/perfil', { loginAs: INVESTOR_ID });
    const card = (await screen.findByRole('heading', { name: 'Legal y privacidad' })).closest('section') as HTMLElement;
    expect(within(card).getAllByRole('link')).toHaveLength(8);
  });
});

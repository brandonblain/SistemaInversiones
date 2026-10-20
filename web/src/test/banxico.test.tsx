import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN_ID, renderApp } from './render';

describe('Tasas CETES: importación desde Banxico', () => {
  it('consulta sin guardar, importa solo las nuevas y no duplica al repetir', async () => {
    const user = userEvent.setup();
    renderApp('/admin/tasas', { loginAs: ADMIN_ID });
    const panel = (await screen.findByRole('heading', { name: 'Importar desde Banxico' })).closest('section') as HTMLElement;

    await user.click(within(panel).getByRole('button', { name: /Consultar Banxico/ }));
    const importBtn = await within(panel).findByRole('button', { name: /Importar \d+ tasas? nuevas?/ });
    const n = Number(/Importar (\d+)/.exec(importBtn.textContent ?? '')![1]);
    expect(n).toBeGreaterThan(0);
    // La tabla se dibuja como tarjetas (móvil) y como tabla (escritorio): cada fila aparece dos veces
    expect(within(panel).getAllByText('Nueva').length).toBe(n * 2);

    await user.click(importBtn);
    expect(await within(panel).findByText(new RegExp(`${n} tasas? importadas?`))).toBeInTheDocument();
    expect(await within(panel).findByRole('button', { name: 'No hay tasas nuevas' })).toBeDisabled();
    expect(within(panel).queryByText('Nueva')).not.toBeInTheDocument();
    // El historial ya muestra lo importado con su fuente
    expect((await screen.findAllByText(/Banxico SIE SF43936/)).length).toBeGreaterThan(0);
  });
});

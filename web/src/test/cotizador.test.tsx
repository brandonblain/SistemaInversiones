import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';

const final = () => screen.getByTestId('capital-final').textContent;

describe('Cotizador (/cotizador)', () => {
  it('abre por dirección directa con los seis productos y un monto de ejemplo', async () => {
    renderApp('/cotizador');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cotiza tu inversión' })).toBeInTheDocument();
    expect(screen.getByText('Descubre el potencial de tu inversión y conoce cuánto podrías obtener al finalizar el plazo seleccionado.')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByLabelText('2. Capital a invertir')).toHaveValue('100,000');
    expect(final()).toBe('$112,000.00'); // Arrendamiento de cómputo: 12 % en 12 meses
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    // Rendimientos vigentes; ninguno de los anteriores (30, 35, 16 y 22 %) aparece
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([
      'Arrendamiento de cómputo12 meses · 12 % total',
      'Rampas de vehículos24 meses · 27 % total',
      'Autos utilitarios24 meses · 26 % total',
      'Transporte eléctrico12 meses · 15 % total',
      'Tecnología y Desarrollo12 meses · 10 % total',
      'Desarrollo Franquicias18 meses · 17 % total'
    ]);
    for (const old of ['30 %', '35 %', '16 %', '22 %']) expect(screen.queryByText(old)).not.toBeInTheDocument();
  });

  it('recalcula al cambiar de producto y de capital (con separadores y decimales)', async () => {
    const user = userEvent.setup();
    renderApp('/cotizador');
    await user.click(await screen.findByRole('radio', { name: /Autos utilitarios/ }));
    expect(final()).toBe('$126,000.00');
    const results = screen.getByRole('region', { name: 'Resultado de la cotización' });
    expect(within(results).getByText('$26,000.00')).toBeInTheDocument();
    expect(within(results).getByText('26 %')).toBeInTheDocument();
    expect(within(results).getByText('24 meses')).toBeInTheDocument();

    const input = screen.getByLabelText('2. Capital a invertir');
    await user.clear(input);
    await user.type(input, '250000.50');
    expect(final()).toBe('$315,000.63');
    await user.tab();
    expect(input).toHaveValue('250,000.50');

    await user.click(screen.getByRole('button', { name: '$1,000,000' }));
    await user.click(screen.getByRole('radio', { name: /Desarrollo Franquicias/ }));
    expect(final()).toBe('$1,170,000.00');
  });

  it('valida el capital: sin letras, negativos ni campo vacío', async () => {
    const user = userEvent.setup();
    renderApp('/cotizador');
    const input = await screen.findByLabelText('2. Capital a invertir');
    await user.clear(input);
    expect(screen.getByText('Escribe el capital que deseas invertir')).toBeInTheDocument();
    expect(screen.queryByTestId('capital-final')).not.toBeInTheDocument();
    await user.type(input, '12abc');
    expect(screen.getByText(/Escriba solo números/)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await user.clear(input);
    await user.type(input, '-5000');
    expect(screen.getByText('El capital no puede ser negativo.')).toBeInTheDocument();
    expect(screen.queryByTestId('capital-final')).not.toBeInTheDocument();
  });

  it('la gráfica (vista de tabla) muestra el capital mes a mes y se actualiza', async () => {
    const user = userEvent.setup();
    renderApp('/cotizador');
    await user.click(await screen.findByRole('radio', { name: /Autos utilitarios/ }));
    await user.click(await screen.findByRole('button', { name: 'Ver como tabla' }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(26); // encabezado + meses 0…24
    expect(within(table).getByText('$119,500.00')).toBeInTheDocument(); // mes 18
    await user.click(screen.getByRole('radio', { name: /Arrendamiento de cómputo/ }));
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(14));
  });

  it('no hay enlaces al cotizador en la página pública', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector('a[href*="cotizador"]')).toBeNull();
    expect(screen.queryByText(/cotizador/i)).not.toBeInTheDocument();
  });
});

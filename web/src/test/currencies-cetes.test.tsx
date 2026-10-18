import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { formatMoney, formatSpreadBps } from '../lib/format';
import { rateSummary } from '../lib/labels';
import { parseSignedPercentToBps } from '../lib/parse';
import { ADMIN_ID, INVESTOR_2_ID, renderApp } from './render';

const VICTORIA_ID = 'usr_fict_03';

describe('Formato de moneda y diferencial', () => {
  it('pesos y dólares se distinguen siempre', () => {
    expect(formatMoney(2_000_000, 'USD')).toBe('US$20,000.00');
    expect(formatMoney(2_000_000, 'MXN')).toBe('$20,000.00');
    expect(formatMoney(150, 'USD', { withCode: true })).toBe('$1.50 USD');
  });
  it('CETES − 1 punto', () => {
    expect(formatSpreadBps(-100)).toBe('− 1.00 punto');
    expect(formatSpreadBps(50)).toBe('+ 0.50 puntos');
    expect(parseSignedPercentToBps('-1')).toBe(-100);
    expect(parseSignedPercentToBps('−0.5')).toBe(-50);
    expect(parseSignedPercentToBps('abc')).toBeNull();
    expect(rateSummary({ rate_type: 'REFERENCE', fixed_annual_rate_bps: null, reference_rate_code: 'CETES_28', spread_bps: -100 })).toBe('CETES 28 días − 1.00 punto');
    expect(rateSummary({ rate_type: 'FIXED', fixed_annual_rate_bps: 1600, reference_rate_code: null, spread_bps: null })).toBe('16.00 % anual fija');
  });
});

describe('Inversionista con pesos y dólares / CETES', () => {
  it('el resumen muestra un bloque por moneda sin sumarlas', async () => {
    renderApp('/app', { loginAs: INVESTOR_2_ID });
    expect(await screen.findByRole('heading', { name: 'Pesos mexicanos (MXN)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dólares estadounidenses (USD)' })).toBeInTheDocument();
    const usdCapital = screen.getByTestId('usd-kpi-capital');
    expect(within(usdCapital).getByText('US$20,000.00')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-capital')).getByText('$400,000.00')).toBeInTheDocument();
  });

  it('el detalle de CETES muestra la tasa de referencia y la aplicable hoy', async () => {
    renderApp('/app/inversiones/inv_fict_007', { loginAs: VICTORIA_ID });
    expect(await screen.findByText('Condiciones del contrato')).toBeInTheDocument();
    expect(screen.getAllByText(/CETES 28 días − 1\.00 punto/).length).toBeGreaterThan(0);
    // Última tasa FICTICIA 7.20 % − 1 punto = 6.20 %
    expect(screen.getByText(/6\.20 % anual \(CETES 7\.20 %/)).toBeInTheDocument();
  });
});

describe('Administración: CETES y dólares', () => {
  it('la vista previa de CETES informa la tasa usada (vigente al inicio del periodo)', async () => {
    const user = userEvent.setup();
    renderApp('/admin/rendimientos?inversion=inv_fict_007', { loginAs: ADMIN_ID });
    await user.type((await screen.findAllByLabelText('Inicio del periodo'))[0]!, '2026-10-01');
    await user.type(screen.getAllByLabelText(/Fin del periodo/)[0]!, '2026-11-01');
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    expect(await screen.findByText('Proyección · aún no confirmada')).toBeInTheDocument();
    expect(screen.getByText(/CETES 28 días 7\.20 % \(al 24 sep 2026\) − 1\.00 punto/)).toBeInTheDocument();
    expect(screen.getByText('6.20 %')).toBeInTheDocument();
  });

  it('nueva inversión a CETES: fuerza pesos y registra el diferencial', async () => {
    const user = userEvent.setup();
    renderApp('/admin/inversiones/nueva', { loginAs: ADMIN_ID });
    await user.selectOptions(await screen.findByLabelText('Inversionista'), 'usr_fict_02');
    await user.click(screen.getByRole('radio', { name: /CETES/ }));
    expect(screen.getByLabelText('Moneda')).toBeDisabled();
    expect(screen.queryByLabelText('Tasa anual fija (%)')).not.toBeInTheDocument();
    expect(screen.getByText(/CETES 28 días − 1\.00 punto \(-100 pb\)/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Código de contrato'), 'FICT-CETES-01');
    await user.type(screen.getByLabelText('Capital (MXN)'), '100,000');
    await user.type(screen.getByLabelText('Fecha de inicio'), '2026-10-01');
    await user.type(screen.getByLabelText('Fecha de vencimiento'), '2027-10-01');
    await user.selectOptions(screen.getByLabelText('Cobro del rendimiento'), 'ANNUAL');
    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText(/CETES 28 días − 1\.00 punto, cobro anual/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar y guardar' }));
    expect(await screen.findByText('FICT-CETES-01', { selector: 'h1 *, h1' })).toBeInTheDocument();
  });

  it('nueva inversión en dólares', async () => {
    const user = userEvent.setup();
    renderApp('/admin/inversiones/nueva', { loginAs: ADMIN_ID });
    await user.selectOptions(await screen.findByLabelText('Inversionista'), 'usr_fict_02');
    await user.click(screen.getByRole('radio', { name: /Movilidad/ }));
    await user.selectOptions(screen.getByLabelText('Moneda'), 'USD');
    // Las condiciones de referencia (en pesos) no se ofrecen para dólares
    expect(screen.queryByRole('button', { name: /Usar condiciones de referencia/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Capital (USD)'), '15,000');
    expect(screen.getByText('Se registrará: $15,000.00 USD')).toBeInTheDocument();
  });

  it('captura de tasa CETES y protección de tasas en uso', async () => {
    const user = userEvent.setup();
    renderApp('/admin/tasas', { loginAs: ADMIN_ID });
    await user.type(await screen.findByLabelText('Tasa anual (%)'), '7.15');
    await user.clear(screen.getByLabelText('Fecha de la tasa'));
    await user.type(screen.getByLabelText('Fecha de la tasa'), '2026-10-08');
    await user.click(screen.getByRole('button', { name: 'Registrar tasa' }));
    expect(await screen.findByText(/CETES 28 días 7\.15 % al 8 oct 2026 registrada/)).toBeInTheDocument();
    // Las tasas usadas por rendimientos confirmados no muestran "Eliminar"
    expect((await screen.findAllByText('Usada en rendimientos')).length).toBeGreaterThan(0);
  });
});

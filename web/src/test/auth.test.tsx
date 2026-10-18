import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { api } from '../api';
import { resetMockState } from '../api/mock/mock-api';
import { INVESTOR_ID, renderApp } from './render';

describe('Autenticación', () => {
  it('redirige al login cuando no hay sesión', async () => {
    renderApp('/app');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('muestra error genérico con credenciales incorrectas', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Correo electrónico'), 'hector.galeana@ficticio.test');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument();
  });

  it('el inversionista entra a su resumen y no guarda nada en el navegador', async () => {
    const user = userEvent.setup();
    localStorage.clear();
    sessionStorage.clear();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Correo electrónico'), 'hector.galeana@ficticio.test');
    await user.type(screen.getByLabelText('Contraseña'), 'Ficticio123!');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: /Hola, Héctor/ })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('el administrador debe capturar el código MFA', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Correo electrónico'), 'admin@ficticio.test');
    await user.type(screen.getByLabelText('Contraseña'), 'Ficticio123!');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const code = await screen.findByLabelText('Código de verificación');
    await user.type(code, '000000');
    await user.click(screen.getByRole('button', { name: 'Verificar y entrar' }));
    expect(await screen.findByText(/Código de verificación incorrecto/)).toBeInTheDocument();

    await user.clear(code);
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Verificar y entrar' }));
    expect(await screen.findByRole('heading', { name: 'Resumen de administración' })).toBeInTheDocument();
  });

  it('un inversionista que abre /admin es enviado a su área', async () => {
    renderApp('/admin/pagos', { loginAs: INVESTOR_ID });
    expect(await screen.findByRole('heading', { name: /Hola,/ })).toBeInTheDocument();
    expect(screen.queryByText('Pagos externos')).not.toBeInTheDocument();
  });

  it('si la sesión expira (401), vuelve al login con aviso', async () => {
    renderApp('/app', { loginAs: INVESTOR_ID });
    await screen.findByRole('heading', { name: /Hola,/ });
    resetMockState(); // simula sesión invalidada en el servidor
    await api.investor.summary().catch(() => undefined);
    expect(await screen.findByText(/Su sesión expiró/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument());
  });

  it('recuperación de contraseña no revela si el correo existe', async () => {
    const user = userEvent.setup();
    renderApp('/recuperar');
    await user.type(await screen.findByLabelText('Correo electrónico'), 'no-existe@ficticio.test');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText(/Si el correo está registrado/)).toBeInTheDocument();
  });
});

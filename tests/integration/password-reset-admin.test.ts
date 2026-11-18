import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/worker/index';
import { ADMIN_PASSWORD, INVESTOR_PASSWORD, login, makeEnv, seedAdmin, seedInvestor, type Client } from '../helpers/app';

describe('Administración: restablecer la contraseña de un cliente', () => {
  let env: Env;
  let admin: Client;
  let investorId: string;
  let sent: Array<{ to: string[]; subject: string; text: string }>;
  const NEW = 'Temporal2026xy';

  beforeEach(async () => {
    sent = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: 200 });
    }));
    env = makeEnv({ EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'clave-ficticia' });
    await seedAdmin(env);
    investorId = await seedInvestor(env, { email: 'hector.galeana@ficticio.test', name: 'Héctor Galeana' });
    admin = await login(env, 'admin@ficticio.test', ADMIN_PASSWORD);
  });
  afterEach(() => vi.unstubAllGlobals());

  const reset = (body: Record<string, unknown>, who: Client = admin) => who.call('POST', `/api/admin/investors/${investorId}/reset-password`, body);

  it('fija la contraseña temporal, cierra sesiones y la envía al correo registrado y al adicional', async () => {
    const client = await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
    const r = await reset({ password: NEW, extra_email: ' Contador@Ficticio.test ' });
    expect(r.status).toBe(200);
    expect(r.json.data.emails).toEqual([
      { email: 'hector.galeana@ficticio.test', sent: true },
      { email: 'contador@ficticio.test', sent: true }
    ]);
    expect(sent.map((m) => m.to[0])).toEqual(['hector.galeana@ficticio.test', 'contador@ficticio.test']);
    for (const m of sent) {
      expect(m.text).toContain(`Contraseña temporal: ${NEW}`);
      expect(m.text).toContain('Correo de acceso: hector.galeana@ficticio.test');
    }
    // La sesión abierta del cliente se cierra; entra con la nueva y no con la anterior
    expect((await client.call('GET', '/api/investor/summary')).status).toBe(401);
    await expect(login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD)).rejects.toThrow();
    await login(env, 'hector.galeana@ficticio.test', NEW);
    // Ni la bitácora ni el registro de avisos guardan la contraseña
    const log = (await admin.call('GET', '/api/admin/audit-logs?action=PASSWORD_RESET_BY_ADMIN')).json.data;
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log)).not.toContain(NEW);
    expect(JSON.stringify((await admin.call('GET', '/api/admin/notifications')).json)).not.toContain(NEW);
  });

  it('sin correo adicional (o repetido) envía un solo correo', async () => {
    expect((await reset({ password: NEW, extra_email: 'HECTOR.galeana@ficticio.test' })).json.data.emails).toHaveLength(1);
    expect((await reset({ password: NEW, extra_email: '' })).json.data.emails).toHaveLength(1);
    expect(sent).toHaveLength(2);
  });

  it('informa si el correo no salió (la contraseña ya quedó cambiada)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const r = await reset({ password: NEW });
    expect(r.status).toBe(200);
    expect(r.json.data.emails).toEqual([{ email: 'hector.galeana@ficticio.test', sent: false }]);
    await login(env, 'hector.galeana@ficticio.test', NEW);
  });

  it('valida contraseña, correo adicional, cliente y permisos', async () => {
    expect((await reset({ password: 'corta1' })).status).toBe(400);
    expect((await reset({ password: NEW, extra_email: 'no-es-correo' })).status).toBe(400);
    expect((await admin.call('POST', '/api/admin/investors/usr_inexistente/reset-password', { password: NEW })).status).toBe(404);
    const client = await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
    expect((await reset({ password: NEW }, client)).status).toBe(403);
    expect(sent).toHaveLength(0);
    await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
  });
});

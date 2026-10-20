import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/worker/index';
import { banxicoDate, percentToBps } from '../../src/worker/services/banxico';
import { ADMIN_PASSWORD, INVESTOR_PASSWORD, login, makeEnv, seedAdmin, seedInvestor, type Client } from '../helpers/app';

// Respuesta simulada del SIE: CETES 28 correcta; la serie de 91 días con un título que no corresponde.
function sieResponse() {
  return {
    bmx: {
      series: [
        {
          idSerie: 'SF43936',
          titulo: 'Valores gubernamentales Resultados de la subasta semanal Tasa de rendimiento Cetes a 28 días',
          datos: [
            { fecha: '02/10/2026', dato: '7.15' },
            { fecha: '09/10/2026', dato: '7.10' },
            { fecha: '16/10/2026', dato: 'N/E' }
          ]
        },
        { idSerie: 'SF43939', titulo: 'Tipo de cambio pesos por dólar', datos: [{ fecha: '09/10/2026', dato: '18.50' }] },
        { idSerie: 'SF43942', titulo: 'Valores gubernamentales Resultados de la subasta semanal Tasa de rendimiento Cetes a 182 días', datos: [{ fecha: '09/10/2026', dato: '7.40' }] },
        { idSerie: 'SF43945', titulo: 'Valores gubernamentales Resultados de la subasta semanal Tasa de rendimiento Cetes a 364 días', datos: [] }
      ]
    }
  };
}

describe('Banxico: conversión de datos', () => {
  it('porcentajes a puntos básicos sin errores de punto flotante', () => {
    expect(percentToBps('7.15')).toBe(715);
    expect(percentToBps('10.495')).toBe(1050);
    expect(percentToBps('11')).toBe(1100);
    expect(percentToBps('N/E')).toBeNull();
    expect(percentToBps('0')).toBeNull();
    expect(percentToBps('-1.5')).toBeNull();
  });

  it('fechas dd/MM/yyyy a ISO, rechazando fechas imposibles', () => {
    expect(banxicoDate('05/01/2026')).toBe('2026-01-05');
    expect(banxicoDate('31/02/2026')).toBeNull();
    expect(banxicoDate('2026-01-05')).toBeNull();
  });
});

describe('Banxico: importación de tasas CETES', () => {
  let env: Env;
  let admin: Client;
  let calls: Array<{ url: string; headers: Record<string, string> }>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T18:00:00Z'));
    env = makeEnv({ BANXICO_TOKEN: 'token-ficticio-64' });
    await seedAdmin(env);
    admin = await login(env, 'admin@ficticio.test', ADMIN_PASSWORD);
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), headers: Object.fromEntries(new Headers(init.headers).entries()) });
      return new Response(JSON.stringify(sieResponse()), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sin token responde 503 y no llama a Banxico', async () => {
    const noToken = makeEnv();
    await seedAdmin(noToken);
    const a = await login(noToken, 'admin@ficticio.test', ADMIN_PASSWORD);
    const r = await a.call('GET', '/api/admin/reference-rates/banxico/preview');
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe('BANXICO_NOT_CONFIGURED');
    expect(calls).toHaveLength(0);
  });

  it('vista previa: token solo en la cabecera, series validadas por título y sin escribir nada', async () => {
    await env.DB.prepare("INSERT INTO reference_rates (id, rate_code, effective_date, annual_rate_bps, source, created_by_user_id) VALUES ('rrt_1', 'CETES_28', '2026-10-02', 715, 'Banxico', 'usr_admin')").run();
    const r = await admin.call('GET', '/api/admin/reference-rates/banxico/preview?from=2026-09-28&to=2026-10-20');
    expect(r.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43936,SF43939,SF43942,SF43945/datos/2026-09-28/2026-10-20');
    expect(calls[0]!.url).not.toContain('token');
    expect(calls[0]!.headers['bmx-token']).toBe('token-ficticio-64');

    const byKey = Object.fromEntries(r.json.data.rates.map((x: any) => [`${x.rate_code}|${x.effective_date}`, x]));
    expect(byKey['CETES_28|2026-10-02'].status).toBe('SAME');
    expect(byKey['CETES_28|2026-10-09']).toMatchObject({ status: 'NEW', annual_rate_bps: 710 });
    expect(byKey['CETES_182|2026-10-09']).toMatchObject({ status: 'NEW', annual_rate_bps: 740 });
    expect(byKey['CETES_28|2026-10-16']).toBeUndefined(); // N/E se omite
    expect(r.json.data.rejected.map((x: any) => x.rate_code)).toEqual(['CETES_91']); // título no corresponde
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM reference_rates').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('importa solo lo nuevo, nunca sobrescribe y deja registro en la bitácora; repetir no duplica', async () => {
    await env.DB.prepare("INSERT INTO reference_rates (id, rate_code, effective_date, annual_rate_bps, source, created_by_user_id) VALUES ('rrt_1', 'CETES_28', '2026-10-02', 700, 'Captura manual', 'usr_admin')").run();
    const first = await admin.call('POST', '/api/admin/reference-rates/banxico/import', { from: '2026-09-28', to: '2026-10-20' });
    expect(first.status).toBe(200);
    expect(first.json.data.imported).toBe(2); // CETES_28 09/10 y CETES_182 09/10
    expect(first.json.data.conflicts).toHaveLength(1); // 02/10 capturada a mano con otro valor: se reporta, no se toca
    const kept = await env.DB.prepare("SELECT annual_rate_bps FROM reference_rates WHERE id = 'rrt_1'").first<{ annual_rate_bps: number }>();
    expect(kept?.annual_rate_bps).toBe(700);
    const imported = await env.DB.prepare("SELECT source, created_by_user_id FROM reference_rates WHERE rate_code = 'CETES_28' AND effective_date = '2026-10-09'").first<{ source: string; created_by_user_id: string }>();
    expect(imported).toEqual({ source: 'Banxico SIE SF43936', created_by_user_id: 'usr_admin' });
    const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'REFERENCE_RATES_IMPORTED'").first<{ n: number }>();
    expect(audit?.n).toBe(1);

    const again = await admin.call('POST', '/api/admin/reference-rates/banxico/import', { from: '2026-09-28', to: '2026-10-20' });
    expect(again.json.data.imported).toBe(0);
    expect(again.json.data.unchanged).toBe(2);
  });

  it('valida el rango: sin fechas futuras ni más de un año', async () => {
    expect((await admin.call('GET', '/api/admin/reference-rates/banxico/preview?from=2026-10-01&to=2026-12-31')).status).toBe(400);
    expect((await admin.call('GET', '/api/admin/reference-rates/banxico/preview?from=2024-01-01&to=2026-10-20')).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('errores de Banxico se traducen sin exponer el token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })));
    const r = await admin.call('GET', '/api/admin/reference-rates/banxico/preview');
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe('BANXICO_TOKEN_INVALID');
    expect(JSON.stringify(r.json)).not.toContain('token-ficticio-64');
  });

  it('solo administración: el inversionista recibe 403', async () => {
    await seedInvestor(env, { id: 'usr_inv', email: 'inv@ficticio.test' });
    const inv = await login(env, 'inv@ficticio.test', INVESTOR_PASSWORD);
    expect((await inv.call('GET', '/api/admin/reference-rates/banxico/preview')).status).toBe(403);
    expect((await inv.call('POST', '/api/admin/reference-rates/banxico/import', {})).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

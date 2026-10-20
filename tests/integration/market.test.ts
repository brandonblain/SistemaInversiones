import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, type Env } from '../../src/worker/index';
import { fxRate } from '../../src/worker/services/banxico';
import { makeEnv } from '../helpers/app';

const FX_TITLE = 'Tipo de cambio Pesos por dólar E.U.A. Tipo de cambio para solventar obligaciones denominadas en moneda extranjera Fecha de determinación (FIX)';
const cetesTitle = (d: number) => `Valores gubernamentales Resultados de la subasta semanal Tasa de rendimiento Cetes a ${d} días`;

function oportuno(fxTitle = FX_TITLE) {
  return {
    bmx: {
      series: [
        { idSerie: 'SF43718', titulo: fxTitle, datos: [{ fecha: '19/10/2026', dato: '18.4253' }] },
        { idSerie: 'SF43936', titulo: cetesTitle(28), datos: [{ fecha: '15/10/2026', dato: '6.25' }] },
        { idSerie: 'SF43939', titulo: cetesTitle(91), datos: [{ fecha: '15/10/2026', dato: '6.55' }] },
        { idSerie: 'SF43942', titulo: cetesTitle(182), datos: [{ fecha: '15/10/2026', dato: '6.79' }] },
        { idSerie: 'SF43945', titulo: cetesTitle(364), datos: [{ fecha: '15/10/2026', dato: 'N/E' }] }
      ]
    }
  };
}

/** Cache API mínima en memoria (en Workers es caches.default). */
function fakeCaches() {
  const store = new Map<string, string>();
  return {
    store,
    default: {
      match: async (k: string) => (store.has(k) ? new Response(store.get(k)) : undefined),
      put: async (k: string, r: Response) => void store.set(k, await r.text())
    }
  };
}

const getMarket = async (env: Env, url = 'http://localhost/api/public/market') => {
  const res = await app.request(url, {}, env);
  return { status: res.status, json: (await res.json()) as any };
};

describe('Indicadores de Banxico (/api/public/market)', () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify(oportuno()), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tipo de cambio como texto exacto (sin punto flotante)', () => {
    expect(fxRate('18.4253')).toBe('18.4253');
    expect(fxRate('N/E')).toBeNull();
    expect(fxRate('0.0000')).toBeNull();
  });

  it('sin token: no disponible y sin llamar a Banxico', async () => {
    const r = await getMarket(makeEnv());
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ available: false, fx: null, cetes: {} });
    expect(calls).toHaveLength(0);
  });

  it('con token: FIX y CETES del dato oportuno, en una sola consulta; N/E se omite', async () => {
    const r = await getMarket(makeEnv({ BANXICO_TOKEN: 'tok' }));
    expect(calls).toEqual(['https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718,SF43936,SF43939,SF43942,SF43945/datos/oportuno']);
    expect(r.json.data.available).toBe(true);
    expect(r.json.data.fx).toEqual({ rate: '18.4253', date: '2026-10-19', series_id: 'SF43718' });
    expect(r.json.data.cetes.CETES_28).toEqual({ annual_rate_bps: 625, date: '2026-10-15', series_id: 'SF43936' });
    expect(r.json.data.cetes.CETES_364).toBeUndefined();
    expect(r.json.data.source).toBe('Banco de México (SIE)');
  });

  it('si el título de la serie de tipo de cambio no es el FIX, no se muestra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(oportuno('Tipo de cambio Pesos por dólar E.U.A. Interbancario a 48 horas')), { status: 200 })));
    const r = await getMarket(makeEnv({ BANXICO_TOKEN: 'tok' }));
    expect(r.json.data.fx).toBeNull();
    expect(r.json.data.cetes.CETES_28.annual_rate_bps).toBe(625);
  });

  it('usa la caché mientras está vigente y, si Banxico falla, el último dato bueno marcado como antiguo', async () => {
    const c = fakeCaches();
    vi.stubGlobal('caches', c);
    const env = makeEnv({ BANXICO_TOKEN: 'tok' });
    await getMarket(env);
    await getMarket(env);
    expect(calls).toHaveLength(1); // la segunda vino de la caché

    // La caché "envejece" y Banxico cae
    const cached = JSON.parse([...c.store.values()][0]!);
    cached.fetched_at = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    c.store.set([...c.store.keys()][0]!, JSON.stringify(cached));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })));
    const r = await getMarket(env);
    expect(r.json.data).toMatchObject({ available: true, stale: true });
    expect(r.json.data.fx.rate).toBe('18.4253');
  });

  it('si Banxico falla y no hay caché: no disponible (la página simplemente no muestra el indicador)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const r = await getMarket(makeEnv({ BANXICO_TOKEN: 'tok' }));
    expect(r.status).toBe(200);
    expect(r.json.data.available).toBe(false);
  });

  it('el sitio público puede leer los indicadores, pero ninguna otra ruta de la API ni escribir', async () => {
    const env = makeEnv({ BANXICO_TOKEN: 'tok', ENVIRONMENT: 'production', PUBLIC_HOST: 'pimexfortexcapital.com.mx', PORTAL_HOST: 'clientes.pimexfortexcapital.com.mx' });
    const ok = await getMarket(env, 'https://pimexfortexcapital.com.mx/api/public/market');
    expect(ok.status).toBe(200);
    expect(ok.json.data.fx.rate).toBe('18.4253');
    const post = await app.request('https://pimexfortexcapital.com.mx/api/public/market', { method: 'POST', headers: { Origin: 'https://pimexfortexcapital.com.mx' } }, env);
    expect(post.status).toBe(404);
    expect((await app.request('https://pimexfortexcapital.com.mx/api/auth/me', {}, env)).status).toBe(404);
  });
});

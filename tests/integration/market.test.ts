import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, type Env } from '../../src/worker/index';
import { fxRate } from '../../src/worker/services/banxico';
import { makeEnv } from '../helpers/app';

const FX_TITLE = 'Tipo de cambio Pesos por dólar E.U.A. Tipo de cambio para solventar obligaciones denominadas en moneda extranjera Fecha de determinación (FIX)';
const cetesTitle = (d: number) => `Valores gubernamentales Resultados de la subasta semanal Tasa de rendimiento Cetes a ${d} días`;

/** Respuesta del SIE por rango (dos datos por serie para calcular la variación). */
function oportuno(fxTitle = FX_TITLE) {
  return {
    bmx: {
      series: [
        { idSerie: 'SF43718', titulo: fxTitle, datos: [{ fecha: '16/10/2026', dato: '18.3941' }, { fecha: '19/10/2026', dato: '18.4253' }] },
        { idSerie: 'SF46410', titulo: 'Cotización de las divisas que conforman la canasta del DEG Respecto al peso mexicano Euro', datos: [{ fecha: '19/10/2026', dato: '20.6704' }] },
        // Las UDIS se publican por adelantado: la de 2099 no debe tomarse
        { idSerie: 'SP68257', titulo: 'Valor de UDIS', datos: [{ fecha: '19/10/2026', dato: '8.860000' }, { fecha: '20/10/2026', dato: '8.861350' }, { fecha: '25/12/2099', dato: '99.000000' }] },
        { idSerie: 'SF61745', titulo: 'Tasa objetivo', datos: [{ fecha: '01/10/2026', dato: '6.7500' }, { fecha: '20/10/2026', dato: '6.5000' }] },
        { idSerie: 'SF43936', titulo: cetesTitle(28), datos: [{ fecha: '08/10/2026', dato: '6.09' }, { fecha: '15/10/2026', dato: '6.25' }] },
        { idSerie: 'SF43939', titulo: cetesTitle(91), datos: [{ fecha: '15/10/2026', dato: '6.55' }] },
        { idSerie: 'SF43942', titulo: cetesTitle(182), datos: [{ fecha: '15/10/2026', dato: '6.79' }] },
        { idSerie: 'SF43945', titulo: cetesTitle(364), datos: [{ fecha: '15/10/2026', dato: 'N/E' }] },
        { idSerie: 'SP30578', titulo: 'Índice Nacional de Precios al consumidor variación anual', datos: [{ fecha: '01/09/2026', dato: '3.45000000' }] }
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

  it('con token: una sola consulta por rango; FIX, CETES y la cinta de indicadores con su variación', async () => {
    const r = await getMarket(makeEnv({ BANXICO_TOKEN: 'tok' }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(
      /^https:\/\/www\.banxico\.org\.mx\/SieAPIRest\/service\/v1\/series\/SF43718,SF46410,SF46407,SF60632,SP68257,SF61745,SF60648,SF43936,SF43939,SF43942,SF43945,SP30578\/datos\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/
    );
    const d = r.json.data;
    expect(d.available).toBe(true);
    expect(d.fx).toEqual({ rate: '18.4253', date: '2026-10-19', series_id: 'SF43718' });
    expect(d.cetes.CETES_28).toEqual({ annual_rate_bps: 625, date: '2026-10-15', series_id: 'SF43936' });
    expect(d.cetes.CETES_364).toBeUndefined(); // N/E

    const by = Object.fromEntries(d.indicators.map((i: any) => [i.key, i]));
    expect(d.indicators.map((i: any) => i.key)).toEqual(['USD', 'EUR', 'UDIS', 'OBJETIVO', 'CETES_28', 'CETES_91', 'CETES_182', 'INFLACION']);
    expect(by.USD).toMatchObject({ value: '18.4253', change: '+0.0312', direction: 'up', kind: 'fx' });
    expect(by.EUR).toMatchObject({ value: '20.6704', change: null, direction: null });
    expect(by.UDIS).toMatchObject({ value: '8.861350', date: '2026-10-20', direction: 'up' }); // no toma la de 2099
    expect(by.OBJETIVO).toMatchObject({ value: '6.50', change: '−0.25', direction: 'down', kind: 'rate' });
    expect(by.INFLACION).toMatchObject({ value: '3.45', label: 'Inflación anual' });
  });

  it('si el título de la serie de tipo de cambio no es el FIX, no se muestra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(oportuno('Tipo de cambio Pesos por dólar E.U.A. Interbancario a 48 horas')), { status: 200 })));
    const r = await getMarket(makeEnv({ BANXICO_TOKEN: 'tok' }));
    expect(r.json.data.fx).toBeNull();
    expect(r.json.data.indicators.some((i: any) => i.key === 'USD')).toBe(false);
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

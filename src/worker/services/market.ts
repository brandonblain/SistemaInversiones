import type { Env } from '../index';
import { fetchMarketData, type MarketData } from './banxico';

/**
 * Indicadores de Banco de México para mostrar (página pública, cuentas de clientes y administración):
 * tipo de cambio FIX y tasas CETES más recientes. Son informativos: los cálculos de rendimientos usan
 * las tasas capturadas/importadas en reference_rates, nunca este dato en vivo.
 *
 * Caché del Worker (Cache API) para no acercarse al límite de Banxico (200 consultas / 5 min):
 *  - se consulta Banxico como máximo cada FRESH_MS por centro de datos;
 *  - si Banxico falla, se sirve el último dato bueno hasta STALE_MS, marcado como stale.
 */
const CACHE_KEY = 'https://indicadores.cache.internal/banxico/v2';
const FRESH_MS = 30 * 60 * 1000;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

export interface MarketSnapshot extends MarketData {
  available: boolean;
  source: 'Banco de México (SIE)';
  fetched_at: string | null;
  stale: boolean;
}

const EMPTY: MarketSnapshot = { available: false, fx: null, cetes: {}, indicators: [], source: 'Banco de México (SIE)', fetched_at: null, stale: false };

type Cached = { data: MarketData; fetched_at: string };

const cacheStore = (): Cache | null => (typeof caches !== 'undefined' && 'default' in caches ? (caches as unknown as { default: Cache }).default : null);

async function readCache(): Promise<Cached | null> {
  const store = cacheStore();
  const hit = await store?.match(CACHE_KEY).catch(() => undefined);
  return hit ? ((await hit.json().catch(() => null)) as Cached | null) : null;
}

async function writeCache(value: Cached) {
  const store = cacheStore();
  await store
    ?.put(CACHE_KEY, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${STALE_MS / 1000}` } }))
    .catch(() => undefined);
}

export async function getMarketSnapshot(env: Env, now: Date = new Date()): Promise<MarketSnapshot> {
  if (!env.BANXICO_TOKEN?.trim()) return EMPTY;
  const cached = await readCache();
  const age = cached ? now.getTime() - Date.parse(cached.fetched_at) : Infinity;
  if (cached && age < FRESH_MS) return { ...EMPTY, ...cached.data, available: true, fetched_at: cached.fetched_at };

  try {
    const data = await fetchMarketData(env);
    const fresh: Cached = { data, fetched_at: now.toISOString() };
    await writeCache(fresh);
    return { ...EMPTY, ...data, available: data.indicators.length > 0, fetched_at: fresh.fetched_at };
  } catch {
    // Banxico no respondió: último dato bueno (si no es demasiado viejo) o nada
    if (cached && age < STALE_MS) return { ...EMPTY, ...cached.data, available: true, fetched_at: cached.fetched_at, stale: true };
    return EMPTY;
  }
}

import { AppError } from '../lib/errors';
import { addDays, todayInContractZone } from '../lib/dates';
import type { Env } from '../index';

/**
 * Consulta de tasas CETES en la API REST del SIE de Banco de México.
 * Documentación: https://www.banxico.org.mx/SieAPIRest/service/v1/
 *  - El token se obtiene en https://www.banxico.org.mx/SieAPIRest/service/v1/token y se guarda como
 *    secreto del Worker (BANXICO_TOKEN). Nunca se envía al navegador.
 *  - Se manda en la cabecera Bmx-Token. Límite: 200 consultas cada 5 minutos, 10 000 por día.
 *  - Rango: /series/{ids}/datos/{yyyy-MM-dd}/{yyyy-MM-dd}; respuesta bmx.series[].datos[] con
 *    fecha "dd/MM/yyyy" y dato "7.15" (porcentaje anual) o "N/E" (sin dato, se omite).
 *
 * Series de la subasta semanal (tasa de rendimiento), verificadas contra el catálogo del SIE el 20/10/2026:
 * "Valores gubernamentales · Resultados de la subasta semanal · Tasa de rendimiento · Cetes a N días".
 * Como salvaguarda, el título que devuelve Banxico debe mencionar el plazo esperado ("28 días", …);
 * si no coincide, esa serie se rechaza en lugar de importar un dato equivocado.
 */
export const BANXICO_SERIES = {
  CETES_28: { id: 'SF43936', days: 28 },
  CETES_91: { id: 'SF43939', days: 91 },
  CETES_182: { id: 'SF43942', days: 182 },
  CETES_364: { id: 'SF43945', days: 364 }
} as const;

export type CetesCode = keyof typeof BANXICO_SERIES;

const BASE = 'https://www.banxico.org.mx/SieAPIRest/service/v1';

export interface BanxicoRate {
  rate_code: CetesCode;
  effective_date: string; // yyyy-mm-dd
  annual_rate_bps: number;
  series_id: string;
}

export interface BanxicoResult {
  rates: BanxicoRate[];
  /** Series que no se pudieron usar (título inesperado o ausente en la respuesta). */
  rejected: Array<{ rate_code: CetesCode; series_id: string; reason: string }>;
}

/** "7.15" → 715 sin errores de punto flotante. Devuelve null si no es un porcentaje válido. */
export function percentToBps(dato: string): number | null {
  const m = /^\s*(\d{1,3})(?:\.(\d{1,6}))?\s*$/.exec(dato);
  if (!m) return null;
  const decimals = (m[2] ?? '').padEnd(6, '0');
  // Redondeo a 2 decimales (puntos básicos) con aritmética entera
  const micro = Number(m[1]) * 1_000_000 + Number(decimals);
  const bps = Math.round(micro / 10_000);
  return bps > 0 && bps <= 10000 ? bps : null;
}

/** "05/01/2023" → "2023-01-05". */
export function banxicoDate(fecha: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type SieSeries = { idSerie?: string; titulo?: string; datos?: Array<{ fecha?: string; dato?: string }> };
type SieResponse = { bmx?: { series?: SieSeries[] } };

/** Llamada al SIE con el token en la cabecera; traduce los errores sin exponer el token. */
async function sieFetch(env: Env, path: string): Promise<SieSeries[]> {
  const token = env.BANXICO_TOKEN?.trim();
  if (!token) throw new AppError(503, 'BANXICO_NOT_CONFIGURED', 'Falta configurar el token de Banxico (secreto BANXICO_TOKEN).');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Bmx-Token': token, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new AppError(503, 'BANXICO_UNAVAILABLE', 'No fue posible conectar con Banxico. Intente más tarde.');
  }
  if (res.status === 401 || res.status === 403) throw new AppError(503, 'BANXICO_TOKEN_INVALID', 'Banxico rechazó el token. Revise el secreto BANXICO_TOKEN.');
  if (res.status === 429) throw new AppError(429, 'BANXICO_RATE_LIMIT', 'Banxico limitó las consultas (200 cada 5 minutos). Intente en unos minutos.');
  if (!res.ok) throw new AppError(503, 'BANXICO_UNAVAILABLE', `Banxico respondió ${res.status}. Intente más tarde.`);
  const body = (await res.json().catch(() => null)) as SieResponse | null;
  return body?.bmx?.series ?? [];
}

/** ¿El título corresponde a CETES de ese plazo? (salvaguarda contra una serie equivocada) */
const isCetesTitle = (titulo: string | undefined, days: number) => {
  const title = normalize(titulo ?? '');
  return title.includes('cetes') && new RegExp(`\\b${days}\\s*dias\\b`).test(title);
};

export async function fetchCetesRates(env: Env, from: string, to: string, codes: CetesCode[] = Object.keys(BANXICO_SERIES) as CetesCode[]): Promise<BanxicoResult> {
  const ids = codes.map((c) => BANXICO_SERIES[c].id).join(',');
  const series = await sieFetch(env, `/series/${ids}/datos/${from}/${to}`);
  const rates: BanxicoRate[] = [];
  const rejected: BanxicoResult['rejected'] = [];

  for (const code of codes) {
    const { id, days } = BANXICO_SERIES[code];
    const s = series.find((x) => x.idSerie === id);
    if (!s) {
      rejected.push({ rate_code: code, series_id: id, reason: 'Banxico no devolvió esta serie.' });
      continue;
    }
    if (!isCetesTitle(s.titulo, days)) {
      rejected.push({ rate_code: code, series_id: id, reason: `El título de la serie no corresponde a CETES ${days} días: "${s.titulo ?? ''}".` });
      continue;
    }
    for (const d of s.datos ?? []) {
      const date = banxicoDate(d.fecha ?? '');
      const bps = percentToBps(d.dato ?? '');
      if (date && bps !== null) rates.push({ rate_code: code, effective_date: date, annual_rate_bps: bps, series_id: id });
    }
  }
  rates.sort((a, b) => (a.effective_date === b.effective_date ? a.rate_code.localeCompare(b.rate_code) : b.effective_date.localeCompare(a.effective_date)));
  return { rates, rejected };
}

/** "18.4253" → "18.4253" (texto, sin pasar por punto flotante). null si no es un número válido. */
export function fxRate(dato: string): string | null {
  const m = /^\s*(\d{1,3}\.\d{1,6})\s*$/.exec(dato);
  return m && Number(m[1]) > 0 ? m[1]! : null;
}

export type IndicatorKey =
  | 'USD' | 'EUR' | 'GBP' | 'CAD' | 'UDIS' | 'OBJETIVO' | 'TIIE28' | 'INFLACION'
  | CetesCode;

export interface Indicator {
  key: IndicatorKey;
  label: string;
  /** fx: pesos por unidad · index: valor (UDIS) · rate: porcentaje anual */
  kind: 'fx' | 'index' | 'rate';
  /** Valor publicado, redondeado para mostrar (p. ej. "18.4253", "8.861350", "6.50"). */
  value: string;
  date: string;
  /** Diferencia contra el dato anterior, con signo y los mismos decimales; null si no hay anterior. */
  change: string | null;
  direction: 'up' | 'down' | 'flat' | null;
  series_id: string;
}

type Spec = { key: IndicatorKey; label: string; id: string; kind: Indicator['kind']; decimals: number; match: (title: string) => boolean };

/**
 * Indicadores de la cinta, verificados contra el catálogo del SIE (20/10/2026). Cada serie se valida por
 * su título: si Banxico devolviera otra cosa, ese indicador simplemente no se muestra.
 */
const INDICATORS: Spec[] = [
  { key: 'USD', label: 'Dólar FIX', id: 'SF43718', kind: 'fx', decimals: 4, match: (t) => t.includes('tipo de cambio') && t.includes('fix') },
  { key: 'EUR', label: 'Euro', id: 'SF46410', kind: 'fx', decimals: 4, match: (t) => t.includes('euro') },
  { key: 'GBP', label: 'Libra esterlina', id: 'SF46407', kind: 'fx', decimals: 4, match: (t) => t.includes('libra esterlina') },
  { key: 'CAD', label: 'Dólar canadiense', id: 'SF60632', kind: 'fx', decimals: 4, match: (t) => t.includes('canadiense') },
  { key: 'UDIS', label: 'UDIS', id: 'SP68257', kind: 'index', decimals: 6, match: (t) => t.includes('udis') },
  { key: 'OBJETIVO', label: 'Tasa objetivo Banxico', id: 'SF61745', kind: 'rate', decimals: 2, match: (t) => t.includes('tasa objetivo') },
  { key: 'TIIE28', label: 'TIIE 28 días', id: 'SF60648', kind: 'rate', decimals: 2, match: (t) => t.includes('tiie') && /\b28 dias\b/.test(t) },
  ...(Object.keys(BANXICO_SERIES) as CetesCode[]).map((code): Spec => ({
    key: code,
    label: `CETES ${BANXICO_SERIES[code].days} días`,
    id: BANXICO_SERIES[code].id,
    kind: 'rate',
    decimals: 2,
    match: (t) => isCetesTitle(t, BANXICO_SERIES[code].days)
  })),
  { key: 'INFLACION', label: 'Inflación anual', id: 'SP30578', kind: 'rate', decimals: 2, match: (t) => t.includes('precios al consumidor') && t.includes('anual') }
];

export interface MarketData {
  fx: { rate: string; date: string; series_id: string } | null;
  cetes: Partial<Record<CetesCode, { annual_rate_bps: number; date: string; series_id: string }>>;
  indicators: Indicator[];
}

const num = (dato?: string) => {
  const t = (dato ?? '').trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

/**
 * Indicadores de mercado de Banxico en una sola consulta por rango (últimos 100 días): último dato
 * publicado hasta hoy y el anterior, para la variación. (Las UDIS se publican por adelantado: se toma la de hoy.)
 */
export async function fetchMarketData(env: Env, today: string = todayInContractZone()): Promise<MarketData> {
  const ids = INDICATORS.map((i) => i.id).join(',');
  const series = await sieFetch(env, `/series/${ids}/datos/${addDays(today, -100)}/${today}`);
  const indicators: Indicator[] = [];
  const fxRaw: Record<string, { dato: string; date: string }> = {};
  const cetes: MarketData['cetes'] = {};

  for (const spec of INDICATORS) {
    const s = series.find((x) => x.idSerie === spec.id);
    if (!s || !spec.match(normalize(s.titulo ?? ''))) continue;
    const points = (s.datos ?? [])
      .map((d) => ({ date: banxicoDate(d.fecha ?? ''), dato: (d.dato ?? '').trim(), n: num(d.dato) }))
      .filter((p): p is { date: string; dato: string; n: number } => !!p.date && p.n !== null && p.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const last = points[points.length - 1];
    if (!last) continue;
    const prev = points[points.length - 2];
    const diff = prev ? last.n - prev.n : null;
    const eps = 10 ** -(spec.decimals + 1);
    indicators.push({
      key: spec.key,
      label: spec.label,
      kind: spec.kind,
      value: last.n.toFixed(spec.decimals),
      date: last.date,
      change: diff === null ? null : `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(spec.decimals)}`,
      direction: diff === null ? null : Math.abs(diff) < eps ? 'flat' : diff > 0 ? 'up' : 'down',
      series_id: spec.id
    });
    if (spec.key === 'USD') fxRaw.USD = { dato: last.dato, date: last.date };
    if (spec.key in BANXICO_SERIES) {
      const bps = percentToBps(last.dato);
      if (bps !== null) cetes[spec.key as CetesCode] = { annual_rate_bps: bps, date: last.date, series_id: spec.id };
    }
  }

  const usd = fxRaw.USD ? fxRate(fxRaw.USD.dato) : null;
  return { fx: usd && fxRaw.USD ? { rate: usd, date: fxRaw.USD.date, series_id: 'SF43718' } : null, cetes, indicators };
}

/**
 * ¿En qué sitio estamos? Lo decide el Worker por dominio y lo deja en <meta name="site"> (ver
 * src/worker/middleware/sites.ts):
 *  - "public":   página corporativa (pimexfortexcapital.com.mx). Sin API ni sesión.
 *  - "portal":   portal de clientes (clientes.…). La raíz muestra el login o el panel según el rol.
 *  - "combined": desarrollo, pruebas y staging: un solo sitio con todo (raíz = página corporativa).
 */
export type SiteKind = 'public' | 'portal' | 'combined';

export interface SiteConfig {
  kind: SiteKind;
  /** Origen absoluto de la página corporativa ('' si es el mismo sitio). */
  publicUrl: string;
  /** Origen absoluto del portal ('' si es el mismo sitio). */
  portalUrl: string;
}

const COMBINED: SiteConfig = { kind: 'combined', publicUrl: '', portalUrl: '' };
let cached: SiteConfig | null = null;

export function readSiteConfig(doc: Document = document): SiteConfig {
  const el = doc.querySelector<HTMLMetaElement>('meta[name="site"]');
  const kind = el?.dataset.kind;
  if (kind !== 'public' && kind !== 'portal') return COMBINED;
  const clean = (u?: string) => (u && /^https?:\/\/[^/]+$/.test(u) ? u : '');
  return { kind, publicUrl: clean(el?.dataset.publicUrl), portalUrl: clean(el?.dataset.portalUrl) };
}

export const site = (): SiteConfig => (cached ??= readSiteConfig());

/** Solo para pruebas: vuelve a leer la configuración del documento. */
export function resetSiteConfig() {
  cached = null;
}

/** Enlace a una ruta del portal: absoluto desde el sitio público; relativo en el resto. */
export function portalHref(path = '/'): string {
  const s = site();
  return s.kind === 'public' && s.portalUrl ? `${s.portalUrl}${path}` : path;
}

/** Enlace a la página corporativa: absoluto desde el portal; relativo en el resto. */
export function publicHref(): string {
  const s = site();
  return s.kind === 'portal' && s.publicUrl ? `${s.publicUrl}/` : '/';
}

/** Rutas que pertenecen al portal (mantener en sincronía con PORTAL_PATHS del Worker). */
const PORTAL_PATHS = ['/login', '/recuperar', '/restablecer', '/app', '/admin'];
export const isPortalPath = (path: string) => PORTAL_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

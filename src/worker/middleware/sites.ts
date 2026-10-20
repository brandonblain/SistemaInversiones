import type { Context, Next } from 'hono';
import type { Env, AppVariables } from '../index';

/**
 * Un solo Worker atiende dos sitios según el dominio:
 *  - público (PUBLIC_HOST, p. ej. pimexfortexcapital.com.mx): página corporativa; sin API.
 *  - portal  (PORTAL_HOST, p. ej. clientes.pimexfortexcapital.com.mx): login, paneles y API.
 * Cualquier otro dominio (localhost, staging, *.workers.dev) funciona "combinado", como un solo sitio.
 *
 * La cookie de sesión no define Domain, así que solo viaja al dominio del portal; el sitio público
 * nunca la recibe. La autorización sigue en las rutas /api (authMiddleware, requireInvestor, requireAdmin).
 */
export type SiteKind = 'public' | 'portal' | 'combined';

type SiteContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/** Rutas de la SPA que pertenecen al portal (mantener en sincronía con web/src/App.tsx). */
const PORTAL_PATHS = ['/login', '/recuperar', '/restablecer', '/app', '/admin'];

export const isPortalPath = (path: string) => PORTAL_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

const norm = (h?: string) => (h ?? '').trim().toLowerCase().replace(/\.$/, '');

export function siteKind(env: Env, url: URL): SiteKind {
  const host = norm(url.hostname);
  const portal = norm(env.PORTAL_HOST);
  const pub = norm(env.PUBLIC_HOST);
  if (portal && host === portal) return 'portal';
  if (pub && (host === pub || host === `www.${pub}`)) return 'public';
  return 'combined';
}

/** Origen absoluto de otro sitio, con el mismo esquema y puerto de la petición (en producción: https, sin puerto). */
export function siteOrigin(url: URL, host: string): string {
  return `${url.protocol}//${norm(host)}${url.port ? `:${url.port}` : ''}`;
}

/** Separa los dos sitios antes de llegar a la API o a los archivos estáticos. */
export async function siteRoutingMiddleware(c: SiteContext, next: Next) {
  const url = new URL(c.req.url);
  const kind = siteKind(c.env, url);
  if (kind !== 'public') return next();

  // www → dominio sin www (una sola dirección canónica)
  if (norm(url.hostname) !== norm(c.env.PUBLIC_HOST)) {
    return c.redirect(`${siteOrigin(url, c.env.PUBLIC_HOST!)}${url.pathname}${url.search}`, 301);
  }
  // La API solo existe en el portal: el sitio público no maneja sesiones ni datos.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.', details: null } }, 404);
  }
  // Login, recuperación y paneles viven en el subdominio del portal.
  if (isPortalPath(url.pathname) && c.env.PORTAL_HOST) {
    return c.redirect(`${siteOrigin(url, c.env.PORTAL_HOST)}${url.pathname}${url.search}`, 302);
  }
  return next();
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Entrega la SPA y los archivos estáticos (binding ASSETS). En el HTML agrega una etiqueta <meta>
 * con el tipo de sitio y las direcciones de ambos, para que React sepa qué mostrar sin configuración
 * de compilación.
 */
export async function serveSite(c: SiteContext) {
  if (!c.env.ASSETS) return c.notFound();
  const res = await c.env.ASSETS.fetch(c.req.raw);
  // Copia con cabeceras modificables (las de fetch son inmutables y el middleware de seguridad las amplía).
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return new Response(res.body, res);

  const url = new URL(c.req.url);
  const kind = siteKind(c.env, url);
  const publicUrl = c.env.PUBLIC_HOST ? siteOrigin(url, c.env.PUBLIC_HOST) : '';
  const portalUrl = c.env.PORTAL_HOST ? siteOrigin(url, c.env.PORTAL_HOST) : '';
  const meta = `<meta name="site" data-kind="${kind}" data-public-url="${escapeAttr(publicUrl)}" data-portal-url="${escapeAttr(portalUrl)}">`;
  const html = (await res.text()).replace('</head>', `${meta}</head>`);

  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(html, { status: res.status, headers });
}

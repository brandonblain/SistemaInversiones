import { Hono } from 'hono';
import { securityHeadersMiddleware, originGuardMiddleware, AuthenticatedUser, InvestorProfile } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { investorRoutes } from './routes/investor';
import { adminRoutes } from './routes/admin';
import { AppError, mapDbError } from './lib/errors';
import { runScheduledMaintenance } from './services/scheduled-jobs';

export interface Env {
  DB: D1Database;
  DOCS_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  APP_BASE_URL: string;
  DEFAULT_CURRENCY: string;
  EMAIL_FROM: string;
  /** "log" (desarrollo, no envía) | "resend" (API HTTP). En producción "log" NO marca correos como enviados. */
  EMAIL_PROVIDER?: string;
  EMAIL_API_KEY?: string;
  /** "false" solo en desarrollo/pruebas para entrar como admin sin MFA. Por defecto se exige MFA. */
  REQUIRE_ADMIN_MFA?: string;
  /** "true" cuando el cliente apruebe por escrito las convenciones de cálculo. En producción bloquea confirmaciones si no. */
  FINANCIAL_RULES_APPROVED?: string;
  /** Orígenes adicionales permitidos para peticiones que modifican datos (p. ej. http://localhost:5173 en desarrollo). */
  ALLOWED_ORIGINS?: string;
}

export type AppVariables = {
  user: AuthenticatedUser;
  profile: InvestorProfile | null;
  sessionId: string;
};

export const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use('*', securityHeadersMiddleware);
app.use('/api/*', originGuardMiddleware);

app.get('/api/health', (c) =>
  c.json({ success: true, data: { status: 'ok', environment: c.env.ENVIRONMENT || 'development', timestamp: new Date().toISOString() } })
);

app.route('/api/auth', authRoutes);
app.route('/api/investor', investorRoutes);
app.route('/api/admin', adminRoutes);

app.notFound((c) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.', details: null } }, 404));

app.onError((err, c) => {
  const appErr = err instanceof AppError ? err : mapDbError(err);
  if (appErr) {
    return c.json({ success: false, error: { code: appErr.code, message: appErr.message, details: appErr.details } }, appErr.status);
  }
  // No se registran cuerpos de petición ni datos sensibles.
  console.error(`[ERROR] ${c.req.method} ${new URL(c.req.url).pathname}:`, err instanceof Error ? err.message : 'unknown');
  return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado. Intente de nuevo.', details: null } }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        console.log(`[CRON] ${new Date(event.scheduledTime).toISOString()}`);
        await runScheduledMaintenance(env);
      })()
    );
  }
};

import { Hono } from 'hono';
import { securityHeadersMiddleware, AuthenticatedUser, InvestorProfile } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { investorRoutes } from './routes/investor';
import { adminRoutes } from './routes/admin';

export interface Env {
  DB: D1Database;
  DOCS_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  APP_BASE_URL: string;
  DEFAULT_CURRENCY: string;
  EMAIL_FROM: string;
  JWT_SECRET?: string;
  ADMIN_MFA_SECRET?: string;
  EMAIL_API_KEY?: string;
}

export type AppVariables = {
  user: AuthenticatedUser;
  profile: InvestorProfile | null;
  sessionId: string;
};

export const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Aplicar cabeceras de seguridad y no-cache a todas las peticiones
app.use('*', securityHeadersMiddleware);

// Rutas base
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString()
  });
});

// Montar submódulos
app.route('/api/auth', authRoutes);
app.route('/api/investor', investorRoutes);
app.route('/api/admin', adminRoutes);

import { runScheduledMaintenance } from './services/scheduled-jobs';

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        console.log(`[CRON] Scheduled event triggered at ${new Date(event.scheduledTime).toISOString()}`);
        await runScheduledMaintenance(env.DB, env.EMAIL_FROM);
      })()
    );
  }
};

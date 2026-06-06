import type { Express, RequestHandler } from 'express';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** Apply when TRUST_PROXY=true — reverse proxy terminates TLS in front of this service. */
export function applyTrustProxyAndSecurity(app: Express): void {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  if (!trustProxy) return;

  app.set('trust proxy', 1);

  const middleware: RequestHandler = (_req, res, next) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(key, value);
    }
    next();
  };

  app.use(middleware);
}

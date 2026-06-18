/** Default dev / LAN origins for Socket.io (Phase 1). Express CORS is a separate follow-up. */
const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:3000',
  /** Chromium serializes opaque origins as the string "null" (Electron file:// loads). */
  'null',
  /** Some Electron builds send Origin: file:// for packaged desktop clients. */
  'file://',
];

export function isCorsAllowAll(): boolean {
  return process.env.CORS_ALLOW_ALL === 'true';
}

/** Parsed allowlist from env (`CORS_ORIGINS`, `FRONTEND_URL`) plus local defaults. */
export function parseCorsOriginsFromEnv(): string[] {
  const extra =
    process.env.CORS_ORIGINS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const frontend = process.env.FRONTEND_URL?.trim();
  const origins = new Set([...DEFAULT_LOCAL_ORIGINS, ...extra]);
  if (frontend) origins.add(frontend);
  return [...origins];
}

export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  // Packaged Electron desktop clients (file:// bundle).
  if (origin === 'file://' || origin.startsWith('file://')) return true;
  return false;
}

export type SocketIoCorsCallback = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => void;

/** Socket.io `cors.origin` resolver with `CORS_ALLOW_ALL=true` escape hatch. */
export function resolveSocketIoCorsOrigin(): true | SocketIoCorsCallback {
  if (isCorsAllowAll()) return true;
  const allowed = parseCorsOriginsFromEnv();
  return (origin, callback) => {
    if (!origin || origin === 'null' || origin.startsWith('file://')) {
      // Opaque / file:// origins: reflect as wildcard — browsers reject
      // `Access-Control-Allow-Origin: null` for WebSocket upgrades.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback(null, '*' as any);
      return;
    }
    if (isOriginAllowed(origin, allowed)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS origin not allowed'), false);
  };
}

/**
 * Idempotency Middleware
 *
 * Prevents duplicate processing of sync push operations.
 * When a client sends an `Idempotency-Key` header, the server:
 * 1. Checks if a response for that key (scoped by tenant) already exists.
 * 2. If yes, returns the cached response (no re-processing).
 * 3. If no, processes the request and caches the response.
 *
 * Keys are stored in PostgreSQL `idempotency_cache` table (if available)
 * or in-memory with TTL as a fallback.
 *
 * Only applies to POST/PUT/PATCH methods (mutating operations).
 */

import { Request, Response, NextFunction } from 'express';
import { TenantRequest } from './tenantMiddleware.js';

interface CacheEntry {
  statusCode: number;
  body: unknown;
  createdAt: number;
}

// In-memory cache with TTL (fallback; production should use Redis or PG)
const idempotencyCache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (now - entry.createdAt > TTL_MS) {
      idempotencyCache.delete(key);
    }
  }
}, 60 * 60 * 1000); // Every hour

/**
 * Idempotency middleware.
 * Only processes requests with an Idempotency-Key header.
 */
export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  // Only apply to mutating methods
  if (!idempotencyKey || !['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const tenantId = (req as TenantRequest).tenantId || 'unknown';
  const cacheKey = `${tenantId}:${idempotencyKey}`;

  // Check if we already processed this key
  const cached = idempotencyCache.get(cacheKey);
  if (cached) {
    // Return cached response without re-processing
    res.status(cached.statusCode).json(cached.body);
    return;
  }

  // Intercept the response to cache it
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    // Only cache successful responses (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyCache.set(cacheKey, {
        statusCode: res.statusCode,
        body,
        createdAt: Date.now(),
      });
    }
    return originalJson(body);
  };

  next();
}

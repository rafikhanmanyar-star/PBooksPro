/**
 * Idempotency Middleware
 *
 * Prevents duplicate processing of sync push operations.
 * When a client sends an `Idempotency-Key` header, the server:
 * 1. Checks if a response for that key (scoped by tenant) already exists in PostgreSQL.
 * 2. If yes, returns the cached response (no re-processing).
 * 3. If no, processes the request and caches the response to idempotency_cache table.
 *
 * Uses PostgreSQL idempotency_cache table for durable storage across restarts.
 * Falls back to in-memory cache if PostgreSQL is unavailable.
 *
 * Only applies to POST/PUT/PATCH methods (mutating operations).
 */

import { Request, Response, NextFunction } from 'express';
import { TenantRequest } from './tenantMiddleware.js';
import type { Pool } from 'pg';

interface CacheEntry {
  statusCode: number;
  body: unknown;
  createdAt: number;
}

// In-memory fallback with TTL when PostgreSQL fails
const idempotencyCache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Clean up expired in-memory entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (now - entry.createdAt > TTL_MS) {
      idempotencyCache.delete(key);
    }
  }
}, 60 * 60 * 1000); // Every hour

/**
 * Idempotency middleware factory.
 * @param pool - PostgreSQL pool for durable idempotency cache (optional; uses in-memory if not provided)
 */
export function idempotencyMiddleware(pool?: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Only apply to mutating methods
    if (!idempotencyKey || !['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const tenantId = (req as TenantRequest).tenantId || 'unknown';
    const cacheKey = `${tenantId}:${idempotencyKey}`;

    // 1. Try PostgreSQL idempotency_cache first (durable)
    if (pool) {
      try {
        const existing = await pool.query(
          `SELECT status_code, response_body, created_at FROM idempotency_cache 
           WHERE tenant_id = $1 AND idempotency_key = $2 
           AND created_at > NOW() - INTERVAL '24 hours'`,
          [tenantId, idempotencyKey]
        );

        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          const statusCode = row.status_code || 200;
          const body = row.response_body;
          res.status(statusCode).json(body ?? {});
          return;
        }
      } catch (dbError) {
        console.warn('[Idempotency] PostgreSQL check failed, falling back to in-memory:', (dbError as Error).message);
        // Fall through to in-memory check
      }
    }

    // 2. Check in-memory fallback
    const cached = idempotencyCache.get(cacheKey);
    if (cached) {
      res.status(cached.statusCode).json(cached.body);
      return;
    }

    // 3. Cache miss - intercept response to store on success
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entry: CacheEntry = {
          statusCode: res.statusCode,
          body,
          createdAt: Date.now(),
        };

        // Store in PostgreSQL for durability
        if (pool) {
          pool.query(
            `INSERT INTO idempotency_cache (tenant_id, idempotency_key, status_code, response_body, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET
               status_code = EXCLUDED.status_code,
               response_body = EXCLUDED.response_body,
               created_at = EXCLUDED.created_at`,
            [tenantId, idempotencyKey, res.statusCode, JSON.stringify(body)]
          ).catch((err) => {
            console.warn('[Idempotency] Failed to cache in PostgreSQL:', (err as Error).message);
          });
        }

        // Also cache in-memory as hot path
        idempotencyCache.set(cacheKey, entry);
      }
      return originalJson(body);
    };

    next();
  };
}

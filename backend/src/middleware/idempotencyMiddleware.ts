import type { Response, NextFunction } from 'express';
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import type { AuthedRequest } from './authMiddleware.js';
import type { RequestWithId } from './requestLogging.js';

export const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key';
export const MUTATION_REQUEST_ID_FIELD = 'requestId';

export type IdempotentRequest = AuthedRequest &
  RequestWithId & {
    idempotencyKey?: string;
    idempotencyReplay?: boolean;
  };

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/** Paths that must not use idempotency (bulk sync, webhooks, auth). */
function skipIdempotency(path: string): boolean {
  const p = path.split('?')[0];
  return (
    p.includes('/state/') ||
    p.startsWith('/api/webhooks/') ||
    p.startsWith('/api/auth/') ||
    p.includes('/health')
  );
}

/**
 * Unwraps `{ requestId, data }` envelopes and strips top-level requestId from req.body
 * so existing route handlers remain unchanged.
 */
export function idempotencyBodyMiddleware(req: IdempotentRequest, _res: Response, next: NextFunction): void {
  if (!MUTATION_METHODS.has(req.method)) {
    next();
    return;
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    next();
    return;
  }

  const record = body as Record<string, unknown>;
  const headerKey = req.headers[IDEMPOTENCY_KEY_HEADER];
  const headerId = typeof headerKey === 'string' ? headerKey.trim() : '';

  if (record.data != null && typeof record.data === 'object' && !Array.isArray(record.data)) {
    const requestId =
      headerId ||
      (typeof record[MUTATION_REQUEST_ID_FIELD] === 'string' ? record[MUTATION_REQUEST_ID_FIELD].trim() : '');
    if (requestId) {
      req.idempotencyKey = requestId;
    }
    req.body = { ...(record.data as Record<string, unknown>) };
    next();
    return;
  }

  const requestId =
    headerId || (typeof record[MUTATION_REQUEST_ID_FIELD] === 'string' ? record[MUTATION_REQUEST_ID_FIELD].trim() : '');
  if (requestId) {
    req.idempotencyKey = requestId;
    const { [MUTATION_REQUEST_ID_FIELD]: _removed, ...rest } = record;
    req.body = rest;
  }

  next();
}

/** Returns cached response for duplicate requestId; stores new responses after handler completes. */
export async function idempotencyMiddleware(
  req: IdempotentRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!MUTATION_METHODS.has(req.method) || skipIdempotency(req.originalUrl ?? req.url)) {
    next();
    return;
  }

  const requestId = req.idempotencyKey?.trim();
  if (!requestId) {
    next();
    return;
  }

  const endpoint = (req.originalUrl ?? req.url).split('?')[0];
  const pool = getPool();

  try {
    const existing = await pool.query<{ response_status: number; response_data: unknown }>(
      `SELECT response_status, response_data
       FROM api_request_log
       WHERE request_id = $1
       LIMIT 1`,
      [requestId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      req.idempotencyReplay = true;
      logger.info('Idempotency replay', { requestId, endpoint, httpRequestId: req.requestId });
      res.status(row.response_status).json(row.response_data);
      return;
    }
  } catch (e) {
    logger.warn('Idempotency lookup failed — proceeding without cache', {
      requestId,
      error: e instanceof Error ? e.message : String(e),
    });
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = function idempotencyCapture(body: unknown) {
    if (!req.idempotencyReplay && res.statusCode >= 200 && res.statusCode < 300) {
      void pool
        .query(
          `INSERT INTO api_request_log (id, request_id, endpoint, user_id, tenant_id, response_status, response_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (request_id) DO NOTHING`,
          [
            requestId,
            requestId,
            endpoint.slice(0, 255),
            req.userId ?? null,
            req.tenantId ?? null,
            res.statusCode,
            JSON.stringify(body),
          ]
        )
        .catch((err: unknown) => {
          logger.warn('Idempotency store failed', {
            requestId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
    return originalJson(body);
  };

  next();
}

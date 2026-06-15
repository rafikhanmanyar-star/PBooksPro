import type { Response } from 'express';
import { logger } from './logger.js';

export type ApiSuccessEnvelope<T> = { success: true; data: T; error: null };
export type ApiErrorEnvelope = {
  success: false;
  data: null;
  error: { code: string; message: string };
} & Record<string, unknown>;

/** success === true only after committed work; include error: null for a stable contract. */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccessEnvelope<T> = { success: true, data, error: null };
  res.status(status).json(body);
}

const VERSION_CONFLICT_MESSAGE = 'This record was modified by another user. Please reload.';

/** Standard LWW / optimistic-lock conflict (HTTP 409). */
export function sendVersionConflict(res: Response, serverVersion: number): void {
  res.status(409).json({
    success: false,
    data: null,
    serverVersion,
    error: {
      code: 'CONFLICT',
      message: VERSION_CONFLICT_MESSAGE,
      serverVersion,
    },
  });
}

/** Any failure: validation, DB, or unexpected — never claim success. */
export function sendFailure(
  res: Response,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
): void {
  const body: Record<string, unknown> = {
    success: false,
    data: null,
    error: { code, message },
    ...extra,
  };
  res.status(status).json(body);
}

function mapErrorToHttp(e: unknown): {
  status: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
} {
  const pgError = e as { code?: string; message?: string; constraint?: string };
  if (pgError?.code === '23505') {
    return { status: 409, code: 'DUPLICATE_RECORD', message: 'This record already exists.' };
  }
  if (pgError?.code === '23503') {
    return {
      status: 400,
      code: 'FOREIGN_KEY_VIOLATION',
      message: 'Cannot save: linked data is missing or invalid.',
    };
  }
  if (pgError?.code === '23514') {
    return { status: 400, code: 'CHECK_VIOLATION', message: 'Cannot save: invalid data.' };
  }
  if (pgError?.code === 'ECONNREFUSED' || pgError?.message?.includes('ECONNREFUSED')) {
    return {
      status: 503,
      code: 'DB_CONNECTION',
      message: 'Server connection failed. Please try again.',
    };
  }
  if (
    pgError?.code === '57P01' ||
    (typeof pgError?.message === 'string' && pgError.message.includes('terminating connection'))
  ) {
    return {
      status: 503,
      code: 'DB_CONNECTION',
      message: 'Database connection was lost. Please try again.',
    };
  }
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      return { status: 409, code: 'DUPLICATE_RECORD', message: 'This record already exists.' };
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return {
        status: 503,
        code: 'TIMEOUT',
        message: 'The operation took too long. Please try again.',
      };
    }
    const isProd = process.env.NODE_ENV === 'production';
    return {
      status: 500,
      code: 'SERVER_ERROR',
      message: isProd ? 'An unexpected error occurred.' : e.message || 'An unexpected error occurred.',
    };
  }
  return {
    status: 500,
    code: 'SERVER_ERROR',
    message:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : e == null
          ? 'Unknown error'
          : String(e),
  };
}

/** Use in catch blocks for unexpected / DB errors; logs stack in dev. */
export function handleRouteError(
  res: Response,
  e: unknown,
  context?: { route?: string; payload?: unknown }
): void {
  const mapped = mapErrorToHttp(e);
  logger.error('API route error', {
    route: context?.route,
    code: mapped.code,
    status: mapped.status,
    message: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  });

  void import('../services/monitoring/monitoringCapture.js').then(({ captureMonitoringEvent }) => {
    const isDb =
      mapped.code === 'DB_CONNECTION' ||
      mapped.code === 'TIMEOUT' ||
      (e instanceof Error && /ECONNREFUSED|terminating connection|57P01/i.test(e.message));
    const payload = context?.payload as { requestId?: string; tenantId?: string; userId?: string } | undefined;
    captureMonitoringEvent({
      category: isDb ? 'database' : 'api_failure',
      severity: mapped.status >= 500 ? 'error' : 'warn',
      message: e instanceof Error ? e.message : String(e),
      code: mapped.code,
      route: context?.route,
      requestId: payload?.requestId,
      tenantId: payload?.tenantId ?? null,
      userId: payload?.userId ?? null,
      statusCode: mapped.status,
      stackTrace: e instanceof Error ? e.stack : undefined,
    });
  });

  sendFailure(res, mapped.status, mapped.code, mapped.message, mapped.extra);
}

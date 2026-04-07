import type { Response } from 'express';

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
    return { status: 409, code: 'DUPLICATE_KEY', message: 'This record already exists.' };
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
      return { status: 409, code: 'DUPLICATE_KEY', message: 'This record already exists.' };
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return {
        status: 503,
        code: 'TIMEOUT',
        message: 'The operation took too long. Please try again.',
      };
    }
    return {
      status: 500,
      code: 'SERVER_ERROR',
      message: e.message || 'An unexpected error occurred.',
    };
  }
  return {
    status: 500,
    code: 'SERVER_ERROR',
    message: e == null ? 'Unknown error' : String(e),
  };
}

/** Use in catch blocks for unexpected / DB errors; logs stack in dev. */
export function handleRouteError(
  res: Response,
  e: unknown,
  context?: { route?: string; payload?: unknown }
): void {
  const mapped = mapErrorToHttp(e);
  const dev = process.env.NODE_ENV !== 'production';
  if (dev) {
    console.error('[API route error]', context?.route, context?.payload, e);
  } else {
    console.error('[API route error]', mapped.code, mapped.message);
  }
  if (e instanceof Error && e.stack) {
    console.error(e.stack);
  }
  sendFailure(res, mapped.status, mapped.code, mapped.message, mapped.extra);
}

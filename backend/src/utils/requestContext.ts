import type { Request } from 'express';

/** Client IP for audit trails (respects X-Forwarded-For when present). */
export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() ?? null;
  }
  return req.socket.remoteAddress ?? null;
}

export function extractUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : null;
}

/**
 * Generates and attaches idempotency keys to API mutation payloads.
 * Backend idempotencyMiddleware strips requestId before route handlers run.
 */

export const MUTATION_REQUEST_ID_FIELD = 'requestId';

export function generateMutationRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Attach requestId to a mutation body (flat or wrapped `{ data }` shape). */
export function withMutationRequestId<T extends Record<string, unknown>>(
  body: T | undefined,
  requestId: string = generateMutationRequestId()
): T & { requestId: string } {
  if (!body || typeof body !== 'object') {
    return { requestId } as T & { requestId: string };
  }
  if (MUTATION_REQUEST_ID_FIELD in body && typeof (body as Record<string, unknown>).requestId === 'string') {
    return body as T & { requestId: string };
  }
  return { ...body, requestId };
}

/** Spec-style envelope: `{ requestId, data }` for new endpoints; middleware unwraps both shapes. */
export function wrapMutationEnvelope<T extends Record<string, unknown>>(
  data: T,
  requestId: string = generateMutationRequestId()
): { requestId: string; data: T } {
  return { requestId, data };
}

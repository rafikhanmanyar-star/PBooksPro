import type { Response } from 'express';
import { sendVersionConflict } from './apiResponse.js';

/** Resolve current server version and respond with standard HTTP 409 CONFLICT. */
export async function respondVersionConflict(
  res: Response,
  fetchVersion: () => Promise<number | null | undefined>
): Promise<void> {
  const version = await fetchVersion();
  sendVersionConflict(res, version ?? 0);
}

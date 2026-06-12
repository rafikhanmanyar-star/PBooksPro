import type { Response } from 'express';
import { sendSuccess } from '../utils/apiResponse.js';

/** Public liveness payload for GET /health and GET /api/v1/health. */
export function sendLivenessResponse(res: Response): void {
  sendSuccess(res, {
    ok: true,
    service: 'pbooks-backend',
    serverTime: new Date().toISOString(),
    readiness: '/api/v1/health/ready',
    apiVersion: 'v1',
  });
}

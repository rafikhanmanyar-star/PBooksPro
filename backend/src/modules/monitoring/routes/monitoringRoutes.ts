import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { publicIntrospectionLimiter } from '../../../middleware/introspectionGuard.js';
import { sendFailure, sendSuccess } from '../../../utils/apiResponse.js';
import { runReadinessCheck } from '../../../services/monitoring/monitoringHealthService.js';
import { sendLivenessResponse } from '../../../routes/healthLiveness.js';

export const monitoringPublicRouter = Router();

monitoringPublicRouter.get('/health', publicIntrospectionLimiter, (_req, res) => {
  sendLivenessResponse(res);
});

monitoringPublicRouter.get('/health/ready', publicIntrospectionLimiter, async (_req, res) => {
  try {
    const health = await runReadinessCheck();
    const status = health.status === 'unhealthy' ? 503 : 200;
    res.status(status).json({
      success: health.status !== 'unhealthy',
      data: {
        status: health.status,
        components: health.components,
        serverTime: new Date().toISOString(),
      },
      error: null,
    });
  } catch (e) {
    res.status(503).json({
      success: false,
      data: null,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: e instanceof Error ? e.message : 'Readiness check failed',
      },
    });
  }
});

export const monitoringIngestRouter = Router();

const clientErrorSchema = z.object({
  message: z.string().min(1).max(4000),
  stack: z.string().max(12000).optional(),
  componentStack: z.string().max(8000).optional(),
  url: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

monitoringIngestRouter.post('/monitoring/client-errors', async (req, res) => {
  const parsed = clientErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }

  const authed = req as AuthedRequest;
  const { captureMonitoringEvent } = await import('../../../services/monitoring/monitoringCapture.js');
  captureMonitoringEvent({
    category: 'application_error',
    severity: 'error',
    message: parsed.data.message,
    code: 'CLIENT_ERROR',
    tenantId: authed.tenantId ?? null,
    userId: authed.userId ?? null,
    route: parsed.data.url,
    stackTrace: parsed.data.stack ?? parsed.data.componentStack,
    metadata: parsed.data.metadata,
  });

  sendSuccess(res, { recorded: true });
});

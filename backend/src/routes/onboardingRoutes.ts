/**
 * Tenant onboarding wizard API.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { getPool } from '../db/pool.js';
import {
  completeOnboardingStep,
  getOrCreateOnboarding,
  restartOnboarding,
  skipOnboarding,
  updateOnboarding,
} from '../services/onboarding/onboardingService.js';
import { isValidOnboardingStep } from '../constants/onboardingSteps.js';

export const onboardingRouter = Router();

onboardingRouter.get('/onboarding', requirePermission('users.read'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    const state = await getOrCreateOnboarding(client, tenantId);
    sendSuccess(res, state);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /onboarding' });
  } finally {
    client.release();
  }
});

const patchSchema = z.object({
  currentStep: z.string().optional(),
  completedSteps: z.array(z.string()).optional(),
  stepData: z.record(z.unknown()).optional(),
});

onboardingRouter.put('/onboarding', requirePermission('users.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid onboarding payload.');
    return;
  }
  const body = parsed.data;
  if (body.currentStep && !isValidOnboardingStep(body.currentStep)) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid step id.');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const state = await updateOnboarding(client, tenantId, {
      currentStep: body.currentStep as Parameters<typeof updateOnboarding>[2]['currentStep'],
      completedSteps: body.completedSteps?.filter(isValidOnboardingStep),
      stepData: body.stepData,
    });
    sendSuccess(res, state);
  } catch (e) {
    handleRouteError(res, e, { route: 'PUT /onboarding' });
  } finally {
    client.release();
  }
});

const completeStepSchema = z.object({
  stepId: z.string(),
  stepData: z.record(z.unknown()).optional(),
});

onboardingRouter.post('/onboarding/complete-step', requirePermission('users.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = completeStepSchema.safeParse(req.body ?? {});
  if (!parsed.success || !isValidOnboardingStep(parsed.data.stepId)) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Valid stepId is required.');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const state = await completeOnboardingStep(
      client,
      tenantId,
      parsed.data.stepId,
      parsed.data.stepData
    );
    sendSuccess(res, state);
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /onboarding/complete-step' });
  } finally {
    client.release();
  }
});

onboardingRouter.post('/onboarding/skip', requirePermission('users.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    const state = await skipOnboarding(client, tenantId);
    sendSuccess(res, state);
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /onboarding/skip' });
  } finally {
    client.release();
  }
});

onboardingRouter.post('/onboarding/restart', requirePermission('users.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    const state = await restartOnboarding(client, tenantId);
    sendSuccess(res, state);
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /onboarding/restart' });
  } finally {
    client.release();
  }
});

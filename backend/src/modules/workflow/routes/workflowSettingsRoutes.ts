import { Router } from 'express';
import { z } from 'zod';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import {
  getWorkflowSettings,
  updateWorkflowSettings,
} from '../services/workflowSettingsService.js';

export const workflowSettingsRouter = Router();

const configSchema = z.object({
  approvalWorkflowEnabled: z.boolean().optional(),
  workflowConfig: z
    .object({
      levels: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      rules: z.array(
        z.object({
          id: z.string(),
          type: z.enum(['amount', 'department', 'project', 'entity', 'role']),
          level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          enabled: z.boolean().optional(),
          minAmount: z.number().optional(),
          maxAmount: z.number().optional(),
          departmentId: z.string().optional(),
          projectId: z.string().optional(),
          entityType: z
            .enum([
              'purchase_order',
              'contract',
              'bill',
              'payment',
              'retention_release',
              'variation_order',
            ])
            .optional(),
          role: z.string().optional(),
        })
      ),
    })
    .optional(),
});

workflowSettingsRouter.get('/workflow/settings', requirePermission('workflow.view'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const settings = await getWorkflowSettings(client, tenantId);
      sendSuccess(res, settings);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

workflowSettingsRouter.put(
  '/workflow/settings',
  requirePermission('workflow.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const updated = await updateWorkflowSettings(
          client,
          tenantId,
          {
            approvalWorkflowEnabled: parsed.data.approvalWorkflowEnabled,
            workflowConfig: parsed.data.workflowConfig,
          },
          req.userId ?? null
        );
        await client.query('COMMIT');
        emitEntityEvent(tenantId, 'updated', 'settings', {
          id: tenantId,
          sourceUserId: req.userId,
          data: { workflowSettings: updated },
        });
        sendSuccess(res, updated);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

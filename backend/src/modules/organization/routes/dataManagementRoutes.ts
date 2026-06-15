import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { memoryCacheDeletePrefix } from '../../../utils/memoryCache.js';
import {
  clearTenantTransactions,
  factoryResetTenant,
} from '../../../services/tenantDataManagementService.js';
import { emitEntityEvent } from '../../../core/realtime.js';

export const dataManagementRouter = Router();

function invalidateTenantDashboardCache(tenantId: string): void {
  memoryCacheDeletePrefix(`dashboard_metrics:${tenantId}`);
  memoryCacheDeletePrefix(`dashboard_charts:${tenantId}`);
  memoryCacheDeletePrefix(`rental_balances:${tenantId}:`);
  memoryCacheDeletePrefix(`rental_monthly:${tenantId}:`);
}

/**
 * DELETE /data-management/clear-transactions
 * Clears financial/transaction data; preserves entity structure (projects, contacts, etc.).
 */
dataManagementRouter.delete(
  '/data-management/clear-transactions',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    try {
      const result = await withTransaction(async (client) => clearTenantTransactions(client, tenantId));
      invalidateTenantDashboardCache(tenantId);
      emitEntityEvent(tenantId, 'updated', 'settings', {
        data: { bulkRefresh: 'clear_transactions', recordsDeleted: result.recordsDeleted },
        sourceUserId: req.userId,
      });
      sendSuccess(res, {
        success: true,
        message: 'Transaction data cleared.',
        details: {
          recordsDeleted: result.recordsDeleted,
          tablesCleared: result.tablesCleared,
          accountsReset: 0,
        },
      });
    } catch (e) {
      handleRouteError(res, e, { route: 'DELETE /data-management/clear-transactions' });
    }
  }
);

/**
 * DELETE /data-management/factory-reset
 * Wipes all organization data and restores a fresh-install chart of accounts.
 */
dataManagementRouter.delete(
  '/data-management/factory-reset',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    try {
      const result = await withTransaction(async (client) => factoryResetTenant(client, tenantId));
      invalidateTenantDashboardCache(tenantId);
      emitEntityEvent(tenantId, 'updated', 'settings', {
        data: { bulkRefresh: 'factory_reset', recordsDeleted: result.recordsDeleted },
        sourceUserId: req.userId,
      });
      sendSuccess(res, {
        success: true,
        message: 'Organization reset to fresh install state.',
        details: {
          recordsDeleted: result.recordsDeleted,
          tablesCleared: result.tablesCleared,
        },
      });
    } catch (e) {
      handleRouteError(res, e, { route: 'DELETE /data-management/factory-reset' });
    }
  }
);

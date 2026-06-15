import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import {
  listProjectExpenseCategories,
  rowToPeCategoryApi,
  softDeleteProjectExpenseCategory,
  upsertProjectExpenseCategory,
} from '../services/projectExpenseCategoryService.js';
import {
  approveProjectExpenseVoucher,
  createProjectExpenseVoucher,
  getProjectExpenseVoucherById,
  listProjectExpenseVouchers,
  postProjectExpenseVoucher,
  rejectProjectExpenseVoucher,
  rowToPeVApi,
  softDeleteProjectExpenseVoucher,
  submitProjectExpenseVoucher,
  unpostProjectExpenseVoucher,
  updateProjectExpenseVoucher,
} from '../services/projectExpenseVoucherService.js';
import {
  getPeVExpenseByCategory,
  getPeVExpenseByProject,
  getPeVExpenseByVendor,
  getPeVExpenseTrend,
  getProjectExpenseRegister,
} from '../services/pevReportService.js';

export const projectExpenseVoucherRouter = Router();

const requirePeVCreate = requirePermission('pev.create');
const requirePeVApprove = requirePermission('pev.approve');
const requirePeVPost = requirePermission('pev.post');
const requirePeVRead = requirePermission('pev.read');

// --- Expense Categories ---

projectExpenseVoucherRouter.get('/project-expense-categories', requirePeVRead, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const activeOnly = req.query.activeOnly === 'true';
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listProjectExpenseCategories(client, tenantId, { activeOnly });
      sendSuccess(res, rows.map(rowToPeCategoryApi));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectExpenseVoucherRouter.post('/project-expense-categories', requirePeVCreate, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertProjectExpenseCategory(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    const api = rowToPeCategoryApi(result.row);
    emitEntityEvent(tenantId, result.wasInsert ? 'created' : 'updated', 'project_expense_category', {
      data: api,
      sourceUserId: req.userId,
    });
    sendSuccess(res, api, result.wasInsert ? 201 : 200);
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectExpenseVoucherRouter.put(
  '/project-expense-categories/:id',
  requirePeVCreate,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = { ...(req.body as Record<string, unknown>), id: req.params.id };
    try {
      const result = await withTransaction((client) =>
        upsertProjectExpenseCategory(client, tenantId, body, req.userId ?? null)
      );
      if (result.conflict) {
        sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
        return;
      }
      const api = rowToPeCategoryApi(result.row);
      emitEntityEvent(tenantId, 'updated', 'project_expense_category', { data: api, sourceUserId: req.userId });
      sendSuccess(res, api);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.delete(
  '/project-expense-categories/:id',
  requirePeVCreate,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const versionRaw = req.query.version;
    const expectedVersion =
      typeof versionRaw === 'string' && versionRaw !== '' ? Number(versionRaw) : undefined;
    try {
      const result = await withTransaction((client) =>
        softDeleteProjectExpenseCategory(
          client,
          tenantId,
          req.params.id,
          req.userId ?? null,
          Number.isFinite(expectedVersion) ? expectedVersion : undefined
        )
      );
      if (result.conflict) {
        sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
        return;
      }
      if (!result.ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Category not found');
        return;
      }
      emitEntityEvent(tenantId, 'deleted', 'project_expense_category', {
        id: req.params.id,
        sourceUserId: req.userId,
      });
      sendSuccess(res, { id: req.params.id });
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

// --- Vouchers (report routes before :id) ---

function reportFilters(req: AuthedRequest) {
  return {
    projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
    toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
  };
}

projectExpenseVoucherRouter.get(
  '/project-expense-vouchers/reports/register',
  requirePeVRead,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const data = await getProjectExpenseRegister(client, tenantId, reportFilters(req));
        sendSuccess(res, data);
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.get(
  '/project-expense-vouchers/reports/by-category',
  requirePeVRead,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const f = reportFilters(req);
        const data = await getPeVExpenseByCategory(client, tenantId, f);
        sendSuccess(res, data);
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.get(
  '/project-expense-vouchers/reports/by-project',
  requirePeVRead,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const f = reportFilters(req);
        const data = await getPeVExpenseByProject(client, tenantId, f);
        sendSuccess(res, data);
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.get(
  '/project-expense-vouchers/reports/by-vendor',
  requirePeVRead,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const f = reportFilters(req);
        const data = await getPeVExpenseByVendor(client, tenantId, f);
        sendSuccess(res, data);
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.get(
  '/project-expense-vouchers/reports/trend',
  requirePeVRead,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const f = reportFilters(req);
        const granularity = req.query.granularity === 'week' ? 'week' : 'month';
        const data = await getPeVExpenseTrend(client, tenantId, { ...f, granularity });
        sendSuccess(res, data);
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.get('/project-expense-vouchers', requirePeVRead, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listProjectExpenseVouchers(client, tenantId, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
        expenseCategoryId:
          typeof req.query.expenseCategoryId === 'string' ? req.query.expenseCategoryId : undefined,
        vendorId: typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined,
        fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
      });
      sendSuccess(res, rows.map(rowToPeVApi));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectExpenseVoucherRouter.get('/project-expense-vouchers/:id', requirePeVRead, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getProjectExpenseVoucherById(client, tenantId, req.params.id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Voucher not found');
        return;
      }
      sendSuccess(res, rowToPeVApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectExpenseVoucherRouter.post('/project-expense-vouchers', requirePeVCreate, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      createProjectExpenseVoucher(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    const api = rowToPeVApi(result.row);
    emitEntityEvent(tenantId, 'created', 'project_expense_voucher', { data: api, sourceUserId: req.userId });
    sendSuccess(res, api, 201);
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectExpenseVoucherRouter.put('/project-expense-vouchers/:id', requirePeVCreate, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      updateProjectExpenseVoucher(client, tenantId, req.params.id, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Voucher not found');
      return;
    }
    const api = rowToPeVApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'project_expense_voucher', { data: api, sourceUserId: req.userId });
    sendSuccess(res, api);
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectExpenseVoucherRouter.delete(
  '/project-expense-vouchers/:id',
  requirePeVCreate,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const versionRaw = req.query.version;
    const expectedVersion =
      typeof versionRaw === 'string' && versionRaw !== '' ? Number(versionRaw) : undefined;
    try {
      const result = await withTransaction((client) =>
        softDeleteProjectExpenseVoucher(
          client,
          tenantId,
          req.params.id,
          req.userId ?? null,
          Number.isFinite(expectedVersion) ? expectedVersion : undefined
        )
      );
      if (result.conflict) {
        sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
        return;
      }
      if (!result.ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Voucher not found');
        return;
      }
      emitEntityEvent(tenantId, 'deleted', 'project_expense_voucher', {
        id: req.params.id,
        sourceUserId: req.userId,
      });
      sendSuccess(res, { id: req.params.id });
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.post(
  '/project-expense-vouchers/:id/submit',
  requirePeVCreate,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const row = await withTransaction((client) =>
        submitProjectExpenseVoucher(client, tenantId, req.params.id, req.userId ?? null)
      );
      const api = rowToPeVApi(row);
      emitEntityEvent(tenantId, 'updated', 'project_expense_voucher', { data: api, sourceUserId: req.userId });
      sendSuccess(res, api);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.post(
  '/project-expense-vouchers/:id/approve',
  requirePeVApprove,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const row = await withTransaction((client) =>
        approveProjectExpenseVoucher(client, tenantId, req.params.id, req.userId ?? null)
      );
      const api = rowToPeVApi(row);
      emitEntityEvent(tenantId, 'updated', 'project_expense_voucher', { data: api, sourceUserId: req.userId });
      sendSuccess(res, api);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.post(
  '/project-expense-vouchers/:id/reject',
  requirePeVApprove,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body as Record<string, unknown>;
    const reason =
      typeof body.reason === 'string'
        ? body.reason
        : typeof body.rejectionReason === 'string'
          ? body.rejectionReason
          : null;
    try {
      const row = await withTransaction((client) =>
        rejectProjectExpenseVoucher(client, tenantId, req.params.id, req.userId ?? null, reason)
      );
      const api = rowToPeVApi(row);
      emitEntityEvent(tenantId, 'updated', 'project_expense_voucher', { data: api, sourceUserId: req.userId });
      sendSuccess(res, api);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.post(
  '/project-expense-vouchers/:id/post',
  requirePeVPost,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const result = await withTransaction((client) =>
        postProjectExpenseVoucher(client, tenantId, req.params.id, req.userId ?? null)
      );
      const api = rowToPeVApi(result.row);
      emitEntityEvent(tenantId, 'updated', 'project_expense_voucher', { data: api, sourceUserId: req.userId });
      sendSuccess(res, { voucher: api, journalEntryId: result.journalEntryId });
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

projectExpenseVoucherRouter.post(
  '/project-expense-vouchers/:id/unpost',
  requirePeVPost,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const row = await withTransaction((client) =>
        unpostProjectExpenseVoucher(client, tenantId, req.params.id, req.userId ?? null)
      );
      const api = rowToPeVApi(row);
      emitEntityEvent(tenantId, 'updated', 'project_expense_voucher', { data: api, sourceUserId: req.userId });
      sendSuccess(res, api);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

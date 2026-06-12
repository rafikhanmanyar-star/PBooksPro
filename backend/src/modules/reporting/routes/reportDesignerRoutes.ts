import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';

import { handleRouteError, sendFailure, sendSuccess } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import { requireFinancialWriteRole } from '../../../middleware/rbacMiddleware.js';
import { getReportCapability } from '../middleware/reportCapability.js';
import { appendReportAudit } from '../repositories/reportAuditRepository.js';
import * as defRepo from '../repositories/reportDefinitionRepository.js';
import {
  saveReportDefinitionSchema,
  updateReportDefinitionSchema,
  saveReportScheduleSchema,
  updateReportScheduleSchema,
  saveReportShareSchema,
} from '../validators/reportDesignerSchema.js';
import * as scheduleRepo from '../repositories/reportScheduleRepository.js';
import * as pinRepo from '../repositories/reportDashboardPinRepository.js';
import * as shareRepo from '../repositories/reportShareRepository.js';
import * as catalogRepo from '../repositories/reportTemplateCatalogRepository.js';

export const reportDesignerRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

function mapDefinitionRow(row: defRepo.ReportDefinitionRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    category: row.category,
    module: row.module,
    reportType: row.report_type,
    tags: row.tags ?? [],
    visibility: row.visibility,
    configuration: row.configuration_json,
    createdBy: row.created_by,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    isFavorite: Boolean(row.is_favorite),
    pinned: Boolean(row.pinned),
    lastOpenedAt: row.last_opened_at
      ? row.last_opened_at instanceof Date
        ? row.last_opened_at.toISOString()
        : row.last_opened_at
      : null,
  };
}

reportDesignerRouter.get('/reports/designer/library', limiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const mod =
    typeof req.query.module === 'string' && req.query.module.trim()
      ? req.query.module.trim()
      : undefined;
  try {
    const [definitions, favorites, recent] = await Promise.all([
      defRepo.listAccessibleDefinitions({ tenantId, userId, module: mod }),
      defRepo.listFavoriteDefinitions({ tenantId, userId, module: mod }),
      defRepo.listRecentDefinitions({ tenantId, userId, module: mod, limit: 10 }),
    ]);
    sendSuccess(res, {
      definitions: definitions.map(mapDefinitionRow),
      favorites: favorites.map(mapDefinitionRow),
      recent: recent.map(mapDefinitionRow),
    });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /reports/designer/library' });
  }
});

reportDesignerRouter.get('/reports/designer/catalog-templates', limiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const mod =
    typeof req.query.module === 'string' && req.query.module.trim()
      ? req.query.module.trim()
      : undefined;
  try {
    const rows = await catalogRepo.listCatalogTemplates(mod);
    sendSuccess(res, {
      templates: rows.map((row) => ({
        id: row.id,
        module: row.module,
        name: row.name,
        description: row.description,
        reportType: row.report_type,
        category: row.category,
        configuration: row.configuration_json ?? {},
        sortOrder: row.sort_order,
      })),
    });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /reports/designer/catalog-templates' });
  }
});

reportDesignerRouter.get('/reports/designer/definitions/:id', limiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await defRepo.getDefinitionById(tenantId, userId, req.params.id);
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Report not found');
      return;
    }
    sendSuccess(res, mapDefinitionRow(row));
  } catch (e) {
    handleRouteError(res, e);
  }
});

reportDesignerRouter.post(
  '/reports/designer/definitions',
  requireFinancialWriteRole,
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const cap = getReportCapability(req.role);
    if (!cap.canCreateTemplates) {
      sendFailure(res, 403, 'FORBIDDEN', 'Saving reports is not permitted for this role.');
      return;
    }
    const parsed = saveReportDefinitionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendFailure(res, 400, 'BAD_REQUEST', parsed.error.message);
      return;
    }
    const body = parsed.data;
    if (
      (body.visibility === 'company' || body.visibility === 'team') &&
      !cap.canPublishPublicTemplates
    ) {
      sendFailure(res, 403, 'FORBIDDEN', 'Sharing company-wide reports requires administrator access.');
      return;
    }
    try {
      const id = body.id?.trim() || randomUUID();
      await defRepo.insertDefinition({
        id,
        tenant_id: tenantId,
        name: body.name,
        description: body.description ?? null,
        category: body.category ?? null,
        module: body.module,
        report_type: body.reportType,
        tags: body.tags ?? [],
        visibility: body.visibility,
        configuration_json: body.configuration,
        created_by: userId,
        updated_by: userId,
      });
      await defRepo.recordDefinitionOpened({ tenantId, userId, definitionId: id });
      await appendReportAudit({
        id: randomUUID(),
        tenantId,
        userId,
        action: 'definition_create',
        module: body.module,
        reportName: body.name,
        templateId: id,
        detail: { visibility: body.visibility, reportType: body.reportType },
      });
      sendSuccess(res, { id });
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /reports/designer/definitions' });
    }
  }
);

reportDesignerRouter.put(
  '/reports/designer/definitions/:id',
  requireFinancialWriteRole,
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = updateReportDefinitionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendFailure(res, 400, 'BAD_REQUEST', parsed.error.message);
      return;
    }
    const body = parsed.data;
    const cap = getReportCapability(req.role);
    if (
      body.visibility &&
      (body.visibility === 'company' || body.visibility === 'team') &&
      !cap.canPublishPublicTemplates
    ) {
      sendFailure(res, 403, 'FORBIDDEN', 'Sharing company-wide reports requires administrator access.');
      return;
    }
    try {
      const ok = await defRepo.updateDefinition({
        tenantId,
        id: req.params.id,
        userId,
        name: body.name,
        description: body.description,
        category: body.category,
        report_type: body.reportType,
        tags: body.tags,
        visibility: body.visibility,
        configuration_json: body.configuration,
      });
      if (!ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found or not editable');
        return;
      }
      sendSuccess(res, { ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

reportDesignerRouter.delete(
  '/reports/designer/definitions/:id',
  requireFinancialWriteRole,
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const ok = await defRepo.archiveDefinition(tenantId, userId, req.params.id);
      if (!ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found');
        return;
      }
      sendSuccess(res, { ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

reportDesignerRouter.post(
  '/reports/designer/definitions/:id/favorite',
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const row = await defRepo.getDefinitionById(tenantId, userId, req.params.id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found');
        return;
      }
      const result = await defRepo.toggleFavorite({
        tenantId,
        userId,
        definitionId: req.params.id,
        pinned: Boolean(req.body?.pinned),
      });
      sendSuccess(res, result);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

reportDesignerRouter.post(
  '/reports/designer/definitions/:id/open',
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const row = await defRepo.getDefinitionById(tenantId, userId, req.params.id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found');
        return;
      }
      await defRepo.recordDefinitionOpened({ tenantId, userId, definitionId: req.params.id });
      sendSuccess(res, { ok: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

function mapScheduleRow(row: scheduleRepo.ReportScheduleRow) {
  const recipients = Array.isArray(row.recipients_json)
    ? row.recipients_json.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    id: row.id,
    reportDefinitionId: row.report_definition_id,
    cadence: row.cadence,
    timezone: row.timezone,
    recipients,
    exportFormat: row.export_format,
    isActive: row.is_active,
    nextRunAt: row.next_run_at
      ? row.next_run_at instanceof Date
        ? row.next_run_at.toISOString()
        : row.next_run_at
      : null,
    lastRunAt: row.last_run_at
      ? row.last_run_at instanceof Date
        ? row.last_run_at.toISOString()
        : row.last_run_at
      : null,
    definitionName: row.definition_name ?? null,
  };
}

reportDesignerRouter.get(
  '/reports/designer/definitions/:id/schedules',
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const def = await defRepo.getDefinitionById(tenantId, userId, req.params.id);
      if (!def) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found');
        return;
      }
      const rows = await scheduleRepo.listSchedulesForDefinition(client, tenantId, req.params.id);
      sendSuccess(res, { schedules: rows.map(mapScheduleRow) });
    } catch (e) {
      handleRouteError(res, e);
    } finally {
      client.release();
    }
  }
);

reportDesignerRouter.post(
  '/reports/designer/schedules',
  requireFinancialWriteRole,
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = saveReportScheduleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendFailure(res, 400, 'BAD_REQUEST', parsed.error.message);
      return;
    }
    const body = parsed.data;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const def = await defRepo.getDefinitionById(tenantId, userId, body.reportDefinitionId);
      if (!def) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found');
        return;
      }
      const id = randomUUID();
      const nextRunAt = scheduleRepo.computeNextRunAt(body.cadence);
      await scheduleRepo.insertSchedule(client, {
        id,
        tenant_id: tenantId,
        report_definition_id: body.reportDefinitionId,
        cadence: body.cadence,
        timezone: body.timezone,
        recipients_json: body.recipients,
        export_format: body.exportFormat,
        created_by: userId,
        next_run_at: nextRunAt,
      });
      sendSuccess(res, { id, nextRunAt: nextRunAt.toISOString() });
    } catch (e) {
      handleRouteError(res, e);
    } finally {
      client.release();
    }
  }
);

reportDesignerRouter.put(
  '/reports/designer/schedules/:id',
  requireFinancialWriteRole,
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = updateReportScheduleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendFailure(res, 400, 'BAD_REQUEST', parsed.error.message);
      return;
    }
    const body = parsed.data;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const patch: Parameters<typeof scheduleRepo.updateSchedule>[3] = {};
      if (body.cadence) patch.cadence = body.cadence;
      if (body.recipients) patch.recipients_json = body.recipients;
      if (body.exportFormat) patch.export_format = body.exportFormat;
      if (body.isActive !== undefined) patch.is_active = body.isActive;
      if (body.cadence) patch.next_run_at = scheduleRepo.computeNextRunAt(body.cadence);
      const ok = await scheduleRepo.updateSchedule(client, tenantId, req.params.id, patch);
      if (!ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Schedule not found');
        return;
      }
      sendSuccess(res, { ok: true });
    } catch (e) {
      handleRouteError(res, e);
    } finally {
      client.release();
    }
  }
);

reportDesignerRouter.delete(
  '/reports/designer/schedules/:id',
  requireFinancialWriteRole,
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const ok = await scheduleRepo.deleteSchedule(client, tenantId, req.params.id);
      if (!ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Schedule not found');
        return;
      }
      sendSuccess(res, { ok: true });
    } catch (e) {
      handleRouteError(res, e);
    } finally {
      client.release();
    }
  }
);

function mapShareRow(row: shareRepo.ReportShareRow) {
  return {
    id: row.id,
    sharedWithUserId: row.shared_with_user_id,
    sharedWithRole: row.shared_with_role,
    permission: row.permission,
    userName: row.user_name ?? null,
    userUsername: row.user_username ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

reportDesignerRouter.get(
  '/reports/designer/definitions/:id/shares',
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const def = await defRepo.getDefinitionById(tenantId, userId, req.params.id);
      if (!def) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found');
        return;
      }
      if (def.created_by !== userId) {
        sendFailure(res, 403, 'FORBIDDEN', 'Only the report owner can manage shares');
        return;
      }
      const rows = await shareRepo.listSharesForDefinition(client, tenantId, req.params.id);
      sendSuccess(res, { shares: rows.map(mapShareRow) });
    } catch (e) {
      handleRouteError(res, e);
    } finally {
      client.release();
    }
  }
);

reportDesignerRouter.post(
  '/reports/designer/definitions/:id/shares',
  requireFinancialWriteRole,
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = saveReportShareSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendFailure(res, 400, 'BAD_REQUEST', parsed.error.message);
      return;
    }
    const body = parsed.data;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const def = await defRepo.getDefinitionById(tenantId, userId, req.params.id);
      if (!def) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found');
        return;
      }
      if (def.created_by !== userId) {
        sendFailure(res, 403, 'FORBIDDEN', 'Only the report owner can share');
        return;
      }
      const id = await shareRepo.insertShare(client, {
        tenant_id: tenantId,
        report_definition_id: req.params.id,
        shared_with_user_id: body.sharedWithUserId ?? null,
        shared_with_role: body.sharedWithRole ?? null,
        permission: body.permission,
        created_by: userId,
      });
      sendSuccess(res, { id });
    } catch (e) {
      handleRouteError(res, e);
    } finally {
      client.release();
    }
  }
);

reportDesignerRouter.delete(
  '/reports/designer/shares/:shareId',
  requireFinancialWriteRole,
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const ok = await shareRepo.deleteShare(client, tenantId, req.params.shareId);
      if (!ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Share not found');
        return;
      }
      sendSuccess(res, { ok: true });
    } catch (e) {
      handleRouteError(res, e);
    } finally {
      client.release();
    }
  }
);

reportDesignerRouter.get('/reports/designer/dashboard-pins', limiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    const pins = await pinRepo.listDashboardPins(client, tenantId, userId);
    sendSuccess(res, {
      pins: pins.map((p) => ({
        id: p.id,
        reportDefinitionId: p.report_definition_id,
        sortOrder: p.sort_order,
        name: p.definition_name ?? '',
        module: p.definition_module ?? '',
        reportType: p.definition_report_type ?? 'tabular',
        configuration: p.configuration_json ?? {},
      })),
    });
  } catch (e) {
    handleRouteError(res, e);
  } finally {
    client.release();
  }
});

reportDesignerRouter.post(
  '/reports/designer/dashboard-pins',
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const definitionId =
      typeof req.body?.reportDefinitionId === 'string' ? req.body.reportDefinitionId.trim() : '';
    if (!definitionId) {
      sendFailure(res, 400, 'BAD_REQUEST', 'reportDefinitionId is required');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const def = await defRepo.getDefinitionById(tenantId, userId, definitionId);
      if (!def) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found');
        return;
      }
      const id = randomUUID();
      await pinRepo.upsertDashboardPin(client, {
        id,
        tenant_id: tenantId,
        user_id: userId,
        report_definition_id: definitionId,
        sort_order: Number(req.body?.sortOrder ?? 0),
      });
      sendSuccess(res, { id });
    } catch (e) {
      handleRouteError(res, e);
    } finally {
      client.release();
    }
  }
);

reportDesignerRouter.delete(
  '/reports/designer/dashboard-pins/:definitionId',
  limiter,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const ok = await pinRepo.removeDashboardPin(
        client,
        tenantId,
        userId,
        req.params.definitionId
      );
      if (!ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Pin not found');
        return;
      }
      sendSuccess(res, { ok: true });
    } catch (e) {
      handleRouteError(res, e);
    } finally {
      client.release();
    }
  }
);

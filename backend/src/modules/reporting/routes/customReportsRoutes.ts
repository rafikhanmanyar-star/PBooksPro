import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';

import { getPool } from '../../../db/pool.js';
import { handleRouteError, sendFailure, sendSuccess } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { memoryCacheDeletePrefix } from '../../../utils/memoryCache.js';

import { getRegistryForModule, REPORT_MODULE_CATALOG } from '../metadata/moduleRegistries.js';
import type { RegisteredField } from '../metadata/fieldRegistryTypes.js';
import { isCalculatedField } from '../metadata/fieldRegistryTypes.js';
import {
  PROJECT_SELLING_MODULE_KEY,
} from '../metadata/projectSellingFields.js';
import * as templateRepo from '../repositories/customReportTemplateRepository.js';
import { appendReportAudit } from '../repositories/reportAuditRepository.js';
import { getReportCapability } from '../middleware/reportCapability.js';
import { requireFinancialWriteRole } from '../../../middleware/rbacMiddleware.js';
import {
  customReportExportBodySchema,
  customReportGenerateBodySchema,
  saveTemplateSchema,
  updateTemplateBodySchema,
} from '../validators/reportConfigurationSchema.js';
import { runCustomReport } from '../services/customReportRunService.js';
import { buildCsvBuffer, buildPdfGridBuffer, buildXlsxBuffer } from '../exports/renderFormats.js';
import { emitCustomReportTemplateEvent } from '../services/reportRealtimeEvents.js';

export const customReportsRouter = Router();

const reportLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

function mapReportBuildError(e: unknown): { status: number; code: string; message: string } | null {
  if (!(e instanceof Error)) return null;
  const m = e.message;
  if (
    m.startsWith('UNKNOWN_FIELD:') ||
    m.startsWith('UNKNOWN_GROUP_DIMENSION:') ||
    m.startsWith('FILTER_FIELD_NOT_ALLOWED:') ||
    m.startsWith('FILTER_IN_REQUIRES_ARRAY') ||
    m.startsWith('AGG_FIELD_INVALID:') ||
    m.startsWith('FIELD_NOT_AGGREGATABLE:') ||
    m.startsWith('CALCULATED_FIELDS_UNSUPPORTED_WITH_GROUP_BY') ||
    m.startsWith('UNSUPPORTED_MODULE:') ||
    m.startsWith('AGING_MODULE_NOT_SUPPORTED:') ||
    m.startsWith('FORMULA_')
  ) {
    return { status: 400, code: 'BAD_REQUEST', message: m };
  }
  return null;
}

function publicFieldMeta(f: RegisteredField) {
  const base = {
    key: f.key,
    label: f.label,
    type: f.type,
    entityGroup: f.entityGroup,
    filterable: f.filterable !== false && !isCalculatedField(f),
    sortable: f.sortable !== false && !isCalculatedField(f),
    aggregatable: 'aggregatable' in f ? f.aggregatable === true : false,
    searchable: f.searchable === true,
    kind: isCalculatedField(f) ? ('calculated' as const) : ('column' as const),
    formula: isCalculatedField(f) ? f.formula : undefined,
  };
  return base;
}

customReportsRouter.get('/reports/custom/metadata', reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const mod = typeof req.query.module === 'string' ? req.query.module.trim() : PROJECT_SELLING_MODULE_KEY;
  try {
    const pack = getRegistryForModule(mod);
    sendSuccess(res, {
      module: mod,
      modules: REPORT_MODULE_CATALOG,
      fields: pack.fields.map(publicFieldMeta),
      groupDimensions: Object.keys(pack.groupDimensions),
      filterOperators: ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN', 'IN', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL'],
      aggregateOperations: ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'],
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('UNKNOWN_REPORT_MODULE:')) {
      sendFailure(res, 400, 'BAD_REQUEST', e.message);
      return;
    }
    handleRouteError(res, e);
  }
});

customReportsRouter.post('/reports/custom/generate', requireFinancialWriteRole, reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = customReportGenerateBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendFailure(res, 400, 'BAD_REQUEST', parsed.error.message);
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    const data = await runCustomReport(client, tenantId, parsed.data, 'preview');
    await appendReportAudit({
      id: randomUUID(),
      tenantId,
      userId,
      action: 'generate',
      module: parsed.data.module,
        reportName: parsed.data.columns?.map((c: { headerLabel?: string }) => c.headerLabel).filter(Boolean)[0],
      detail: {
        filters: parsed.data.filters,
        groupBy: parsed.data.groupBy,
        fieldKeys: parsed.data.fields ?? parsed.data.columns?.map((c) => c.key),
      },
    });
    sendSuccess(res, data);
  } catch (e) {
    const mapped = mapReportBuildError(e);
    if (mapped) sendFailure(res, mapped.status, mapped.code, mapped.message);
    else handleRouteError(res, e, { route: 'POST /reports/custom/generate', payload: req.body });
  } finally {
    client.release();
  }
});

customReportsRouter.post('/reports/custom/export', requireFinancialWriteRole, reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const cap = getReportCapability(req.role);
  if (!cap.canExportFiles) {
    sendFailure(res, 403, 'FORBIDDEN', 'Exporting custom reports is not permitted for this role.');
    return;
  }
  const parsed = customReportExportBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendFailure(res, 400, 'BAD_REQUEST', parsed.error.message);
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    const exportPayload = { ...parsed.data, page: 1, pageSize: 5000 };
    const data = await runCustomReport(client, tenantId, exportPayload, 'export');
    const colOrder = data.columns.map((c) => c.key);
    const labels: Record<string, string> = {};
    for (const c of data.columns) labels[c.key] = c.label;
    const title = parsed.data.reportName?.trim() || 'Custom report';
    let buf: Buffer;
    let contentType: string;
    let ext: string;
    if (parsed.data.format === 'csv') {
      buf = buildCsvBuffer(data.rows, colOrder, labels);
      contentType = 'text/csv; charset=utf-8';
      ext = 'csv';
    } else if (parsed.data.format === 'xlsx') {
      buf = await buildXlsxBuffer(data.rows, colOrder, labels);
      contentType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      ext = 'xlsx';
    } else {
      buf = await buildPdfGridBuffer({
        title,
        columns: colOrder,
        labels,
        rows: data.rows,
      });
      contentType = 'application/pdf';
      ext = 'pdf';
    }
    const safeName = title.replace(/[^\w\s\-_.]/g, '').slice(0, 120) || 'report';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${ext}"`);
    await appendReportAudit({
      id: randomUUID(),
      tenantId,
      userId,
      action: 'export',
      module: parsed.data.module,
      reportName: title,
      detail: {
        format: parsed.data.format,
        filters: parsed.data.filters,
        rowCount: data.rows.length,
      },
    });
    res.send(buf);
  } catch (e) {
    const mapped = mapReportBuildError(e);
    if (mapped) sendFailure(res, mapped.status, mapped.code, mapped.message);
    else handleRouteError(res, e, { route: 'POST /reports/custom/export', payload: req.body });
  } finally {
    client.release();
  }
});

customReportsRouter.post('/reports/custom/save-template', requireFinancialWriteRole, reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const cap = getReportCapability(req.role);
  if (!cap.canCreateTemplates) {
    sendFailure(res, 403, 'FORBIDDEN', 'Creating custom templates is not permitted for this role.');
    return;
  }
  const parsed = saveTemplateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendFailure(res, 400, 'BAD_REQUEST', parsed.error.message);
    return;
  }
  const body = parsed.data;
  if (body.is_public === true && !cap.canPublishPublicTemplates) {
    sendFailure(res, 403, 'FORBIDDEN', 'Publishing shared templates requires administrator access.');
    return;
  }
  try {
    if (body.id) {
      const exists = await templateRepo.getTemplateById(tenantId, body.id);
      if (exists) {
        sendFailure(
          res,
          409,
          'CONFLICT',
          'A template with this id already exists. Use PUT /template/:id to update.'
        );
        return;
      }
    }
    const id = body.id?.trim() || randomUUID();
    if (body.is_default) {
      await templateRepo.clearDefaultFlagForOwnerModule({
        tenantId,
        module: body.module,
        userId,
      });
    }
    await templateRepo.insertTemplate({
      id,
      tenant_id: tenantId,
      name: body.name,
      module: body.module,
      configuration_json: body.configuration_json,
      created_by: userId,
      is_public: body.is_public ?? false,
      is_default: body.is_default ?? false,
    });
    memoryCacheDeletePrefix(`customReport:v1:${tenantId}:`);
    await appendReportAudit({
      id: randomUUID(),
      tenantId,
      userId,
      action: 'template_create',
      module: body.module,
      reportName: body.name,
      templateId: id,
      detail: { is_public: body.is_public, is_default: body.is_default },
    });
    emitCustomReportTemplateEvent(
      tenantId,
      'created',
      { id, data: { id, name: body.name, module: body.module } },
      userId
    );
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /reports/custom/save-template' });
  }
});

customReportsRouter.get('/reports/custom/templates', reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const cap = getReportCapability(req.role);
  const mod =
    typeof req.query.module === 'string' && req.query.module.trim()
      ? req.query.module.trim()
      : undefined;
  try {
    const rows = await templateRepo.listTemplates({
      tenantId,
      userId,
      module: mod,
      isAdminLike: cap.canPublishPublicTemplates,
    });
    sendSuccess(res, rows);
  } catch (e) {
    handleRouteError(res, e);
  }
});

customReportsRouter.get('/reports/custom/template/:id', reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const cap = getReportCapability(req.role);
  const id = req.params.id;
  try {
    const row = await templateRepo.getTemplateById(tenantId, id);
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Template not found');
      return;
    }
    if (
      row.created_by !== userId &&
      !row.is_public &&
      !cap.canPublishPublicTemplates
    ) {
      sendFailure(res, 403, 'FORBIDDEN', 'You do not have access to this template.');
      return;
    }
    sendSuccess(res, row);
  } catch (e) {
    handleRouteError(res, e);
  }
});

customReportsRouter.put('/reports/custom/template/:id', requireFinancialWriteRole, reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const cap = getReportCapability(req.role);
  if (!cap.canCreateTemplates) {
    sendFailure(res, 403, 'FORBIDDEN', 'Updating templates is not permitted for this role.');
    return;
  }
  const id = req.params.id;
  const partial = updateTemplateBodySchema.safeParse(req.body ?? {});
  if (!partial.success) {
    sendFailure(res, 400, 'BAD_REQUEST', partial.error.message);
    return;
  }
  const body = partial.data;
  if (body.is_public === true && !cap.canPublishPublicTemplates) {
    sendFailure(res, 403, 'FORBIDDEN', 'Publishing shared templates requires administrator access.');
    return;
  }
  try {
    const existing = await templateRepo.getTemplateById(tenantId, id);
    if (!existing) {
      sendFailure(res, 404, 'NOT_FOUND', 'Template not found');
      return;
    }
    if (existing.created_by !== userId && !cap.canPublishPublicTemplates) {
      sendFailure(res, 403, 'FORBIDDEN', 'You can only edit your own templates.');
      return;
    }
    if (body.is_default) {
      await templateRepo.clearDefaultFlagForOwnerModule({
        tenantId,
        module: existing.module,
        userId: existing.created_by ?? userId,
      });
    }
    await templateRepo.updateTemplate({
      tenantId,
      id,
      name: body.name,
      configuration_json: body.configuration_json,
      is_public: body.is_public,
      is_default: body.is_default,
    });
    memoryCacheDeletePrefix(`customReport:v1:${tenantId}:`);
    await appendReportAudit({
      id: randomUUID(),
      tenantId,
      userId,
      action: 'template_update',
      module: existing.module,
      reportName: body.name ?? existing.name,
      templateId: id,
      detail: {},
    });
    emitCustomReportTemplateEvent(
      tenantId,
      'updated',
      { id, data: { id, name: body.name ?? existing.name, module: existing.module } },
      userId
    );
    sendSuccess(res, { ok: true });
  } catch (e) {
    handleRouteError(res, e);
  }
});

customReportsRouter.delete('/reports/custom/template/:id', requireFinancialWriteRole, reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const cap = getReportCapability(req.role);
  if (!cap.canCreateTemplates) {
    sendFailure(res, 403, 'FORBIDDEN', 'Deleting templates is not permitted for this role.');
    return;
  }
  const id = req.params.id;
  try {
    const existing = await templateRepo.getTemplateById(tenantId, id);
    if (!existing) {
      sendFailure(res, 404, 'NOT_FOUND', 'Template not found');
      return;
    }
    if (existing.created_by !== userId && !cap.canPublishPublicTemplates) {
      sendFailure(res, 403, 'FORBIDDEN', 'You can only delete your own templates.');
      return;
    }
    await templateRepo.deleteTemplate(tenantId, id);
    memoryCacheDeletePrefix(`customReport:v1:${tenantId}:`);
    await appendReportAudit({
      id: randomUUID(),
      tenantId,
      userId,
      action: 'template_delete',
      module: existing.module,
      reportName: existing.name,
      templateId: id,
      detail: {},
    });
    emitCustomReportTemplateEvent(tenantId, 'deleted', { id, data: { id, name: existing.name } }, userId);
    sendSuccess(res, { ok: true });
  } catch (e) {
    handleRouteError(res, e);
  }
});

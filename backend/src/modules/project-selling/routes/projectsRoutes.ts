import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError, sendVersionConflict } from '../../../utils/apiResponse.js';
import { respondVersionConflict } from '../../../utils/versionConflict.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import { requireResourceQuota } from '../../../middleware/licenseEnforcementMiddleware.js';
import {
  createProject,
  getProjectById,
  listProjects,
  rowToProjectApi,
  softDeleteProject,
  updateProject,
} from '../services/projectsService.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import { dataScopeContextFromRequest } from '../../../auth/tenantRepositoryScope.js';

export const projectsRouter = Router();

projectsRouter.get('/projects', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const rows = await listProjects(client, tenantId, scopeCtx);
      sendSuccess(res, rows.map((r) => rowToProjectApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectsRouter.get('/projects/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const row = await getProjectById(client, tenantId, id, scopeCtx);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Project not found');
        return;
      }
      sendSuccess(res, rowToProjectApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectsRouter.post('/projects', requireResourceQuota('projects'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((client) => createProject(client, tenantId, req.body as Record<string, unknown>));
    const apiRow = rowToProjectApi(row);
    emitEntityEvent(tenantId, 'created', 'project', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, 201);
  } catch (e) {
    const pgCode = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
    if (pgCode === '23505') {
      const detail = e instanceof Error ? e.message : String(e);
      const msg = detail.includes('projects_tenant_name_unique')
        ? 'A project with this name already exists.'
        : 'This project already exists.';
      sendFailure(res, 409, 'DUPLICATE', msg);
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

projectsRouter.put('/projects/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const result = await withTransaction((client) =>
      updateProject(client, tenantId, id, req.body as Record<string, unknown>)
    );
    if (result.conflict) {
      await respondVersionConflict(res, async () => {
        const pool = getPool();
        const c = await pool.connect();
        try {
          return (await getProjectById(c, tenantId, id))?.version;
        } finally {
          c.release();
        }
      });
      return;
    }
    if (!result.row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Project not found');
      return;
    }
    const apiRow = rowToProjectApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'project', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

projectsRouter.delete('/projects/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  const versionRaw = req.query.version;
  const expectedVersion =
    typeof versionRaw === 'string' && versionRaw !== '' ? Number(versionRaw) : undefined;

  try {
    const result = await withTransaction((client) =>
      softDeleteProject(client, tenantId, id, Number.isFinite(expectedVersion) ? expectedVersion : undefined)
    );
    if (result.hasUnits) {
      sendFailure(res, 400, 'HAS_DEPENDENCIES', 'Cannot delete project while it has units. Remove or reassign units first.');
      return;
    }
    if (result.conflict) {
      await respondVersionConflict(res, async () => {
        const pool = getPool();
        const c = await pool.connect();
        try {
          return (await getProjectById(c, tenantId, id))?.version;
        } finally {
          c.release();
        }
      });
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Project not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'project', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});

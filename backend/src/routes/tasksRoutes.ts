import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool } from '../db/pool.js';
import type { PersonalTaskRow } from '../services/personalTasksService.js';
import {
  createPersonalTask,
  deletePersonalTask,
  getPersonalTaskById,
  listPersonalTasksCalendarMonth,
  listPersonalTasksForUser,
  listUpcomingPersonalTasks,
  rowToPersonalTaskApi,
  updatePersonalTask,
} from '../services/personalTasksService.js';

export const tasksRouter = Router();

function mapCalendar(grouped: Record<string, PersonalTaskRow[]>): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const [date, rows] of Object.entries(grouped)) {
    out[date] = rows.map((r) => rowToPersonalTaskApi(r));
  }
  return out;
}

tasksRouter.get('/tasks/calendar', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const monthRaw = req.query.month;
  const month = typeof monthRaw === 'string' ? monthRaw : '';
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const grouped = await listPersonalTasksCalendarMonth(client, tenantId, userId, month);
      sendSuccess(res, mapCalendar(grouped));
    } finally {
      client.release();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Invalid month')) {
      sendFailure(res, 400, 'VALIDATION_ERROR', msg);
      return;
    }
    handleRouteError(res, e);
  }
});

tasksRouter.get('/tasks/upcoming', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const daysRaw = req.query.days;
  const days =
    typeof daysRaw === 'string' && daysRaw !== '' ? parseInt(daysRaw, 10) : 7;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listUpcomingPersonalTasks(client, tenantId, userId, Number.isFinite(days) ? days : 7);
      sendSuccess(res, rows.map((r) => rowToPersonalTaskApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

tasksRouter.get('/tasks', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listPersonalTasksForUser(client, tenantId, userId);
      sendSuccess(res, rows.map((r) => rowToPersonalTaskApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

tasksRouter.get('/tasks/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getPersonalTaskById(client, tenantId, userId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      sendSuccess(res, rowToPersonalTaskApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

tasksRouter.post('/tasks', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await createPersonalTask(client, tenantId, userId, (req.body || {}) as Record<string, unknown>);
      sendSuccess(res, rowToPersonalTaskApi(row), 201);
    } finally {
      client.release();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

tasksRouter.put('/tasks/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await updatePersonalTask(client, tenantId, userId, id, (req.body || {}) as Record<string, unknown>);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      sendSuccess(res, rowToPersonalTaskApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

tasksRouter.delete('/tasks/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const ok = await deletePersonalTask(client, tenantId, userId, id);
      if (!ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      sendSuccess(res, { ok: true });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

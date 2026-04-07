import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { requireOrgUserAdmin } from '../middleware/authMiddleware.js';
import { getPool } from '../db/pool.js';
import { emitEntityEvent } from '../core/realtime.js';

export const usersRouter = Router();

const optionalEmail = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? undefined : v),
  z.string().email().optional()
);

const createUserSchema = z.object({
  username: z.string().min(1),
  name: z.string().min(1),
  email: optionalEmail,
  password: z.string().min(1),
  role: z.string().min(1),
});

const updateUserSchema = z.object({
  username: z.string().min(1),
  name: z.string().min(1),
  email: optionalEmail,
  role: z.string().min(1),
  password: z.string().optional(),
});

function rowToApi(row: { id: string; username: string; name: string; role: string; email: string | null; is_active: boolean }) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    email: row.email ?? undefined,
    is_active: row.is_active,
  };
}

usersRouter.get('/users', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const r = await pool.query<{ id: string; username: string; name: string; role: string; email: string | null; is_active: boolean }>(
      `SELECT id, username, name, role, email, is_active
       FROM users
       WHERE tenant_id = $1
         AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY LOWER(username)`,
      [tenantId]
    );
    sendSuccess(res, r.rows.map(rowToApi));
  } catch (e) {
    handleRouteError(res, e);
  }
});

usersRouter.post('/users', requireOrgUserAdmin, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid body');
    return;
  }
  const { username, name, email, password, role } = parsed.data;
  const id = `user_${randomUUID().replace(/-/g, '')}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const emailVal = email && email.length > 0 ? email : null;

  try {
    const pool = getPool();
    const r = await pool.query<{ id: string; username: string; name: string; role: string; email: string | null; is_active: boolean }>(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id, username, name, role, email, is_active`,
      [id, tenantId, username.trim(), name.trim(), role, passwordHash, emailVal]
    );
    const created = rowToApi(r.rows[0]);
    emitEntityEvent(tenantId, 'created', 'user', { data: created, sourceUserId: req.userId });
    sendSuccess(res, created, 201);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      sendFailure(res, 409, 'DUPLICATE', 'Username already exists for this organization');
      return;
    }
    handleRouteError(res, e);
  }
});

usersRouter.put('/users/:id', requireOrgUserAdmin, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  if (!tenantId || !id) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid body');
    return;
  }
  const { username, name, email, role, password } = parsed.data;
  const emailVal = email && email.length > 0 ? email : null;

  try {
    const pool = getPool();
    const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (exists.rows.length === 0) {
      sendFailure(res, 404, 'NOT_FOUND', 'User not found');
      return;
    }

    if (password && password.length > 0) {
      const passwordHash = await bcrypt.hash(password, 10);
      const r = await pool.query<{ id: string; username: string; name: string; role: string; email: string | null; is_active: boolean }>(
        `UPDATE users SET username = $1, name = $2, email = $3, role = $4, password_hash = $5, updated_at = NOW()
         WHERE id = $6 AND tenant_id = $7
         RETURNING id, username, name, role, email, is_active`,
        [username.trim(), name.trim(), emailVal, role, passwordHash, id, tenantId]
      );
      const updated = rowToApi(r.rows[0]);
      emitEntityEvent(tenantId, 'updated', 'user', { data: updated, sourceUserId: req.userId });
      sendSuccess(res, updated);
    } else {
      const r = await pool.query<{ id: string; username: string; name: string; role: string; email: string | null; is_active: boolean }>(
        `UPDATE users SET username = $1, name = $2, email = $3, role = $4, updated_at = NOW()
         WHERE id = $5 AND tenant_id = $6
         RETURNING id, username, name, role, email, is_active`,
        [username.trim(), name.trim(), emailVal, role, id, tenantId]
      );
      const updated = rowToApi(r.rows[0]);
      emitEntityEvent(tenantId, 'updated', 'user', { data: updated, sourceUserId: req.userId });
      sendSuccess(res, updated);
    }
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      sendFailure(res, 409, 'DUPLICATE', 'Username already exists for this organization');
      return;
    }
    handleRouteError(res, e);
  }
});

usersRouter.delete('/users/:id', requireOrgUserAdmin, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  if (!tenantId || !id) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  if (id === req.userId) {
    sendFailure(res, 400, 'INVALID', 'You cannot delete your own account while logged in');
    return;
  }
  try {
    const pool = getPool();
    const r = await pool.query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenantId]);
    if (r.rows.length === 0) {
      sendFailure(res, 404, 'NOT_FOUND', 'User not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'user', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});

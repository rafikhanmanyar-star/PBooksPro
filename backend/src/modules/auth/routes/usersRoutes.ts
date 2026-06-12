import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import { appendAuditEvent } from '../../../services/enterpriseAuditService.js';
import { validatePassword } from '../../../utils/passwordPolicy.js';
import { requireResourceQuota } from '../../../middleware/licenseEnforcementMiddleware.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import { ensureUserTenantMembership } from '../../../services/auth/userTenantService.js';
import {
  assertUserIdentityAvailable,
  identityConflictApiDetails,
  normalizeUserEmail,
  UserIdentityConflictError,
} from '../../../services/auth/userIdentityService.js';

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

/** Current user only: profile preferences (display timezone, interface mode). */
const patchMeSchema = z.object({
  displayTimezone: z.union([z.string().max(120), z.null()]).optional(),
  interfaceMode: z.enum(['auto', 'full_erp', 'executive_mobile']).optional(),
}).refine((v) => v.displayTimezone !== undefined || v.interfaceMode !== undefined, {
  message: 'At least one of displayTimezone or interfaceMode is required',
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

usersRouter.patch('/users/me', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = patchMeSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.errors.map((e) => e.message).join('; '));
    return;
  }
  const { displayTimezone, interfaceMode } = parsed.data;
  try {
    const pool = getPool();
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 0;
    if (displayTimezone !== undefined) {
      idx += 1;
      sets.push(`display_timezone = $${idx}`);
      params.push(displayTimezone);
    }
    if (interfaceMode !== undefined) {
      idx += 1;
      sets.push(`interface_mode = $${idx}`);
      params.push(interfaceMode);
    }
    idx += 1;
    params.push(userId);
    idx += 1;
    params.push(tenantId);
    const r = await pool.query<{ display_timezone: string | null; interface_mode: string }>(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${idx - 1} AND tenant_id = $${idx}
       RETURNING display_timezone, interface_mode`,
      params
    );
    if (r.rows.length === 0) {
      sendFailure(res, 404, 'NOT_FOUND', 'User not found');
      return;
    }
    sendSuccess(res, {
      displayTimezone: r.rows[0].display_timezone ?? null,
      interfaceMode: r.rows[0].interface_mode,
    });
  } catch (e) {
    handleRouteError(res, e);
  }
});

usersRouter.get('/users', requirePermission('users.read'), async (req: AuthedRequest, res) => {
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

usersRouter.post('/users', requirePermission('users.manage'), requireResourceQuota('users'), async (req: AuthedRequest, res) => {
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
  const passwordError = validatePassword(password);
  if (passwordError) {
    sendFailure(res, 400, 'VALIDATION_ERROR', passwordError);
    return;
  }
  const id = `user_${randomUUID().replace(/-/g, '')}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const emailVal = normalizeUserEmail(email);

  try {
    const created = await withTransaction(async (client) => {
      await assertUserIdentityAvailable(client, {
        email: emailVal,
        username: username.trim(),
      });
      const r = await client.query<{ id: string; username: string; name: string; role: string; email: string | null; is_active: boolean }>(
        `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         RETURNING id, username, name, role, email, is_active`,
        [id, tenantId, username.trim(), name.trim(), role, passwordHash, emailVal]
      );
      await ensureUserTenantMembership(client, id, tenantId, role);
      const row = rowToApi(r.rows[0]);
      await appendAuditEvent(client, {
        tenantId,
        userId: req.userId ?? null,
        email: emailVal ?? undefined,
        module: 'users',
        action: 'create',
        entityType: 'user',
        entityId: row.id,
        summary: `User created: ${row.username}`,
        newValue: row,
      });
      return row;
    });
    emitEntityEvent(tenantId, 'created', 'user', { data: created, sourceUserId: req.userId });
    sendSuccess(res, created, 201);
  } catch (e: unknown) {
    if (e instanceof UserIdentityConflictError) {
      sendFailure(res, 409, e.code, e.message, identityConflictApiDetails(e.conflicts));
      return;
    }
    const err = e as { code?: string };
    if (err.code === '23505') {
      sendFailure(res, 409, 'DUPLICATE', 'Email or username is already in use');
      return;
    }
    handleRouteError(res, e);
  }
});

usersRouter.put('/users/:id', requirePermission('users.manage'), async (req: AuthedRequest, res) => {
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
  const emailVal = normalizeUserEmail(email);

  try {
    const updated = await withTransaction(async (client) => {
      const prev = await client.query<{ role: string; username: string; email: string | null }>(
        `SELECT role, username, email FROM users WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      if (prev.rows.length === 0) {
        return null;
      }
      const before = prev.rows[0];

      await assertUserIdentityAvailable(client, {
        email: emailVal,
        username: username.trim(),
        excludeUserId: id,
      });

      let row: { id: string; username: string; name: string; role: string; email: string | null; is_active: boolean };
      if (password && password.length > 0) {
        const passwordError = validatePassword(password);
        if (passwordError) throw new Error(passwordError);
        const passwordHash = await bcrypt.hash(password, 10);
        const r = await client.query<{ id: string; username: string; name: string; role: string; email: string | null; is_active: boolean }>(
          `UPDATE users SET username = $1, name = $2, email = $3, role = $4, password_hash = $5, updated_at = NOW()
           WHERE id = $6 AND tenant_id = $7
           RETURNING id, username, name, role, email, is_active`,
          [username.trim(), name.trim(), emailVal, role, passwordHash, id, tenantId]
        );
        row = r.rows[0];
      } else {
        const r = await client.query<{ id: string; username: string; name: string; role: string; email: string | null; is_active: boolean }>(
          `UPDATE users SET username = $1, name = $2, email = $3, role = $4, updated_at = NOW()
           WHERE id = $5 AND tenant_id = $6
           RETURNING id, username, name, role, email, is_active`,
          [username.trim(), name.trim(), emailVal, role, id, tenantId]
        );
        row = r.rows[0];
      }

      const apiRow = rowToApi(row);
      const roleChanged = before.role !== role;
      await appendAuditEvent(client, {
        tenantId,
        userId: req.userId ?? null,
        email: emailVal ?? before.email ?? undefined,
        module: 'users',
        action: roleChanged ? 'role_change' : 'edit',
        entityType: 'user',
        entityId: apiRow.id,
        summary: roleChanged
          ? `Role changed for ${apiRow.username}: ${before.role} → ${role}`
          : `User updated: ${apiRow.username}`,
        oldValue: roleChanged ? { role: before.role } : { username: before.username, role: before.role },
        newValue: roleChanged ? { role } : apiRow,
      });
      return apiRow;
    });

    if (!updated) {
      sendFailure(res, 404, 'NOT_FOUND', 'User not found');
      return;
    }
    emitEntityEvent(tenantId, 'updated', 'user', { data: updated, sourceUserId: req.userId });
    sendSuccess(res, updated);
  } catch (e: unknown) {
    if (e instanceof UserIdentityConflictError) {
      sendFailure(res, 409, e.code, e.message, identityConflictApiDetails(e.conflicts));
      return;
    }
    const err = e as { code?: string; message?: string };
    if (err.message && err.message.includes('Password')) {
      sendFailure(res, 400, 'VALIDATION_ERROR', err.message);
      return;
    }
    if (err.code === '23505') {
      sendFailure(res, 409, 'DUPLICATE', 'Email or username is already in use');
      return;
    }
    handleRouteError(res, e);
  }
});

usersRouter.delete('/users/:id', requirePermission('users.manage'), async (req: AuthedRequest, res) => {
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
    const deletedId = await withTransaction(async (client) => {
      const prev = await client.query<{ username: string; role: string; email: string | null }>(
        `SELECT username, role, email FROM users WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      const r = await client.query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenantId]);
      if (r.rows.length === 0) return null;
      const before = prev.rows[0];
      if (before) {
        await appendAuditEvent(client, {
          tenantId,
          userId: req.userId ?? null,
          module: 'users',
          action: 'delete',
          entityType: 'user',
          entityId: id,
          summary: `User deleted: ${before.username}`,
          oldValue: before,
        });
      }
      return id;
    });
    if (!deletedId) {
      sendFailure(res, 404, 'NOT_FOUND', 'User not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'user', { id: deletedId, sourceUserId: req.userId });
    sendSuccess(res, { id: deletedId });
  } catch (e) {
    handleRouteError(res, e);
  }
});

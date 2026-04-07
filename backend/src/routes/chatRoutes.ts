import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool } from '../db/pool.js';
import { emitInternalChatMessage, type InternalChatMessagePayload } from '../core/realtime.js';

export const chatRouter = Router();

const sendSchema = z.object({
  recipientId: z.string().min(1),
  message: z.string().min(1).max(8000),
});

function rowToPayload(row: {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name: string;
  message: string;
  created_at: Date;
  read_at: Date | null;
}): InternalChatMessagePayload {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    recipientId: row.recipient_id,
    recipientName: row.recipient_name,
    message: row.message,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    readAt: row.read_at ? (row.read_at instanceof Date ? row.read_at.toISOString() : String(row.read_at)) : undefined,
  };
}

chatRouter.post('/tenants/chat/send', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const senderId = req.userId;
  if (!tenantId || !senderId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid body');
    return;
  }
  const { recipientId, message: text } = parsed.data;
  if (recipientId === senderId) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Cannot message yourself');
    return;
  }

  try {
    const pool = getPool();
    const users = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE tenant_id = $1 AND id IN ($2, $3)`,
      [tenantId, senderId, recipientId]
    );
    const byId = new Map(users.rows.map((r) => [r.id, r.name]));
    const senderName = byId.get(senderId);
    const recipientName = byId.get(recipientId);
    if (!senderName || !recipientName) {
      sendFailure(res, 404, 'NOT_FOUND', 'User not found in organization');
      return;
    }

    const id = `chat_${randomUUID().replace(/-/g, '')}`;
    const insert = await pool.query<{
      id: string;
      sender_id: string;
      sender_name: string;
      recipient_id: string;
      recipient_name: string;
      message: string;
      created_at: Date;
      read_at: Date | null;
    }>(
      `INSERT INTO chat_messages (
        id, tenant_id, sender_id, sender_name, recipient_id, recipient_name, message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, sender_id, sender_name, recipient_id, recipient_name, message, created_at, read_at`,
      [id, tenantId, senderId, senderName, recipientId, recipientName, text.trim()]
    );
    const row = insert.rows[0];
    const payload = rowToPayload(row);
    emitInternalChatMessage(tenantId, payload);
    sendSuccess(res, { message: payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[chat/send]', msg);
    sendFailure(res, 500, 'SERVER_ERROR', msg);
  }
});

chatRouter.get('/tenants/chat/messages', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const withUserId = typeof req.query.withUserId === 'string' ? req.query.withUserId.trim() : '';
  if (!withUserId) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'withUserId required');
    return;
  }

  try {
    const pool = getPool();
    const r = await pool.query<{
      id: string;
      sender_id: string;
      sender_name: string;
      recipient_id: string;
      recipient_name: string;
      message: string;
      created_at: Date;
      read_at: Date | null;
    }>(
      `SELECT id, sender_id, sender_name, recipient_id, recipient_name, message, created_at, read_at
       FROM chat_messages
       WHERE tenant_id = $1
         AND (
           (sender_id = $2 AND recipient_id = $3) OR
           (sender_id = $3 AND recipient_id = $2)
         )
       ORDER BY created_at ASC`,
      [tenantId, userId, withUserId]
    );
    const messages = r.rows.map(rowToPayload);

    await pool.query(
      `UPDATE chat_messages
       SET read_at = COALESCE(read_at, NOW())
       WHERE tenant_id = $1 AND sender_id = $2 AND recipient_id = $3 AND read_at IS NULL`,
      [tenantId, withUserId, userId]
    );

    sendSuccess(res, { messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[chat/messages]', msg);
    sendFailure(res, 500, 'SERVER_ERROR', msg);
  }
});

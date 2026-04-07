import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { verifyAccessToken } from '../auth/jwt.js';
import { getPool } from '../db/pool.js';

/** Domain types broadcast to clients (extend as API grows). */
export type RealtimeEntityType =
  | 'invoice'
  | 'agreement'
  | 'contract'
  | 'rental_agreement'
  | 'unit'
  | 'project'
  | 'payment'
  | 'contact'
  | 'user'
  | 'vendor'
  | 'building'
  | 'property'
  | 'settings'
  | 'account'
  | 'transaction'
  | 'category'
  | 'bill'
  | 'recurring_invoice_template'
  | 'project_received_asset'
  | 'sales_return'
  | 'payroll_department'
  | 'payroll_grade'
  | 'payroll_employee'
  | 'payroll_run'
  | 'payslip'
  | 'payroll_settings'
  | 'payroll_project'
  | 'budget'
  | 'personal_category'
  | 'personal_transaction'
  | 'pm_cycle_allocation'
  | 'plan_amenity'
  | 'installment_plan';

export type RealtimeAction = 'created' | 'updated' | 'deleted';

export type RealtimePayload = {
  type: RealtimeEntityType;
  action: RealtimeAction;
  /** Present for creates/updates; for deletes usually `{ id }` or full minimal shape */
  data?: unknown;
  id?: string;
  tenantId: string;
  sourceUserId?: string;
  ts: string;
};

let io: Server | null = null;

export function getIo(): Server | null {
  return io;
}

function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

/**
 * Attach Socket.IO to the same HTTP server as Express.
 * Clients authenticate with JWT (handshake auth.token or Authorization: Bearer).
 */
export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });

  io.use((socket: Socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : undefined);
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.tenantId = payload.tenantId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.data.connectedAt = new Date().toISOString();
    const tid = socket.data.tenantId as string | undefined;
    if (tid) {
      void socket.join(tenantRoom(tid));
    }
  });

  return io;
}

export type ConnectedClientRow = {
  socketId: string;
  userId: string;
  tenantId: string;
  userName: string;
  username?: string;
  connectedAt: string;
};

/**
 * Snapshot of active Socket.IO connections (JWT-authenticated) with display names from PostgreSQL.
 * Used by the API Server Electron tray UI (public GET, LAN-only).
 */
export async function getConnectedClientsSnapshot(): Promise<{
  total: number;
  connections: ConnectedClientRow[];
}> {
  if (!io) {
    return { total: 0, connections: [] };
  }

  const sockets = await io.fetchSockets();
  const byTenant = new Map<string, Set<string>>();
  for (const s of sockets) {
    const userId = s.data.userId as string | undefined;
    const tenantId = s.data.tenantId as string | undefined;
    if (!userId || !tenantId) continue;
    if (!byTenant.has(tenantId)) byTenant.set(tenantId, new Set());
    byTenant.get(tenantId)!.add(userId);
  }

  const nameMap = new Map<string, { name: string; username: string }>();
  try {
    let pool: ReturnType<typeof getPool> | null = null;
    try {
      pool = getPool();
    } catch {
      /* DATABASE_URL unset — still return sockets with userId as display label */
    }
    if (pool) {
      for (const [tenantId, ids] of byTenant) {
        const idArr = [...ids];
        if (idArr.length === 0) continue;
        const r = await pool.query<{ id: string; username: string; name: string }>(
          `SELECT id, username, name FROM users WHERE tenant_id = $1 AND id = ANY($2::text[])`,
          [tenantId, idArr]
        );
        for (const row of r.rows) {
          nameMap.set(`${tenantId}:${row.id}`, { name: row.name, username: row.username });
        }
      }
    }
  } catch (e) {
    console.warn('[realtime] connected-clients user lookup skipped:', e instanceof Error ? e.message : e);
  }

  const connections: ConnectedClientRow[] = [];
  for (const s of sockets) {
    const userId = s.data.userId as string | undefined;
    const tenantId = s.data.tenantId as string | undefined;
    if (!userId || !tenantId) continue;
    const nm = nameMap.get(`${tenantId}:${userId}`);
    connections.push({
      socketId: s.id,
      userId,
      tenantId,
      userName: nm?.name ?? userId,
      username: nm?.username,
      connectedAt: (s.data.connectedAt as string | undefined) ?? '',
    });
  }

  return { total: connections.length, connections };
}

/**
 * Low-level emit to all sockets in a tenant room (after DB commit).
 */
export function emitEvent(
  eventName: 'entity_created' | 'entity_updated' | 'entity_deleted',
  tenantId: string,
  payload: Omit<RealtimePayload, 'tenantId' | 'ts'> & { tenantId?: string; ts?: string }
): void {
  if (!io) return;
  const body: RealtimePayload = {
    ...payload,
    tenantId,
    ts: payload.ts ?? new Date().toISOString(),
  };
  io.to(tenantRoom(tenantId)).emit(eventName, body);
}

export function emitEntityEvent(
  tenantId: string,
  action: RealtimeAction,
  type: RealtimeEntityType,
  opts: { data?: unknown; id?: string; sourceUserId?: string }
): void {
  const eventName =
    action === 'created' ? 'entity_created' : action === 'updated' ? 'entity_updated' : 'entity_deleted';
  const id = opts.id ?? (opts.data && typeof opts.data === 'object' && opts.data !== null && 'id' in opts.data
    ? String((opts.data as { id: unknown }).id)
    : undefined);
  emitEvent(eventName, tenantId, {
    type,
    action,
    data: opts.data ?? (id !== undefined ? { id } : undefined),
    id,
    sourceUserId: opts.sourceUserId,
  });
}

export type LockSocketPayload = {
  recordType: string;
  recordId: string;
  lockedBy?: string;
  lockedByUserId?: string;
  expiresAt?: string;
  tenantId: string;
  ts: string;
};

/** Broadcast record edit lock changes to all sockets in the tenant room. */
export function emitLockEvent(
  tenantId: string,
  event: 'lock_acquired' | 'lock_released',
  payload: {
    recordType: string;
    recordId: string;
    lockedBy?: string;
    lockedByUserId?: string;
    expiresAt?: string;
  }
): void {
  if (!io) return;
  const body: LockSocketPayload = {
    ...payload,
    tenantId,
    ts: new Date().toISOString(),
  };
  io.to(tenantRoom(tenantId)).emit(event, body);
}

/** Internal chat (ChatModal): same payload shape as the web client expects. */
export type InternalChatMessagePayload = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  message: string;
  createdAt: string;
  readAt?: string;
};

export function emitInternalChatMessage(tenantId: string, payload: InternalChatMessagePayload): void {
  if (!io) return;
  io.to(tenantRoom(tenantId)).emit('chat:message', payload);
}

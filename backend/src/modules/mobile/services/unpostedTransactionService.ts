import { z } from 'zod';
import type pg from 'pg';
import {
  notifyOnUnpostedTransactionCreated,
  notifyOnUnpostedTransactionStatusChange,
} from '../../notifications/services/unpostedTransactionNotificationService.js';
import { UnpostedTransactionRepository } from '../repositories/UnpostedTransactionRepository.js';
import {
  UNPOSTED_TRANSACTION_TYPES,
  rowToUnpostedTransactionApi,
  type CreateUnpostedTransactionInput,
  type UnpostedTransactionStatus,
} from '../types/index.js';

const createSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().positive(),
  currency: z.string().min(1).max(8).optional(),
  transactionType: z.enum(UNPOSTED_TRANSACTION_TYPES as unknown as [string, ...string[]]),
  description: z.string().max(2000).optional(),
  partyName: z.string().max(500).optional(),
  supplierId: z.string().optional(),
  employeeId: z.string().optional(),
  customerId: z.string().optional(),
  projectId: z.string().optional(),
  propertyId: z.string().optional(),
  status: z.enum(['draft', 'submitted']).optional(),
});

const statusSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'processed', 'rejected']),
  rejectionReason: z.string().max(2000).optional(),
});

export function parseCreateUnpostedTransaction(body: unknown): CreateUnpostedTransactionInput {
  return createSchema.parse(body);
}

export function parseStatusUpdate(body: unknown): { status: UnpostedTransactionStatus; rejectionReason?: string } {
  const parsed = statusSchema.parse(body);
  return {
    status: parsed.status,
    rejectionReason: parsed.rejectionReason,
  };
}

async function userNameMap(
  client: pg.PoolClient,
  tenantId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const r = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2::text[])`,
    [tenantId, unique]
  );
  return new Map(r.rows.map((row) => [row.id, row.name]));
}

export async function listUnpostedTransactions(
  client: pg.PoolClient,
  tenantId: string,
  options: {
    status?: UnpostedTransactionStatus | UnpostedTransactionStatus[];
    createdBy?: string;
    limit?: number;
    offset?: number;
  }
) {
  const repo = new UnpostedTransactionRepository(tenantId, client);
  const rows = await repo.list(options);
  const names = await userNameMap(client, tenantId, rows.map((r) => r.created_by));
  return rows.map((row) => rowToUnpostedTransactionApi(row, names.get(row.created_by)));
}

export async function getUnpostedTransaction(
  client: pg.PoolClient,
  tenantId: string,
  id: string
) {
  const repo = new UnpostedTransactionRepository(tenantId, client);
  const row = await repo.getById(id);
  if (!row) return null;
  const names = await userNameMap(client, tenantId, [row.created_by]);
  return rowToUnpostedTransactionApi(row, names.get(row.created_by));
}

export async function createUnpostedTransaction(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  input: CreateUnpostedTransactionInput
) {
  const repo = new UnpostedTransactionRepository(tenantId, client);
  const row = await repo.create(input, userId);
  const names = await userNameMap(client, tenantId, [userId]);
  const creatorName = names.get(userId) ?? 'Executive';
  await notifyOnUnpostedTransactionCreated(client, tenantId, row, creatorName);
  return rowToUnpostedTransactionApi(row, creatorName);
}

export async function updateUnpostedTransactionStatus(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorId: string,
  status: UnpostedTransactionStatus,
  rejectionReason?: string
) {
  const repo = new UnpostedTransactionRepository(tenantId, client);
  const existing = await repo.getById(id);
  const row = await repo.updateStatus(id, status, actorId, rejectionReason);
  if (!row) return null;
  await notifyOnUnpostedTransactionStatusChange(
    client,
    tenantId,
    row,
    existing?.status ?? null,
    actorId
  );
  const names = await userNameMap(client, tenantId, [row.created_by]);
  return rowToUnpostedTransactionApi(row, names.get(row.created_by));
}

export async function getUnpostedTransactionCounts(client: pg.PoolClient, tenantId: string) {
  const repo = new UnpostedTransactionRepository(tenantId, client);
  return repo.countByStatus();
}

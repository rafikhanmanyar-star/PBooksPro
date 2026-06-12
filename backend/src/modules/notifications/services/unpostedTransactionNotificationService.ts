import type pg from 'pg';
import type { UnpostedTransactionRow, UnpostedTransactionStatus } from '../../mobile/types/index.js';
import {
  createUserNotification,
  createUserNotifications,
  listFinanceReviewRecipientIds,
} from './userNotificationService.js';

const TYPE_LABELS: Record<string, string> = {
  supplier_payment: 'Supplier payment',
  employee_payment: 'Worker wages',
  material_purchase: 'Material purchase',
  customer_collection: 'Customer collection',
  fuel_expense: 'Fuel expense',
  site_expense: 'Site expense',
  travel_expense: 'Travel expense',
  office_expense: 'Office expense',
  other: 'Other expense',
};

function typeLabel(transactionType: string): string {
  return TYPE_LABELS[transactionType] ?? transactionType;
}

function amountLabel(amount: number | string, currency: string | null): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  const cur = currency || 'PKR';
  return `${cur} ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
}

async function userName(client: pg.PoolClient, tenantId: string, userId: string): Promise<string> {
  const r = await client.query<{ name: string }>(
    `SELECT name FROM users WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId]
  );
  return r.rows[0]?.name ?? 'User';
}

export async function notifyOnUnpostedTransactionCreated(
  client: pg.PoolClient,
  tenantId: string,
  row: UnpostedTransactionRow,
  creatorName: string
): Promise<void> {
  if (row.status !== 'submitted') return;

  const recipients = await listFinanceReviewRecipientIds(client, tenantId, row.created_by);
  if (recipients.length === 0) return;

  const label = typeLabel(row.transaction_type);
  const amt = amountLabel(row.amount, row.currency);

  await createUserNotifications(client, tenantId, recipients, {
    category: 'finance',
    title: 'Quick transaction submitted',
    body: `${creatorName} submitted ${label} · ${amt}${row.party_name ? ` · ${row.party_name}` : ''}`,
    severity: 'warning',
    actionType: 'unposted',
    actionId: row.id,
    entityType: 'unposted_transaction',
    entityId: row.id,
  });
}

export async function notifyOnUnpostedTransactionStatusChange(
  client: pg.PoolClient,
  tenantId: string,
  row: UnpostedTransactionRow,
  previousStatus: UnpostedTransactionStatus | null,
  actorId: string
): Promise<void> {
  if (row.status === previousStatus) return;
  if (row.created_by === actorId && row.status === 'submitted') return;

  const label = typeLabel(row.transaction_type);
  const amt = amountLabel(row.amount, row.currency);
  const actor = await userName(client, tenantId, actorId);

  let title: string;
  let body: string;
  let severity: 'info' | 'warning' | 'urgent' = 'info';

  switch (row.status) {
    case 'under_review':
      title = 'Transaction under review';
      body = `${actor} started reviewing your ${label} (${amt})`;
      severity = 'info';
      break;
    case 'processed':
      title = 'Transaction processed';
      body = `${actor} marked your ${label} (${amt}) as processed`;
      severity = 'info';
      break;
    case 'rejected':
      title = 'Transaction rejected';
      body = row.rejection_reason
        ? `${actor} rejected your ${label}: ${row.rejection_reason}`
        : `${actor} rejected your ${label} (${amt})`;
      severity = 'warning';
      break;
    case 'submitted':
      if (previousStatus === 'draft') {
        await notifyOnUnpostedTransactionCreated(client, tenantId, row, await userName(client, tenantId, row.created_by));
      }
      return;
    default:
      return;
  }

  await createUserNotification(client, tenantId, {
    userId: row.created_by,
    category: 'finance',
    title,
    body,
    severity,
    actionType: 'unposted',
    actionId: row.id,
    entityType: 'unposted_transaction',
    entityId: row.id,
  });
}

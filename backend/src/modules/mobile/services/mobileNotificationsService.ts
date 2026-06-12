import type pg from 'pg';
import { listMobileApprovals } from './mobileApprovalsService.js';
import { UnpostedTransactionRepository } from '../repositories/UnpostedTransactionRepository.js';

export type MobileNotificationSeverity = 'info' | 'warning' | 'urgent';

export type MobileNotificationItem = {
  id: string;
  category: 'approval' | 'collections' | 'rental' | 'finance' | 'project';
  title: string;
  body: string;
  severity: MobileNotificationSeverity;
  createdAt: string;
  actionType?: 'approval' | 'pev' | 'installment_plan' | 'unposted';
  actionId?: string;
};

export async function listMobileNotifications(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  role: string | undefined
): Promise<MobileNotificationItem[]> {
  const items: MobileNotificationItem[] = [];
  const now = new Date().toISOString();

  const approvals = await listMobileApprovals(client, tenantId, userId, role);
  for (const a of approvals.filter((x) => x.canApprove)) {
    items.push({
      id: `approval:${a.type}:${a.id}`,
      category: 'approval',
      title: a.title,
      body: a.subtitle ?? `Awaiting your approval`,
      severity: 'warning',
      createdAt: a.requestedAt ?? now,
      actionType: 'approval',
      actionId: `${a.type}:${a.id}`,
    });
  }

  const overdueR = await client.query<{ count: string; total: string }>(
    `SELECT COUNT(*)::text AS count, COALESCE(SUM(i.amount - i.paid_amount), 0)::text AS total
     FROM invoices i
     WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
       AND i.status = 'Overdue'`,
    [tenantId]
  );
  const overdueCount = Number(overdueR.rows[0]?.count ?? 0);
  const overdueTotal = Number(overdueR.rows[0]?.total ?? 0);
  if (overdueCount > 0) {
    items.push({
      id: 'collections:overdue',
      category: 'collections',
      title: 'Overdue receivables',
      body: `${overdueCount} invoice(s) · PKR ${overdueTotal.toLocaleString()}`,
      severity: overdueTotal > 500000 ? 'urgent' : 'warning',
      createdAt: now,
    });
  }

  const expiringR = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM rental_agreements ra
     WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL
       AND ra.end_date IS NOT NULL
       AND ra.end_date <= (CURRENT_DATE + INTERVAL '30 days')
       AND ra.end_date >= CURRENT_DATE`,
    [tenantId]
  );
  const expiring = Number(expiringR.rows[0]?.count ?? 0);
  if (expiring > 0) {
    items.push({
      id: 'rental:expiring',
      category: 'rental',
      title: 'Contracts expiring soon',
      body: `${expiring} rental agreement(s) within 30 days`,
      severity: 'info',
      createdAt: now,
    });
  }

  const unpostedRepo = new UnpostedTransactionRepository(tenantId, client);
  const unpostedCounts = await unpostedRepo.countByStatus();
  const submitted = unpostedCounts.submitted ?? 0;
  if (submitted > 0) {
    items.push({
      id: 'finance:unposted',
      category: 'finance',
      title: 'Field transactions pending',
      body: `${submitted} unposted transaction(s) awaiting finance review`,
      severity: 'info',
      createdAt: now,
      actionType: 'unposted',
    });
  }

  const dueRentR = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(i.amount - i.paid_amount), 0)::text AS total
     FROM invoices i
     WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
       AND i.status IN ('Unpaid', 'Partially Paid', 'Overdue')
       AND i.description ILIKE '%rent%'`,
    [tenantId]
  );
  const dueRent = Number(dueRentR.rows[0]?.total ?? 0);
  if (dueRent > 0) {
    items.push({
      id: 'rental:due',
      category: 'rental',
      title: 'Rent due',
      body: `PKR ${dueRent.toLocaleString()} outstanding on rental invoices`,
      severity: 'warning',
      createdAt: now,
    });
  }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

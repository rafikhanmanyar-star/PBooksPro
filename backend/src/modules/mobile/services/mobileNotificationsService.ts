import type pg from 'pg';
import { listUserNotifications } from '../../notifications/services/userNotificationService.js';
import { listMobileApprovals } from './mobileApprovalsService.js';
import {
  WORKFLOW_ENTITY_LABELS,
  isWorkflowEntityType,
  type WorkflowEntityType,
} from '../../../workflow/workflowTypes.js';

export type MobileNotificationSeverity = 'info' | 'warning' | 'urgent';

export type MobileNotificationCategory =
  | 'approval'
  | 'collections'
  | 'rental'
  | 'finance'
  | 'project';

export type MobileNotificationItem = {
  id: string;
  category: MobileNotificationCategory;
  title: string;
  body: string;
  severity: MobileNotificationSeverity;
  createdAt: string;
  actionType?:
    | 'approval'
    | 'approval_request'
    | 'pev'
    | 'installment_plan'
    | 'unposted'
    | 'contract';
  actionId?: string;
  entityType?: string;
  entityId?: string;
  workflowEntityType?: string;
};

const KNOWN_CATEGORIES = new Set<MobileNotificationCategory>([
  'approval',
  'collections',
  'rental',
  'finance',
  'project',
]);

export function normalizeNotificationCategory(category: string): MobileNotificationCategory {
  if (KNOWN_CATEGORIES.has(category as MobileNotificationCategory)) {
    return category as MobileNotificationCategory;
  }
  if (category === 'workflow' || category === 'contract_retention') {
    return 'approval';
  }
  return 'finance';
}

function workflowEntityLabel(entityType?: string | null): string | undefined {
  if (!entityType || !isWorkflowEntityType(entityType)) return undefined;
  return WORKFLOW_ENTITY_LABELS[entityType as WorkflowEntityType];
}

export async function listMobileNotifications(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  role: string | undefined
): Promise<MobileNotificationItem[]> {
  const items: MobileNotificationItem[] = [];
  const now = new Date().toISOString();

  const persisted = await listUserNotifications(client, tenantId, userId, 50);
  const persistedWorkflowRequestIds = new Set<string>();

  for (const n of persisted) {
    const category = normalizeNotificationCategory(n.category);
    const workflowEntityType =
      n.entityType && isWorkflowEntityType(n.entityType) ? n.entityType : undefined;
    const entityLabel = workflowEntityLabel(n.entityType);

    if (n.actionType === 'approval_request' && n.actionId) {
      persistedWorkflowRequestIds.add(n.actionId);
    }

    items.push({
      id: n.id,
      category,
      title: n.title,
      body: entityLabel ? `${entityLabel} · ${n.body}` : n.body,
      severity: n.severity,
      createdAt: n.createdAt,
      ...(n.actionType
        ? { actionType: n.actionType as MobileNotificationItem['actionType'], actionId: n.actionId }
        : {}),
      ...(n.entityType ? { entityType: n.entityType } : {}),
      ...(n.entityId ? { entityId: n.entityId } : {}),
      ...(workflowEntityType ? { workflowEntityType } : {}),
    });
  }

  const approvals = await listMobileApprovals(client, tenantId, userId, role);
  for (const a of approvals.filter((x) => x.canApprove)) {
    if (a.workflowRequestId && persistedWorkflowRequestIds.has(a.workflowRequestId)) {
      continue;
    }

    const entityLabel = isWorkflowEntityType(a.type)
      ? WORKFLOW_ENTITY_LABELS[a.type]
      : undefined;

    items.push({
      id: `approval:${a.type}:${a.id}`,
      category: 'approval',
      title: a.title,
      body: a.subtitle ?? (entityLabel ? `${entityLabel} awaiting your approval` : 'Awaiting your approval'),
      severity: 'warning',
      createdAt: a.requestedAt ?? now,
      actionType: a.workflowRequestId ? 'approval_request' : 'approval',
      actionId: a.workflowRequestId ?? `${a.type}:${a.id}`,
      ...(a.entityId ? { entityId: a.entityId } : {}),
      ...(isWorkflowEntityType(a.type)
        ? { workflowEntityType: a.type, entityType: a.type }
        : {}),
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

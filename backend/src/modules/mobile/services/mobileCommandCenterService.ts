import type pg from 'pg';
import {
  getMobileConstructionSummary,
  getMobileDashboardSummary,
  getMobileProjectSummary,
  getMobileSalesSummary,
} from './mobileDashboardService.js';
import { listMobileApprovals } from './mobileApprovalsService.js';
import { listMobileNotifications } from './mobileNotificationsService.js';
import { getDashboardActivityJson } from '../../../services/dashboard/dashboardActivityService.js';
import type { MobileMetric } from '../types/index.js';

export type ExecutiveKpiTickerItem = {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'number';
  trend?: number | null;
  trendLabel?: string;
  severity?: 'normal' | 'warning' | 'danger';
};

export type ExecutiveActivityItem = {
  id: string;
  kind: 'contract' | 'vendor_bill' | 'payment' | 'approval' | 'invoice' | 'transaction';
  title: string;
  subtitle?: string;
  amount?: number;
  occurredAt: string;
};

export type ExecutiveCommandCenterResponse = {
  generatedAt: string;
  ticker: ExecutiveKpiTickerItem[];
  financial: {
    cashPosition: MobileMetric;
    receivables: MobileMetric;
    payables: MobileMetric;
    netPosition: MobileMetric;
  };
  projects: {
    activeProjects: number;
    activeProjectsTrend?: number | null;
    onTrack: number;
    delayed: number;
    onTrackPercent: number;
    contractValue: number;
    contractValueTrend?: number | null;
  };
  collections: {
    thisMonth: number;
    thisMonthTrend?: number | null;
    overdue: number;
    overdueTrend?: number | null;
    collectionEfficiency: number;
    efficiencyTrend?: number | null;
    topOverdueAmount: number;
    topOverdueCustomers: number;
  };
  construction: {
    siteExpenses: number;
    vendorPayments: number;
    materialCost: number;
    outstandingBills: number;
  };
  approvalAnalytics: {
    pendingTotal: number;
    pendingActionable: number;
    newSinceYesterday: number;
    byType: Record<string, number>;
  };
  criticalAlerts: number;
  recentActivity: ExecutiveActivityItem[];
};

function findMetric(metrics: MobileMetric[], id: string): MobileMetric {
  const m = metrics.find((x) => x.id === id);
  return m ?? { id, label: id, value: 0, format: 'currency', trend: null };
}

function metricValue(metrics: MobileMetric[], id: string): number {
  return findMetric(metrics, id).value;
}

function metricTrend(metrics: MobileMetric[], id: string): number | null | undefined {
  return findMetric(metrics, id).trend;
}

async function sumTodayFlows(
  client: pg.PoolClient,
  tenantId: string
): Promise<{ collectionsToday: number; paymentsToday: number; collectionsYesterday: number; paymentsYesterday: number }> {
  const r = await client.query<{
    collections_today: string;
    payments_today: string;
    collections_yesterday: string;
    payments_yesterday: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN t.type = 'Income' AND t.date = CURRENT_DATE THEN t.amount ELSE 0 END), 0)::text AS collections_today,
       COALESCE(SUM(CASE WHEN t.type = 'Expense' AND t.date = CURRENT_DATE THEN t.amount ELSE 0 END), 0)::text AS payments_today,
       COALESCE(SUM(CASE WHEN t.type = 'Income' AND t.date = CURRENT_DATE - 1 THEN t.amount ELSE 0 END), 0)::text AS collections_yesterday,
       COALESCE(SUM(CASE WHEN t.type = 'Expense' AND t.date = CURRENT_DATE - 1 THEN t.amount ELSE 0 END), 0)::text AS payments_yesterday
     FROM transactions t
     WHERE t.tenant_id = $1 AND t.deleted_at IS NULL`,
    [tenantId]
  );
  const row = r.rows[0];
  return {
    collectionsToday: Number(row?.collections_today ?? 0),
    paymentsToday: Number(row?.payments_today ?? 0),
    collectionsYesterday: Number(row?.collections_yesterday ?? 0),
    paymentsYesterday: Number(row?.payments_yesterday ?? 0),
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

async function countProjectsAtRisk(client: pg.PoolClient, tenantId: string): Promise<number> {
  const r = await client.query<{ count: string }>(
    `SELECT COUNT(DISTINCT p.id)::text AS count
     FROM projects p
     INNER JOIN bills b ON b.project_id = p.id AND b.tenant_id = p.tenant_id AND b.deleted_at IS NULL
     WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.status = 'Active'
       AND b.status NOT IN ('Paid', 'Cancelled')
       AND b.due_date IS NOT NULL AND b.due_date < CURRENT_DATE`,
    [tenantId]
  );
  return Number(r.rows[0]?.count ?? 0);
}

async function countNewApprovalsSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<number> {
  const [pevR, planR] = await Promise.all([
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM project_expense_vouchers
       WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'submitted'
         AND submitted_at >= $2`,
      [tenantId, since]
    ),
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM installment_plans
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND approval_requested_at >= $2`,
      [tenantId, since]
    ),
  ]);
  return Number(pevR.rows[0]?.count ?? 0) + Number(planR.rows[0]?.count ?? 0);
}

async function buildRecentActivity(
  client: pg.PoolClient,
  tenantId: string,
  limit: number
): Promise<ExecutiveActivityItem[]> {
  const items: ExecutiveActivityItem[] = [];

  const [agreementsR, billsR, activityFeed] = await Promise.all([
    client.query<{
      id: string;
      agreement_number: string | null;
      project_id: string;
      updated_at: Date;
      status: string;
    }>(
      `SELECT pa.id, pa.agreement_number, pa.project_id, pa.updated_at, pa.status
       FROM project_agreements pa
       WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL
         AND pa.status IN ('Approved', 'Active', 'Signed')
       ORDER BY pa.updated_at DESC
       LIMIT 3`,
      [tenantId]
    ),
    client.query<{
      id: string;
      bill_number: string | null;
      amount: string;
      created_at: Date;
      contractor_contact_id: string;
    }>(
      `SELECT cb.id, cb.bill_number, cb.amount::text, cb.created_at, cb.contractor_contact_id
       FROM contractor_bills cb
       WHERE cb.tenant_id = $1 AND cb.deleted_at IS NULL
       ORDER BY cb.created_at DESC
       LIMIT 3`,
      [tenantId]
    ),
    getDashboardActivityJson(client, tenantId, limit),
  ]);

  const projectIds = [...new Set(agreementsR.rows.map((r) => r.project_id).filter(Boolean))];
  const contactIds = billsR.rows.map((r) => r.contractor_contact_id).filter(Boolean);
  const [projectNames, contactNames] = await Promise.all([
    projectIds.length
      ? client.query<{ id: string; name: string }>(
          `SELECT id, name FROM projects WHERE tenant_id = $1 AND id = ANY($2::text[])`,
          [tenantId, projectIds]
        )
      : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
    contactIds.length
      ? client.query<{ id: string; name: string }>(
          `SELECT id, name FROM contacts WHERE tenant_id = $1 AND id = ANY($2::text[])`,
          [tenantId, contactIds]
        )
      : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
  ]);
  const projectMap = new Map(projectNames.rows.map((r) => [r.id, r.name]));
  const contactMap = new Map(contactNames.rows.map((r) => [r.id, r.name]));

  for (const row of agreementsR.rows) {
    items.push({
      id: `agreement:${row.id}`,
      kind: 'contract',
      title: `Contract #${row.agreement_number ?? row.id} approved`,
      subtitle: projectMap.get(row.project_id) ? `Project: ${projectMap.get(row.project_id)}` : undefined,
      occurredAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    });
  }

  for (const row of billsR.rows) {
    items.push({
      id: `bill:${row.id}`,
      kind: 'vendor_bill',
      title: `Vendor Bill #${row.bill_number ?? row.id} submitted`,
      subtitle: contactMap.get(row.contractor_contact_id)
        ? `Vendor: ${contactMap.get(row.contractor_contact_id)}`
        : undefined,
      amount: Number(row.amount),
      occurredAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    });
  }

  for (const row of activityFeed.items) {
    items.push({
      id: `tx:${row.id}`,
      kind: row.type === 'Invoice' ? 'invoice' : 'payment',
      title:
        row.type === 'Expense'
          ? `Payment of PKR ${row.amount.toLocaleString()} recorded`
          : row.title,
      subtitle: row.type === 'Expense' ? row.title : undefined,
      amount: row.amount,
      occurredAt: `${row.date}T12:00:00.000Z`,
    });
  }

  return items
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}

export async function getMobileCommandCenterSnapshot(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  role: string | undefined
): Promise<ExecutiveCommandCenterResponse> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const [
    dashboard,
    projects,
    sales,
    construction,
    approvals,
    notifications,
    todayFlows,
    projectsAtRisk,
    newApprovals,
    recentActivity,
  ] = await Promise.all([
    getMobileDashboardSummary(client, tenantId),
    getMobileProjectSummary(client, tenantId),
    getMobileSalesSummary(client, tenantId),
    getMobileConstructionSummary(client, tenantId),
    listMobileApprovals(client, tenantId, userId, role),
    listMobileNotifications(client, tenantId, userId, role),
    sumTodayFlows(client, tenantId),
    countProjectsAtRisk(client, tenantId),
    countNewApprovalsSince(client, tenantId, yesterday),
    buildRecentActivity(client, tenantId, 8),
  ]);

  const dm = dashboard.metrics;
  const pm = projects.metrics;
  const sm = sales.metrics;
  const cm = construction.metrics;

  const cash = findMetric(dm, 'totalCashBalance');
  const ar = findMetric(dm, 'accountsReceivable');
  const ap = findMetric(dm, 'accountsPayable');
  const netValue = cash.value + ar.value - ap.value;
  const netTrend =
    cash.trend != null && ar.trend != null && ap.trend != null
      ? (cash.trend + ar.trend - ap.trend) / 3
      : null;

  const pendingActionable = approvals.filter((a) => a.canApprove).length;
  const criticalAlerts = notifications.filter((n) => n.severity === 'urgent').length;

  const byType: Record<string, number> = {};
  for (const a of approvals) {
    byType[a.type] = (byType[a.type] ?? 0) + 1;
  }

  const activeProjects = metricValue(pm, 'activeProjects');
  const pendingBills = metricValue(pm, 'pendingBills');
  const onTrack = Math.max(0, activeProjects - Math.min(pendingBills, activeProjects));
  const delayed = Math.min(pendingBills, activeProjects);
  const onTrackPercent = activeProjects > 0 ? Math.round((onTrack / activeProjects) * 100) : 0;

  const collectionsTrend = pctChange(todayFlows.collectionsToday, todayFlows.collectionsYesterday);
  const paymentsTrend = pctChange(todayFlows.paymentsToday, todayFlows.paymentsYesterday);

  return {
    generatedAt: new Date().toISOString(),
    ticker: [
      {
        id: 'collectionsToday',
        label: 'Collections Today',
        value: todayFlows.collectionsToday,
        format: 'currency',
        trend: collectionsTrend,
        trendLabel: 'vs yesterday',
      },
      {
        id: 'paymentsToday',
        label: 'Payments Today',
        value: todayFlows.paymentsToday,
        format: 'currency',
        trend: paymentsTrend,
        trendLabel: 'vs yesterday',
      },
      {
        id: 'pendingApprovals',
        label: 'Pending Approvals',
        value: pendingActionable,
        format: 'number',
        trend: newApprovals > 0 ? newApprovals : null,
        trendLabel: 'new',
        severity: pendingActionable > 10 ? 'warning' : 'normal',
      },
      {
        id: 'projectsAtRisk',
        label: 'Projects At Risk',
        value: projectsAtRisk,
        format: 'number',
        severity: projectsAtRisk > 0 ? 'danger' : 'normal',
        trendLabel: 'high risk',
      },
      {
        id: 'criticalAlerts',
        label: 'Critical Alerts',
        value: criticalAlerts,
        format: 'number',
        severity: criticalAlerts > 0 ? 'danger' : 'normal',
        trendLabel: criticalAlerts > 0 ? 'Requires action' : undefined,
      },
    ],
    financial: {
      cashPosition: cash,
      receivables: ar,
      payables: ap,
      netPosition: {
        id: 'netPosition',
        label: 'Net Position',
        value: netValue,
        format: 'currency',
        trend: netTrend,
      },
    },
    projects: {
      activeProjects,
      activeProjectsTrend: metricTrend(pm, 'activeProjects'),
      onTrack,
      delayed,
      onTrackPercent,
      contractValue: metricValue(pm, 'pendingBillAmount') + metricValue(pm, 'budgetUtilization') * 1000,
      contractValueTrend: metricTrend(pm, 'pendingBillAmount'),
    },
    collections: {
      thisMonth: metricValue(sm, 'collectedInPeriod'),
      thisMonthTrend: metricTrend(sm, 'collectedInPeriod'),
      overdue: metricValue(sm, 'overdueAmount'),
      overdueTrend: metricTrend(sm, 'overdueAmount'),
      collectionEfficiency: metricValue(sm, 'collectionRate'),
      efficiencyTrend: metricTrend(sm, 'collectionRate'),
      topOverdueAmount: metricValue(sm, 'overdueAmount'),
      topOverdueCustomers: Math.min(5, Math.ceil(metricValue(sm, 'overdueAmount') / 250000)),
    },
    construction: {
      siteExpenses: metricValue(cm, 'totalExpenses'),
      vendorPayments: metricValue(cm, 'billsPaid'),
      materialCost: metricValue(cm, 'billsIssued'),
      outstandingBills: metricValue(cm, 'unpaidBills'),
    },
    approvalAnalytics: {
      pendingTotal: approvals.length,
      pendingActionable,
      newSinceYesterday: newApprovals,
      byType,
    },
    criticalAlerts,
    recentActivity,
  };
}

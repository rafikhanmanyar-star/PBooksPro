/**
 * Rental-specific API routes: AR Tree View (aggregated receivables, lazy children).
 * All queries are scoped by req.tenantId (organization).
 */

import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

const RENTAL_INVOICE_TYPES = ['Rental', 'Security Deposit'];
const INVOICE_BASE =
  " FROM invoices i " +
  " WHERE i.tenant_id = $1 AND i.deleted_at IS NULL " +
  " AND i.invoice_type = ANY($2::text[]) " +
  " AND i.status <> 'Paid' ";

const OUTSTANDING = ' (i.amount - COALESCE(i.paid_amount, 0)) ';
const OVERDUE_CASE =
  ` SUM(CASE WHEN i.due_date < CURRENT_DATE THEN ${OUTSTANDING} ELSE 0 END) `;

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToNode(row: any, type: string): any {
  return {
    id: row.id,
    type,
    name: row.name || 'Unknown',
    outstanding: toNum(row.outstanding),
    overdue: toNum(row.overdue),
    invoiceCount: row.invoice_count != null ? Number(row.invoice_count) : undefined,
    lastPaymentDate: row.last_payment_date || null,
    hasChildren: (row.has_children ?? row.invoice_count) > 0,
    agingBuckets: row.aging_current != null
      ? {
          current: toNum(row.aging_current),
          days30: toNum(row.aging_days30),
          days60: toNum(row.aging_days60),
          days90: toNum(row.aging_days90),
          days90plus: toNum(row.aging_days90plus),
        }
      : undefined,
  };
}

/** Apply aging filter to WHERE (adds conditions and param index) */
function agingCondition(aging: string, paramIndex: number): { clause: string; nextIndex: number } {
  if (!aging || aging === 'all') return { clause: '', nextIndex: paramIndex };
  if (aging === 'overdue') {
    return { clause: ` AND i.due_date < CURRENT_DATE `, nextIndex: paramIndex };
  }
  // PostgreSQL: CURRENT_DATE - i.due_date gives integer days
  switch (aging) {
    case '0-30':
      return { clause: ` AND i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) <= 30 `, nextIndex: paramIndex };
    case '31-60':
      return { clause: ` AND i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) > 30 AND (CURRENT_DATE - i.due_date) <= 60 `, nextIndex: paramIndex };
    case '61-90':
      return { clause: ` AND i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) > 60 AND (CURRENT_DATE - i.due_date) <= 90 `, nextIndex: paramIndex };
    case '90+':
      return { clause: ` AND i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) > 90 `, nextIndex: paramIndex };
    default:
      return { clause: '', nextIndex: paramIndex };
  }
}

/**
 * GET /api/rental/ar-summary
 * Query: groupBy=tenant|property|owner|unit, aging=all|overdue|0-30|31-60|61-90|90+, search=string
 */
router.get('/ar-summary', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const groupBy = (req.query.groupBy as string) || 'tenant';
    const aging = (req.query.aging as string) || 'all';
    const search = (req.query.search as string) || '';

    if (!['tenant', 'property', 'owner', 'unit'].includes(groupBy)) {
      return res.status(400).json({ error: 'Invalid groupBy' });
    }

    const params: any[] = [req.tenantId, RENTAL_INVOICE_TYPES];
    let paramIndex = 3;
    const baseWhere = INVOICE_BASE;
    const { clause: agingClause, nextIndex } = agingCondition(aging, paramIndex);
    paramIndex = nextIndex;
    let searchClause = '';
    if (search.trim()) {
      const searchParam = `$${paramIndex}`;
      if (groupBy === 'tenant') searchClause = ` AND c.name ILIKE ${searchParam} `;
      else if (groupBy === 'property') searchClause = ` AND p.name ILIKE ${searchParam} `;
      else if (groupBy === 'owner') searchClause = ` AND o.name ILIKE ${searchParam} `;
      else searchClause = ` AND u.name ILIKE ${searchParam} `;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const selectAgg =
      ` COUNT(i.id) AS invoice_count, ` +
      ` SUM(${OUTSTANDING}) AS outstanding, ` +
      OVERDUE_CASE + ` AS overdue, ` +
      ` MAX(pay.last_date) AS last_payment_date, ` +
      ` SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN ${OUTSTANDING} ELSE 0 END) AS aging_current, ` +
      ` SUM(CASE WHEN i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) <= 30 THEN ${OUTSTANDING} ELSE 0 END) AS aging_days30, ` +
      ` SUM(CASE WHEN i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) > 30 AND (CURRENT_DATE - i.due_date) <= 60 THEN ${OUTSTANDING} ELSE 0 END) AS aging_days60, ` +
      ` SUM(CASE WHEN i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) > 60 AND (CURRENT_DATE - i.due_date) <= 90 THEN ${OUTSTANDING} ELSE 0 END) AS aging_days90, ` +
      ` SUM(CASE WHEN i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) > 90 THEN ${OUTSTANDING} ELSE 0 END) AS aging_days90plus `;

    const paySubquery =
      ` LEFT JOIN LATERAL (SELECT invoice_id, MAX(date) AS last_date FROM transactions WHERE type = 'Income' AND invoice_id IS NOT NULL AND tenant_id = $1 GROUP BY invoice_id) pay ON pay.invoice_id = i.id `;

    let query: string;
    let groupByCol: string;
    let nameCol: string;

    if (groupBy === 'tenant') {
      groupByCol = 'i.contact_id';
      nameCol = 'c.name';
      query =
        `SELECT ${groupByCol} AS id, ${nameCol} AS name, true AS has_children, ` +
        selectAgg +
        baseWhere.replace(' FROM invoices i ', ' FROM invoices i JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id ' + paySubquery) +
        agingClause + searchClause +
        ` GROUP BY i.contact_id, c.name ORDER BY outstanding DESC NULLS LAST `;
    } else if (groupBy === 'property') {
      groupByCol = 'i.property_id';
      nameCol = 'p.name';
      query =
        `SELECT ${groupByCol} AS id, ${nameCol} AS name, true AS has_children, ` +
        selectAgg +
        baseWhere.replace(' FROM invoices i ', ' FROM invoices i JOIN properties p ON p.id = i.property_id AND p.tenant_id = i.tenant_id ' + paySubquery) +
        ` AND i.property_id IS NOT NULL ` + agingClause + searchClause +
        ` GROUP BY i.property_id, p.name ORDER BY outstanding DESC NULLS LAST `;
    } else if (groupBy === 'owner') {
      groupByCol = 'p.owner_id';
      nameCol = 'o.name';
      query =
        `SELECT ${groupByCol} AS id, ${nameCol} AS name, true AS has_children, ` +
        selectAgg +
        baseWhere.replace(' FROM invoices i ', ' FROM invoices i JOIN properties p ON p.id = i.property_id AND p.tenant_id = i.tenant_id JOIN contacts o ON o.id = p.owner_id AND o.tenant_id = p.tenant_id ' + paySubquery) +
        ` AND i.property_id IS NOT NULL AND p.owner_id IS NOT NULL ` + agingClause + searchClause +
        ` GROUP BY p.owner_id, o.name ORDER BY outstanding DESC NULLS LAST `;
    } else {
      // unit
      groupByCol = 'i.unit_id';
      nameCol = 'u.name';
      query =
        `SELECT ${groupByCol} AS id, ${nameCol} AS name, true AS has_children, ` +
        selectAgg +
        baseWhere.replace(' FROM invoices i ', ' FROM invoices i JOIN units u ON u.id = i.unit_id AND u.tenant_id = i.tenant_id ' + paySubquery) +
        ` AND i.unit_id IS NOT NULL ` + agingClause + searchClause +
        ` GROUP BY i.unit_id, u.name ORDER BY outstanding DESC NULLS LAST `;
    }

    const rows = await db.query(query, params);
    const nodes = rows.map((r: any) => rowToNode(r, groupBy));
    res.json({ nodes });
  } catch (error: any) {
    console.error('AR summary error:', error);
    res.status(500).json({ error: 'Failed to fetch AR summary', message: error?.message });
  }
});

/**
 * GET /api/rental/ar-children
 * Query: parentType=tenant|property|owner|unit, parentId=UUID, viewBy=tenant|property|owner|unit
 * Returns only immediate children (no full invoice list at first).
 */
router.get('/ar-children', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const parentType = (req.query.parentType as string) || '';
    const parentId = (req.query.parentId as string) || '';
    const viewBy = (req.query.viewBy as string) || 'tenant';

    if (!parentId || !['tenant', 'property', 'owner', 'unit'].includes(parentType)) {
      return res.status(400).json({ error: 'Invalid parentType or parentId' });
    }

    const params: any[] = [req.tenantId, RENTAL_INVOICE_TYPES, parentId];
    const baseWhere =
      INVOICE_BASE +
      (parentType === 'tenant' ? ' AND i.contact_id = $3 ' :
        parentType === 'property' ? ' AND i.property_id = $3 ' :
          parentType === 'owner' ? ' AND p.owner_id = $3 ' : ' AND i.unit_id = $3 ');

    const paySub =
      ` LEFT JOIN LATERAL (SELECT invoice_id, MAX(date) AS last_date FROM transactions WHERE type = 'Income' AND invoice_id IS NOT NULL AND tenant_id = $1 GROUP BY invoice_id) pay ON pay.invoice_id = i.id `;

    const outExpr = ` (i.amount - COALESCE(i.paid_amount, 0)) `;
    const overdueExpr = ` SUM(CASE WHEN i.due_date < CURRENT_DATE THEN ${outExpr} ELSE 0 END) `;
    const agg = ` COUNT(i.id) AS invoice_count, SUM(${outExpr}) AS outstanding, ${overdueExpr} AS overdue, MAX(pay.last_date) AS last_payment_date `;

    let query: string;
    let childType: string;

    // Hierarchy: viewBy=tenant -> Tenant -> Unit -> Invoice
    // viewBy=property -> Property -> Unit -> Tenant -> Invoice
    // viewBy=owner -> Owner -> Property -> Unit -> Tenant -> Invoice
    // viewBy=unit -> Unit -> Tenant -> Invoice

    if (viewBy === 'tenant') {
      if (parentType === 'tenant') {
        // Children of tenant: units (with invoices for this contact)
        childType = 'unit';
        query =
          `SELECT i.unit_id AS id, u.name AS name, true AS has_children, ` + agg +
          ` FROM invoices i JOIN units u ON u.id = i.unit_id AND u.tenant_id = i.tenant_id ` + paySub +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.contact_id = $3 AND i.unit_id IS NOT NULL ` +
          ` GROUP BY i.unit_id, u.name ORDER BY outstanding DESC NULLS LAST `;
      } else if (parentType === 'unit') {
        // Children of unit (under tenant view): invoices for this unit+contact
        childType = 'invoice';
        query =
          `SELECT i.id, i.invoice_number AS name, i.amount, i.paid_amount, i.due_date, i.status, ` +
          ` (i.amount - COALESCE(i.paid_amount, 0)) AS outstanding, ` +
          ` CASE WHEN i.due_date < CURRENT_DATE THEN (i.amount - COALESCE(i.paid_amount, 0)) ELSE 0 END AS overdue, ` +
          ` pay.last_date AS last_payment_date ` +
          ` FROM invoices i LEFT JOIN LATERAL (SELECT invoice_id, MAX(date) AS last_date FROM transactions WHERE type = 'Income' AND invoice_id IS NOT NULL AND tenant_id = $1 GROUP BY invoice_id) pay ON pay.invoice_id = i.id ` +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.unit_id = $3 ` +
          ` ORDER BY i.due_date DESC `;
      } else {
        return res.status(400).json({ error: 'Invalid parent type for viewBy=tenant' });
      }
    } else if (viewBy === 'property') {
      if (parentType === 'property') {
        childType = 'unit';
        query =
          `SELECT i.unit_id AS id, u.name AS name, true AS has_children, ` + agg +
          ` FROM invoices i JOIN units u ON u.id = i.unit_id AND u.tenant_id = i.tenant_id ` + paySub +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.property_id = $3 AND i.unit_id IS NOT NULL ` +
          ` GROUP BY i.unit_id, u.name ORDER BY outstanding DESC NULLS LAST `;
      } else if (parentType === 'unit') {
        childType = 'tenant';
        query =
          `SELECT i.contact_id AS id, c.name AS name, true AS has_children, ` + agg +
          ` FROM invoices i JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id ` + paySub +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.unit_id = $3 ` +
          ` GROUP BY i.contact_id, c.name ORDER BY outstanding DESC NULLS LAST `;
      } else if (parentType === 'tenant') {
        childType = 'invoice';
        query =
          `SELECT i.id, i.invoice_number AS name, i.amount, i.paid_amount, i.due_date, i.status, ` +
          ` (i.amount - COALESCE(i.paid_amount, 0)) AS outstanding, ` +
          ` CASE WHEN i.due_date < CURRENT_DATE THEN (i.amount - COALESCE(i.paid_amount, 0)) ELSE 0 END AS overdue, ` +
          ` pay.last_date AS last_payment_date ` +
          ` FROM invoices i LEFT JOIN LATERAL (SELECT invoice_id, MAX(date) AS last_date FROM transactions WHERE type = 'Income' AND invoice_id IS NOT NULL AND tenant_id = $1 GROUP BY invoice_id) pay ON pay.invoice_id = i.id ` +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.contact_id = $3 ` +
          ` ORDER BY i.due_date DESC `;
      } else {
        return res.status(400).json({ error: 'Invalid parent type for viewBy=property' });
      }
    } else if (viewBy === 'owner') {
      if (parentType === 'owner') {
        childType = 'property';
        query =
          `SELECT i.property_id AS id, p.name AS name, true AS has_children, ` + agg +
          ` FROM invoices i JOIN properties p ON p.id = i.property_id AND p.tenant_id = i.tenant_id ` + paySub +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND p.owner_id = $3 AND i.property_id IS NOT NULL ` +
          ` GROUP BY i.property_id, p.name ORDER BY outstanding DESC NULLS LAST `;
      } else if (parentType === 'property') {
        childType = 'unit';
        query =
          `SELECT i.unit_id AS id, u.name AS name, true AS has_children, ` + agg +
          ` FROM invoices i JOIN units u ON u.id = i.unit_id AND u.tenant_id = i.tenant_id ` + paySub +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.property_id = $3 AND i.unit_id IS NOT NULL ` +
          ` GROUP BY i.unit_id, u.name ORDER BY outstanding DESC NULLS LAST `;
      } else if (parentType === 'unit') {
        childType = 'tenant';
        query =
          `SELECT i.contact_id AS id, c.name AS name, true AS has_children, ` + agg +
          ` FROM invoices i JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id ` + paySub +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.unit_id = $3 ` +
          ` GROUP BY i.contact_id, c.name ORDER BY outstanding DESC NULLS LAST `;
      } else if (parentType === 'tenant') {
        childType = 'invoice';
        query =
          `SELECT i.id, i.invoice_number AS name, i.amount, i.paid_amount, i.due_date, i.status, ` +
          ` (i.amount - COALESCE(i.paid_amount, 0)) AS outstanding, ` +
          ` CASE WHEN i.due_date < CURRENT_DATE THEN (i.amount - COALESCE(i.paid_amount, 0)) ELSE 0 END AS overdue, ` +
          ` pay.last_date AS last_payment_date ` +
          ` FROM invoices i LEFT JOIN LATERAL (SELECT invoice_id, MAX(date) AS last_date FROM transactions WHERE type = 'Income' AND invoice_id IS NOT NULL AND tenant_id = $1 GROUP BY invoice_id) pay ON pay.invoice_id = i.id ` +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.contact_id = $3 ` +
          ` ORDER BY i.due_date DESC `;
      } else {
        return res.status(400).json({ error: 'Invalid parent type for viewBy=owner' });
      }
    } else {
      // viewBy === 'unit'
      if (parentType === 'unit') {
        childType = 'tenant';
        query =
          `SELECT i.contact_id AS id, c.name AS name, true AS has_children, ` + agg +
          ` FROM invoices i JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id ` + paySub +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.unit_id = $3 ` +
          ` GROUP BY i.contact_id, c.name ORDER BY outstanding DESC NULLS LAST `;
      } else if (parentType === 'tenant') {
        childType = 'invoice';
        query =
          `SELECT i.id, i.invoice_number AS name, i.amount, i.paid_amount, i.due_date, i.status, ` +
          ` (i.amount - COALESCE(i.paid_amount, 0)) AS outstanding, ` +
          ` CASE WHEN i.due_date < CURRENT_DATE THEN (i.amount - COALESCE(i.paid_amount, 0)) ELSE 0 END AS overdue, ` +
          ` pay.last_date AS last_payment_date ` +
          ` FROM invoices i LEFT JOIN LATERAL (SELECT invoice_id, MAX(date) AS last_date FROM transactions WHERE type = 'Income' AND invoice_id IS NOT NULL AND tenant_id = $1 GROUP BY invoice_id) pay ON pay.invoice_id = i.id ` +
          ` WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.invoice_type = ANY($2::text[]) AND i.status <> 'Paid' AND i.contact_id = $3 ` +
          ` ORDER BY i.due_date DESC `;
      } else {
        return res.status(400).json({ error: 'Invalid parent type for viewBy=unit' });
      }
    }

    const rows = await db.query(query, params);
    if (childType === 'invoice') {
      const nodes = rows.map((r: any) => ({
        id: r.id,
        type: 'invoice' as const,
        name: r.name || r.invoice_number || 'Invoice',
        outstanding: toNum(r.outstanding),
        overdue: toNum(r.overdue),
        invoiceCount: undefined,
        lastPaymentDate: r.last_payment_date || null,
        hasChildren: false,
        dueDate: r.due_date,
        status: r.status,
        amount: toNum(r.amount),
        paidAmount: toNum(r.paid_amount),
      }));
      return res.json({ nodes });
    }
    const nodes = rows.map((r: any) => rowToNode(r, childType));
    res.json({ nodes });
  } catch (error: any) {
    console.error('AR children error:', error);
    res.status(500).json({ error: 'Failed to fetch AR children', message: error?.message });
  }
});

export default router;

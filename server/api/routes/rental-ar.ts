import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { cacheMiddleware } from '../../middleware/cacheMiddleware.js';

const router = Router();
const getDb = () => getDatabaseService();

function arCacheKey(req: any) {
  const t = (req as TenantRequest).tenantId;
  return `__ar__${t}__${req.originalUrl}`;
}

const RENTAL_TYPES = `('Rental', 'Security Deposit')`;

function buildAgingCondition(aging: string, paramIndex: number): { clause: string; params: any[] } {
  switch (aging) {
    case 'overdue':
      return { clause: `AND i.due_date < CURRENT_DATE AND i.status != 'Paid'`, params: [] };
    case '0-30':
      return { clause: `AND i.due_date BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE AND i.status != 'Paid'`, params: [] };
    case '31-60':
      return { clause: `AND i.due_date BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '31 days' AND i.status != 'Paid'`, params: [] };
    case '61-90':
      return { clause: `AND i.due_date BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE - INTERVAL '61 days' AND i.status != 'Paid'`, params: [] };
    case '90+':
      return { clause: `AND i.due_date < CURRENT_DATE - INTERVAL '90 days' AND i.status != 'Paid'`, params: [] };
    default:
      return { clause: '', params: [] };
  }
}

function buildSearchCondition(search: string, paramIndex: number): { clause: string; params: any[] } {
  if (!search?.trim()) return { clause: '', params: [] };
  const clause = `AND (
    c.name ILIKE $${paramIndex}
    OR i.invoice_number ILIKE $${paramIndex}
    OR COALESCE(p.name, '') ILIKE $${paramIndex}
    OR COALESCE(b.name, '') ILIKE $${paramIndex}
  )`;
  return { clause, params: [`%${search}%`] };
}

// GET /api/rental/ar-tree-summary
router.get('/ar-tree-summary', cacheMiddleware(60, arCacheKey), async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { groupBy = 'building', aging = 'all', search = '' } = req.query as {
      groupBy?: string;
      aging?: string;
      search?: string;
    };

    const agingCond = buildAgingCondition(aging as string, 10);
    const searchCond = buildSearchCondition(search as string, agingCond.params.length + 2);
    const allParams: any[] = [req.tenantId, ...agingCond.params, ...searchCond.params];

    let query = '';

    switch (groupBy) {
      case 'building':
        query = `
          SELECT
            b.id,
            'building' as type,
            b.name,
            COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as outstanding,
            COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as overdue,
            COUNT(i.id)::int as invoice_count,
            TRUE as has_children
          FROM buildings b
          LEFT JOIN properties p ON p.building_id = b.id AND p.tenant_id = b.tenant_id
          LEFT JOIN invoices i ON i.property_id = p.id AND i.tenant_id = b.tenant_id
            AND i.deleted_at IS NULL AND i.invoice_type IN ${RENTAL_TYPES}
            ${agingCond.clause}
          LEFT JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
          WHERE b.tenant_id = $1
          ${searchCond.clause}
          GROUP BY b.id, b.name
          HAVING COUNT(i.id) > 0
          ORDER BY b.name
        `;
        break;

      case 'property':
        query = `
          SELECT
            p.id,
            'property' as type,
            p.name,
            COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as outstanding,
            COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as overdue,
            COUNT(i.id)::int as invoice_count,
            TRUE as has_children
          FROM properties p
          LEFT JOIN invoices i ON i.property_id = p.id AND i.tenant_id = p.tenant_id
            AND i.deleted_at IS NULL AND i.invoice_type IN ${RENTAL_TYPES}
            ${agingCond.clause}
          LEFT JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
          LEFT JOIN buildings b ON b.id = p.building_id AND b.tenant_id = p.tenant_id
          WHERE p.tenant_id = $1
          ${searchCond.clause}
          GROUP BY p.id, p.name
          HAVING COUNT(i.id) > 0
          ORDER BY p.name
        `;
        break;

      case 'tenant':
        query = `
          SELECT
            c.id,
            'tenant' as type,
            c.name,
            COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as outstanding,
            COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as overdue,
            COUNT(i.id)::int as invoice_count,
            FALSE as has_children
          FROM contacts c
          JOIN invoices i ON i.contact_id = c.id AND i.tenant_id = c.tenant_id
            AND i.deleted_at IS NULL AND i.invoice_type IN ${RENTAL_TYPES}
            ${agingCond.clause}
          LEFT JOIN properties p ON p.id = i.property_id AND p.tenant_id = i.tenant_id
          LEFT JOIN buildings b ON b.id = p.building_id AND b.tenant_id = p.tenant_id
          WHERE c.tenant_id = $1
          ${searchCond.clause}
          GROUP BY c.id, c.name
          HAVING COUNT(i.id) > 0
          ORDER BY c.name
        `;
        break;

      case 'owner':
        query = `
          SELECT
            owner.id,
            'owner' as type,
            owner.name,
            COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as outstanding,
            COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as overdue,
            COUNT(i.id)::int as invoice_count,
            TRUE as has_children
          FROM contacts owner
          JOIN properties p ON p.owner_id = owner.id AND p.tenant_id = owner.tenant_id
          JOIN invoices i ON i.property_id = p.id AND i.tenant_id = owner.tenant_id
            AND i.deleted_at IS NULL AND i.invoice_type IN ${RENTAL_TYPES}
            ${agingCond.clause}
          LEFT JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
          LEFT JOIN buildings b ON b.id = p.building_id AND b.tenant_id = p.tenant_id
          WHERE owner.tenant_id = $1
          ${searchCond.clause}
          GROUP BY owner.id, owner.name
          HAVING COUNT(i.id) > 0
          ORDER BY owner.name
        `;
        break;

      default:
        return res.status(400).json({ error: 'Invalid groupBy parameter' });
    }

    const results = await db.query(query, allParams);
    res.json(results);
  } catch (error) {
    console.error('Error fetching AR tree summary:', error);
    res.status(500).json({ error: 'Failed to fetch AR tree summary' });
  }
});

// GET /api/rental/ar-tree-children
router.get('/ar-tree-children', cacheMiddleware(60, arCacheKey), async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { parentId, parentType, groupBy = 'building', aging = 'all' } = req.query as {
      parentId?: string;
      parentType?: string;
      groupBy?: string;
      aging?: string;
    };

    if (!parentId || !parentType) {
      return res.status(400).json({ error: 'parentId and parentType are required' });
    }

    const agingCond = buildAgingCondition(aging as string, 10);
    const allParams: any[] = [req.tenantId, parentId, ...agingCond.params];

    let query = '';

    if (parentType === 'building') {
      query = `
        SELECT
          p.id,
          'property' as type,
          p.name,
          COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as outstanding,
          COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as overdue,
          COUNT(i.id)::int as invoice_count,
          TRUE as has_children
        FROM properties p
        JOIN invoices i ON i.property_id = p.id AND i.tenant_id = p.tenant_id
          AND i.deleted_at IS NULL AND i.invoice_type IN ${RENTAL_TYPES}
          ${agingCond.clause}
        WHERE p.tenant_id = $1 AND p.building_id = $2
        GROUP BY p.id, p.name
        HAVING COUNT(i.id) > 0
        ORDER BY p.name
      `;
    } else if (parentType === 'property') {
      query = `
        SELECT
          c.id,
          'tenant' as type,
          c.name,
          COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as outstanding,
          COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as overdue,
          COUNT(i.id)::int as invoice_count,
          FALSE as has_children
        FROM contacts c
        JOIN invoices i ON i.contact_id = c.id AND i.tenant_id = c.tenant_id
          AND i.deleted_at IS NULL AND i.invoice_type IN ${RENTAL_TYPES}
          AND i.property_id = $2
          ${agingCond.clause}
        WHERE c.tenant_id = $1
        GROUP BY c.id, c.name
        HAVING COUNT(i.id) > 0
        ORDER BY c.name
      `;
    } else if (parentType === 'owner') {
      query = `
        SELECT
          b.id,
          'building' as type,
          b.name,
          COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as outstanding,
          COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.status != 'Paid' THEN i.amount - i.paid_amount ELSE 0 END), 0) as overdue,
          COUNT(i.id)::int as invoice_count,
          TRUE as has_children
        FROM buildings b
        JOIN properties p ON p.building_id = b.id AND p.tenant_id = b.tenant_id AND p.owner_id = $2
        JOIN invoices i ON i.property_id = p.id AND i.tenant_id = b.tenant_id
          AND i.deleted_at IS NULL AND i.invoice_type IN ${RENTAL_TYPES}
          ${agingCond.clause}
        WHERE b.tenant_id = $1
        GROUP BY b.id, b.name
        HAVING COUNT(i.id) > 0
        ORDER BY b.name
      `;
    } else {
      return res.status(400).json({ error: 'Invalid parentType' });
    }

    const results = await db.query(query, allParams);
    res.json(results);
  } catch (error) {
    console.error('Error fetching AR tree children:', error);
    res.status(500).json({ error: 'Failed to fetch AR tree children' });
  }
});

// GET /api/rental/ar-node-invoices
router.get('/ar-node-invoices', cacheMiddleware(60, arCacheKey), async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { nodeId, nodeType, aging = 'all', limit = '200', offset = '0' } = req.query as {
      nodeId?: string;
      nodeType?: string;
      aging?: string;
      limit?: string;
      offset?: string;
    };

    if (!nodeId || !nodeType) {
      return res.status(400).json({ error: 'nodeId and nodeType are required' });
    }

    const agingCond = buildAgingCondition(aging as string, 10);
    const effectiveLimit = Math.min(parseInt(limit) || 200, 1000);
    const effectiveOffset = parseInt(offset) || 0;

    let nodeFilter = '';
    const allParams: any[] = [req.tenantId, nodeId, ...agingCond.params];

    switch (nodeType) {
      case 'building':
        nodeFilter = `AND (i.building_id = $2 OR p.building_id = $2)`;
        break;
      case 'property':
        nodeFilter = `AND i.property_id = $2`;
        break;
      case 'tenant':
        nodeFilter = `AND i.contact_id = $2`;
        break;
      case 'owner':
        nodeFilter = `AND p.owner_id = $2`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid nodeType' });
    }

    const paramIdx = allParams.length + 1;
    allParams.push(effectiveLimit, effectiveOffset);

    const query = `
      SELECT
        i.id, i.invoice_number, i.contact_id, i.amount, i.paid_amount,
        i.status, i.issue_date, i.due_date, i.invoice_type, i.description,
        i.property_id, i.building_id, i.unit_id, i.agreement_id,
        i.rental_month,
        c.name as contact_name,
        COALESCE(p.name, '') as property_name,
        COALESCE(b.name, '') as building_name
      FROM invoices i
      LEFT JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
      LEFT JOIN properties p ON p.id = i.property_id AND p.tenant_id = i.tenant_id
      LEFT JOIN buildings b ON b.id = COALESCE(i.building_id, p.building_id) AND b.tenant_id = i.tenant_id
      WHERE i.tenant_id = $1
        AND i.deleted_at IS NULL
        AND i.invoice_type IN ${RENTAL_TYPES}
        ${nodeFilter}
        ${agingCond.clause}
      ORDER BY i.issue_date DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const results = await db.query(query, allParams);
    res.json(results);
  } catch (error) {
    console.error('Error fetching AR node invoices:', error);
    res.status(500).json({ error: 'Failed to fetch node invoices' });
  }
});

export default router;

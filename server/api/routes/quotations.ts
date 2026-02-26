import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all quotations
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { limit, offset } = req.query;
    const effectiveLimit = Math.min(parseInt(limit as string) || 10000, 50000);
    let query = 'SELECT * FROM quotations WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY date DESC, created_at DESC LIMIT $2';
    const params: any[] = [req.tenantId, effectiveLimit];
    if (offset) {
      query += ' OFFSET $3';
      params.push(parseInt(offset as string));
    }
    const quotations = await db.query(query, params);
    res.json(quotations);
  } catch (error) {
    console.error('Error fetching quotations:', error);
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

// GET quotation by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const quotations = await db.query(
      'SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.tenantId]
    );

    if (quotations.length === 0) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    res.json(quotations[0]);
  } catch (error) {
    console.error('Error fetching quotation:', error);
    res.status(500).json({ error: 'Failed to fetch quotation' });
  }
});

// POST create/update quotation (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const quotation = req.body;

    // Validate required fields
    if (!quotation.vendorId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Vendor ID is required'
      });
    }
    if (!quotation.name) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Name is required'
      });
    }
    if (!quotation.date) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Date is required'
      });
    }
    if (!quotation.items || !Array.isArray(quotation.items)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Items array is required'
      });
    }
    if (!quotation.totalAmount) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Total amount is required'
      });
    }

    // Generate ID if not provided
    const quotationId = quotation.id || `quotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if quotation exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id, version FROM quotations WHERE id = $1 AND tenant_id = $2',
      [quotationId, req.tenantId]
    );
    const isUpdate = existing.length > 0;

    // Optimistic locking check for POST update
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    const serverVersion = isUpdate ? existing[0].version : null;
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO quotations (
        id, tenant_id, user_id, vendor_id, name, date, items, document_id, total_amount, created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 
                COALESCE((SELECT created_at FROM quotations WHERE id = $1), NOW()), NOW(), 1)
      ON CONFLICT (id) 
      DO UPDATE SET
        vendor_id = EXCLUDED.vendor_id,
        name = EXCLUDED.name,
        date = EXCLUDED.date,
        items = EXCLUDED.items,
        document_id = EXCLUDED.document_id,
        total_amount = EXCLUDED.total_amount,
        user_id = EXCLUDED.user_id,
        updated_at = NOW(),
        version = COALESCE(quotations.version, 1) + 1,
        deleted_at = NULL
      WHERE quotations.tenant_id = $2 AND (quotations.version = $10 OR quotations.version IS NULL)
      RETURNING *`,
      [
        quotationId,
        req.tenantId,
        req.user?.userId || null,
        quotation.vendorId,
        quotation.name,
        quotation.date,
        JSON.stringify(quotation.items),
        quotation.documentId || null,
        quotation.totalAmount,
        serverVersion
      ]
    );

    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.QUOTATION_UPDATED : WS_EVENTS.QUOTATION_CREATED, {
      quotation: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating quotation:', error);
    res.status(500).json({
      error: 'Failed to create/update quotation',
      message: error.message || 'Internal server error'
    });
  }
});

// DELETE quotation
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE quotations SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.QUOTATION_DELETED, {
      quotationId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting quotation:', error);
    res.status(500).json({ error: 'Failed to delete quotation' });
  }
});

export default router;

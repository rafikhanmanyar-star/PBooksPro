import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all sales returns
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, agreementId } = req.query;

    let query = 'SELECT * FROM sales_returns WHERE tenant_id = $1 AND deleted_at IS NULL';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (agreementId) {
      query += ` AND agreement_id = $${paramIndex++}`;
      params.push(agreementId);
    }

    query += ' ORDER BY return_date DESC, created_at DESC';

    const salesReturns = await db.query(query, params);
    res.json(salesReturns);
  } catch (error) {
    console.error('Error fetching sales returns:', error);
    res.status(500).json({ error: 'Failed to fetch sales returns' });
  }
});

// GET sales return by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const salesReturns = await db.query(
      'SELECT * FROM sales_returns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.tenantId]
    );

    if (salesReturns.length === 0) {
      return res.status(404).json({ error: 'Sales return not found' });
    }

    res.json(salesReturns[0]);
  } catch (error) {
    console.error('Error fetching sales return:', error);
    res.status(500).json({ error: 'Failed to fetch sales return' });
  }
});

// POST create/update sales return (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const salesReturn = req.body;

    // Validate required fields
    if (!salesReturn.returnNumber || !salesReturn.agreementId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Return number and agreement ID are required'
      });
    }

    // Generate ID if not provided
    const returnId = salesReturn.id || `sales_return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if sales return with this ID already exists and belongs to a different tenant
    if (salesReturn.id) {
      const existingReturn = await db.query(
        'SELECT tenant_id FROM sales_returns WHERE id = $1',
        [returnId]
      );

      if (existingReturn.length > 0 && existingReturn[0].tenant_id !== req.tenantId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'A sales return with this ID already exists in another organization'
        });
      }
    }

    // Check if sales return exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id, version FROM sales_returns WHERE id = $1 AND tenant_id = $2',
      [returnId, req.tenantId]
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
      `INSERT INTO sales_returns (
        id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
        penalty_percentage, penalty_amount, refund_amount, status, processed_date,
        refunded_date, refund_bill_id, created_by, notes, created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                COALESCE((SELECT created_at FROM sales_returns WHERE id = $1), NOW()), NOW(), 1)
      ON CONFLICT (id) 
      DO UPDATE SET
        return_number = EXCLUDED.return_number,
        agreement_id = EXCLUDED.agreement_id,
        return_date = EXCLUDED.return_date,
        reason = EXCLUDED.reason,
        reason_notes = EXCLUDED.reason_notes,
        penalty_percentage = EXCLUDED.penalty_percentage,
        penalty_amount = EXCLUDED.penalty_amount,
        refund_amount = EXCLUDED.refund_amount,
        status = EXCLUDED.status,
        processed_date = EXCLUDED.processed_date,
        refunded_date = EXCLUDED.refunded_date,
        refund_bill_id = EXCLUDED.refund_bill_id,
        created_by = EXCLUDED.created_by,
        notes = EXCLUDED.notes,
        updated_at = NOW(),
        version = COALESCE(sales_returns.version, 1) + 1,
        deleted_at = NULL
      WHERE sales_returns.tenant_id = $2 AND (sales_returns.version = $17 OR sales_returns.version IS NULL)
      RETURNING *`,
      [
        returnId,
        req.tenantId,
        salesReturn.returnNumber || null,
        salesReturn.agreementId || null,
        salesReturn.returnDate || null,
        salesReturn.reason || null,
        salesReturn.reasonNotes || null,
        salesReturn.penaltyPercentage || 0,
        salesReturn.penaltyAmount || 0,
        salesReturn.refundAmount || 0,
        salesReturn.status || null,
        salesReturn.processedDate || null,
        salesReturn.refundedDate || null,
        salesReturn.refundBillId || null,
        salesReturn.createdBy || null,
        salesReturn.notes || null,
        serverVersion
      ]
    );
    const saved = result[0];

    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      emitToTenant(req.tenantId!, WS_EVENTS.SALES_RETURN_UPDATED, {
        salesReturn: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      emitToTenant(req.tenantId!, WS_EVENTS.SALES_RETURN_CREATED, {
        salesReturn: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }

    res.status(isUpdate ? 200 : 201).json(saved);
  } catch (error: any) {
    console.error('Error creating/updating sales return:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Return number already exists' });
    }
    res.status(500).json({ error: 'Failed to save sales return' });
  }
});

// PUT update sales return
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const salesReturn = req.body;
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE sales_returns 
      SET return_number = $1, agreement_id = $2, return_date = $3, reason = $4,
          reason_notes = $5, penalty_percentage = $6, penalty_amount = $7,
          refund_amount = $8, status = $9, processed_date = $10, refunded_date = $11,
          refund_bill_id = $12, created_by = $13, notes = $14, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $15 AND tenant_id = $16
    `;
    const updateParams: any[] = [
      salesReturn.returnNumber,
      salesReturn.agreementId,
      salesReturn.returnDate,
      salesReturn.reason,
      salesReturn.reasonNotes || null,
      salesReturn.penaltyPercentage || 0,
      salesReturn.penaltyAmount || 0,
      salesReturn.refundAmount || 0,
      salesReturn.status,
      salesReturn.processedDate || null,
      salesReturn.refundedDate || null,
      salesReturn.refundBillId || null,
      salesReturn.createdBy || null,
      salesReturn.notes || null,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      updateQuery += ` AND version = $17`;
      updateParams.push(clientVersion);
    }

    updateQuery += ` RETURNING *`;

    const result = await db.query(updateQuery, updateParams);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Sales return not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.SALES_RETURN_UPDATED, {
      salesReturn: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating sales return:', error);
    res.status(500).json({ error: 'Failed to update sales return' });
  }
});

// DELETE sales return
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE sales_returns SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Sales return not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.SALES_RETURN_DELETED, {
      salesReturnId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting sales return:', error);
    res.status(500).json({ error: 'Failed to delete sales return' });
  }
});

export default router;


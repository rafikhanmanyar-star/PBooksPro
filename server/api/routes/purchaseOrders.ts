import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';
import { validatePOTransition } from '../../services/p2p/stateMachine.js';
import { logStatusChange, logEntityCreated } from '../../services/p2p/auditTrail.js';
import { notifyPOReceived } from '../../services/p2p/notifications.js';
import { autoGenerateBill } from './p2pBills.js';

const router = Router();
const getDb = () => getDatabaseService();

/**
 * GET /api/purchase-orders
 * Get all purchase orders for the tenant
 * Returns:
 *   - For buyers: POs where tenant_id matches (POs they created)
 *   - For suppliers: POs where supplier_tenant_id matches (POs sent to them)
 */
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, supplierId } = req.query;

    // IMPORTANT: Return POs where tenant_id matches (buyer's own POs)
    // OR where supplier_tenant_id matches (POs sent to this tenant as supplier)
    let query = `
      SELECT * FROM purchase_orders 
      WHERE (tenant_id = $1 OR supplier_tenant_id = $1)
    `;
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (supplierId) {
      query += ` AND supplier_tenant_id = $${paramIndex++}`;
      params.push(supplierId);
    }

    query += ' ORDER BY created_at DESC';

    const pos = await db.query(query, params);
    res.json(pos);
  } catch (error: any) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

/**
 * GET /api/purchase-orders/:id
 * Get a specific purchase order
 */
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const po = await db.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!po || po.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    res.json(po[0]);
  } catch (error: any) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

/**
 * POST /api/purchase-orders
 * Create PO, set status to SENT, trigger notification
 */
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const poData = req.body;

    // Validate required fields
    if (!poData.poNumber || !poData.supplierTenantId || !poData.items || !Array.isArray(poData.items)) {
      return res.status(400).json({ error: 'Missing required fields: poNumber, supplierTenantId, items' });
    }

    // Calculate total amount from items
    const totalAmount = poData.items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);

    const poId = poData.id || `po_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const buyerTenantId = req.tenantId;
    const now = new Date().toISOString();

    // Create PO with status DRAFT, then immediately set to SENT
    const result = await db.query(
      `INSERT INTO purchase_orders (
        id, po_number, buyer_tenant_id, supplier_tenant_id, total_amount, status,
        items, description, created_by, sent_at, tenant_id, user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        poId,
        poData.poNumber,
        buyerTenantId,
        poData.supplierTenantId,
        totalAmount,
        'SENT', // Automatically set to SENT on creation
        JSON.stringify(poData.items),
        poData.description || null,
        req.user?.userId || null,
        now, // sent_at
        req.tenantId,
        req.user?.userId || null,
        now,
        now
      ]
    );

    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Failed to create purchase order' });
    }

    const createdPO = result[0];

    // Log audit trail
    if (req.tenantId) {
      await logEntityCreated('PO', poId, req.user?.userId, req.tenantId);
      await logStatusChange('PO', poId, 'STATUS_CHANGE', 'DRAFT', 'SENT', req.user?.userId, req.tenantId);
    }

    // Trigger notification (stub)
    await notifyPOReceived(poId, poData.supplierTenantId);

    // Emit WebSocket event to buyer's tenant
    if (req.tenantId) {
      emitToTenant(req.tenantId, WS_EVENTS.PURCHASE_ORDER_CREATED, createdPO);
    }

    // IMPORTANT: Also emit WebSocket event to supplier's tenant so they get notified
    // Use DATA_UPDATED event type with specific PO notification
    if (poData.supplierTenantId) {
      emitToTenant(poData.supplierTenantId, WS_EVENTS.DATA_UPDATED, {
        type: 'PURCHASE_ORDER_RECEIVED',
        poId: poId,
        poNumber: poData.poNumber,
        buyerTenantId: buyerTenantId,
        totalAmount: totalAmount,
        purchaseOrder: createdPO
      });
    }

    res.status(201).json(createdPO);
  } catch (error: any) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
});

/**
 * PUT /api/purchase-orders/:id/status
 * Update PO status with validation
 */
router.put('/:id/status', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    // Get current PO
    const currentPO = await db.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!currentPO || currentPO.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    const po = currentPO[0];

    // Validate state transition
    try {
      validatePOTransition(po.status, status);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    // Prepare update fields
    const updateFields: string[] = ['status = $1', 'updated_at = NOW()'];
    const updateValues: any[] = [status];
    let paramIndex = 2;

    // Update timestamp fields based on status
    const now = new Date().toISOString();
    if (status === 'RECEIVED' && !po.received_at) {
      updateFields.push(`received_at = $${paramIndex++}`);
      updateValues.push(now);
    }
    if (status === 'DELIVERED' && !po.delivered_at) {
      updateFields.push(`delivered_at = $${paramIndex++}`);
      updateValues.push(now);
    }
    if (status === 'COMPLETED' && !po.completed_at) {
      updateFields.push(`completed_at = $${paramIndex++}`);
      updateValues.push(now);
    }

    updateValues.push(req.params.id, req.tenantId);

    // Update PO status
    const result = await db.query(
      `UPDATE purchase_orders 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      updateValues
    );

    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Failed to update purchase order status' });
    }

    const updatedPO = result[0];

    // Log audit trail
    if (req.tenantId) {
      await logStatusChange('PO', req.params.id, 'STATUS_CHANGE', po.status, status, req.user?.userId, req.tenantId);

      // If DELIVERED, check for APPROVED invoice and auto-generate BILL
      if (status === 'DELIVERED') {
        try {
          // Check if there's an APPROVED invoice for this PO
          const invoiceResult = await db.query(
            'SELECT id FROM p2p_invoices WHERE po_id = $1 AND status = $2',
            [req.params.id, 'APPROVED']
          );

          if (invoiceResult && invoiceResult.length > 0) {
            const invoiceId = invoiceResult[0].id;
            // Auto-generate bill
            await autoGenerateBill(invoiceId, req.params.id, req.tenantId);
          }
        } catch (error: any) {
          console.error('Error auto-generating bill:', error);
          // Don't fail the status update if bill generation fails
        }
      }

      // Emit WebSocket event
      emitToTenant(req.tenantId, WS_EVENTS.PURCHASE_ORDER_UPDATED, updatedPO);
    }

    res.json(updatedPO);
  } catch (error: any) {
    console.error('Error updating purchase order status:', error);
    res.status(500).json({ error: 'Failed to update purchase order status' });
  }
});

export default router;

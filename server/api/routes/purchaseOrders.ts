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
    // Join with tenants table to get buyer and supplier company names
    // Use aliases to return camelCase field names for frontend compatibility
    let query = `
      SELECT 
        po.id,
        po.po_number as "poNumber",
        po.buyer_tenant_id as "buyerTenantId",
        po.supplier_tenant_id as "supplierTenantId",
        po.project_id as "projectId",
        po.total_amount as "totalAmount",
        po.status,
        po.items,
        po.description,
        po.target_delivery_date as "targetDeliveryDate",
        po.created_by as "createdBy",
        po.sent_at as "sentAt",
        po.received_at as "receivedAt",
        po.delivered_at as "deliveredAt",
        po.completed_at as "completedAt",
        po.tenant_id as "tenantId",
        po.user_id as "userId",
        po.created_at as "createdAt",
        po.updated_at as "updatedAt",
        po.locked_by_tenant_id as "lockedByTenantId",
        po.locked_by_user_id as "lockedByUserId",
        po.locked_at as "lockedAt",
        bt.company_name as "buyerCompanyName",
        bt.name as "buyerName",
        st.company_name as "supplierCompanyName",
        st.name as "supplierName",
        p.name as "projectName"
      FROM purchase_orders po
      LEFT JOIN tenants bt ON po.buyer_tenant_id = bt.id
      LEFT JOIN tenants st ON po.supplier_tenant_id = st.id
      LEFT JOIN projects p ON po.project_id = p.id
      WHERE (po.tenant_id = $1 OR po.supplier_tenant_id = $1)
    `;
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND po.status = $${paramIndex++}`;
      params.push(status);
    }

    if (supplierId) {
      query += ` AND po.supplier_tenant_id = $${paramIndex++}`;
      params.push(supplierId);
    }

    query += ' ORDER BY po.created_at DESC';

    const pos = await db.query(query, params);
    // Parse numeric fields and JSON items
    const parsedPOs = pos.map((po: any) => ({
      ...po,
      totalAmount: parseFloat(po.totalAmount) || 0,
      items: typeof po.items === 'string' ? JSON.parse(po.items) : po.items
    }));
    res.json(parsedPOs);
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
      `SELECT 
        po.id,
        po.po_number as "poNumber",
        po.buyer_tenant_id as "buyerTenantId",
        po.supplier_tenant_id as "supplierTenantId",
        po.project_id as "projectId",
        po.total_amount as "totalAmount",
        po.status,
        po.items,
        po.description,
        po.target_delivery_date as "targetDeliveryDate",
        po.created_by as "createdBy",
        po.sent_at as "sentAt",
        po.received_at as "receivedAt",
        po.delivered_at as "deliveredAt",
        po.completed_at as "completedAt",
        po.tenant_id as "tenantId",
        po.user_id as "userId",
        po.created_at as "createdAt",
        po.updated_at as "updatedAt",
        po.locked_by_tenant_id as "lockedByTenantId",
        po.locked_by_user_id as "lockedByUserId",
        po.locked_at as "lockedAt",
        bt.company_name as "buyerCompanyName",
        bt.name as "buyerName",
        st.company_name as "supplierCompanyName",
        st.name as "supplierName",
        p.name as "projectName"
      FROM purchase_orders po
      LEFT JOIN tenants bt ON po.buyer_tenant_id = bt.id
      LEFT JOIN tenants st ON po.supplier_tenant_id = st.id
      LEFT JOIN projects p ON po.project_id = p.id
      WHERE po.id = $1 AND (po.tenant_id = $2 OR po.supplier_tenant_id = $2)`,
      [req.params.id, req.tenantId]
    );

    if (!po || po.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    // Parse numeric fields and JSON items
    const parsedPO = {
      ...po[0],
      totalAmount: parseFloat(po[0].totalAmount) || 0,
      items: typeof po[0].items === 'string' ? JSON.parse(po[0].items) : po[0].items
    };
    res.json(parsedPO);
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
        id, po_number, buyer_tenant_id, supplier_tenant_id, project_id, total_amount, status,
        items, description, target_delivery_date, created_by, sent_at, tenant_id, user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING 
        id,
        po_number as "poNumber",
        buyer_tenant_id as "buyerTenantId",
        supplier_tenant_id as "supplierTenantId",
        project_id as "projectId",
        total_amount as "totalAmount",
        status,
        items,
        description,
        target_delivery_date as "targetDeliveryDate",
        created_by as "createdBy",
        sent_at as "sentAt",
        received_at as "receivedAt",
        delivered_at as "deliveredAt",
        completed_at as "completedAt",
        tenant_id as "tenantId",
        user_id as "userId",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        poId,
        poData.poNumber,
        buyerTenantId,
        poData.supplierTenantId,
        poData.projectId || null,
        totalAmount,
        'SENT', // Automatically set to SENT on creation
        JSON.stringify(poData.items),
        poData.description || null,
        poData.targetDeliveryDate || null,
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

    // Parse numeric fields and JSON items
    const createdPO = {
      ...result[0],
      totalAmount: parseFloat(result[0].totalAmount) || 0,
      items: typeof result[0].items === 'string' ? JSON.parse(result[0].items) : result[0].items
    };

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
    const message = error?.message || 'Failed to create purchase order';
    const code = error?.code;
    // Return actionable message for known DB errors (e.g. missing column → run migrations)
    if (code === '42703') {
      return res.status(500).json({ error: `Database schema may be outdated: ${message}. Please restart the server to run migrations.` });
    }
    if (code === '23505') {
      return res.status(409).json({ error: 'A purchase order with this PO number already exists. Please use a different PO number.' });
    }
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/purchase-orders/:id/lock
 * Acquire lock on PO (buyer or supplier opening for edit). Returns 423 if locked by other party.
 */
router.post('/:id/lock', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const poId = req.params.id;

    const rows = await db.query(
      'SELECT id, tenant_id, supplier_tenant_id, locked_by_tenant_id FROM purchase_orders WHERE id = $1',
      [poId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    const po = rows[0];
    const isBuyer = po.tenant_id === req.tenantId;
    const isSupplier = po.supplier_tenant_id === req.tenantId;
    if (!isBuyer && !isSupplier) {
      return res.status(403).json({ error: 'Not authorized to access this PO' });
    }
    if (po.locked_by_tenant_id && po.locked_by_tenant_id !== req.tenantId) {
      return res.status(423).json({
        error: 'PO is locked by the other party',
        lockedByTenantId: po.locked_by_tenant_id
      });
    }
    const now = new Date().toISOString();
    await db.query(
      `UPDATE purchase_orders SET locked_by_tenant_id = $1, locked_by_user_id = $2, locked_at = $3, updated_at = $3 WHERE id = $4`,
      [req.tenantId, req.user?.userId || null, now, poId]
    );
    const updated = await db.query(
      `SELECT id, po_number as "poNumber", buyer_tenant_id as "buyerTenantId", supplier_tenant_id as "supplierTenantId",
       project_id as "projectId", total_amount as "totalAmount", status, items, description, target_delivery_date as "targetDeliveryDate",
       created_by as "createdBy", sent_at as "sentAt", received_at as "receivedAt", delivered_at as "deliveredAt", completed_at as "completedAt",
       tenant_id as "tenantId", user_id as "userId", created_at as "createdAt", updated_at as "updatedAt",
       locked_by_tenant_id as "lockedByTenantId", locked_by_user_id as "lockedByUserId", locked_at as "lockedAt"
       FROM purchase_orders WHERE id = $1`,
      [poId]
    );
    const poOut = {
      ...updated[0],
      totalAmount: parseFloat(updated[0].totalAmount) || 0,
      items: typeof updated[0].items === 'string' ? JSON.parse(updated[0].items) : updated[0].items
    };
    res.json(poOut);
  } catch (error: any) {
    console.error('Error locking PO:', error);
    res.status(500).json({ error: 'Failed to lock PO' });
  }
});

/**
 * POST /api/purchase-orders/:id/unlock
 * Release lock (call when closing PO view or after submitting revision).
 */
router.post('/:id/unlock', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const poId = req.params.id;

    const rows = await db.query(
      'SELECT id, locked_by_tenant_id FROM purchase_orders WHERE id = $1',
      [poId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    const po = rows[0];
    if (po.locked_by_tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Only the user who locked the PO can unlock it' });
    }
    await db.query(
      `UPDATE purchase_orders SET locked_by_tenant_id = NULL, locked_by_user_id = NULL, locked_at = NULL, updated_at = $1 WHERE id = $2`,
      [new Date().toISOString(), poId]
    );
    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error unlocking PO:', error);
    res.status(500).json({ error: 'Failed to unlock PO' });
  }
});

/**
 * PUT /api/purchase-orders/:id
 * Buyer submits PO revision (items, description, targetDeliveryDate, projectId). Unlocks after update.
 * Allowed only for buyer when status is SENT or RECEIVED.
 */
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const poId = req.params.id;
    const body = req.body;

    const rows = await db.query(
      'SELECT * FROM purchase_orders WHERE id = $1',
      [poId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    const po = rows[0];
    if (po.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Only the buyer can submit a revision' });
    }
    if (po.status !== 'SENT' && po.status !== 'RECEIVED') {
      return res.status(400).json({ error: 'Revisions only allowed when PO status is SENT or RECEIVED' });
    }
    const items = body.items != null ? (Array.isArray(body.items) ? body.items : []) : null;
    const description = body.description !== undefined ? body.description : null;
    const targetDeliveryDate = body.targetDeliveryDate !== undefined ? body.targetDeliveryDate : null;
    const projectId = body.projectId !== undefined ? body.projectId : null;

    const totalAmount = items != null
      ? items.reduce((sum: number, item: any) => sum + (item.total || 0), 0)
      : parseFloat(po.total_amount) || 0;

    const updates: string[] = ['updated_at = $1', 'locked_by_tenant_id = NULL', 'locked_by_user_id = NULL', 'locked_at = NULL'];
    const values: any[] = [new Date().toISOString()];
    let idx = 2;
    if (items != null) {
      updates.push(`items = $${idx++}`);
      values.push(JSON.stringify(items));
    }
    if (description !== null) {
      updates.push(`description = $${idx++}`);
      values.push(description);
    }
    if (targetDeliveryDate !== null) {
      updates.push(`target_delivery_date = $${idx++}`);
      values.push(targetDeliveryDate);
    }
    if (projectId !== null) {
      updates.push(`project_id = $${idx++}`);
      values.push(projectId);
    }
    if (items != null) {
      updates.push(`total_amount = $${idx++}`);
      values.push(totalAmount);
    }
    values.push(poId);

    await db.query(
      `UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );

    const result = await db.query(
      `SELECT id, po_number as "poNumber", buyer_tenant_id as "buyerTenantId", supplier_tenant_id as "supplierTenantId",
       project_id as "projectId", total_amount as "totalAmount", status, items, description, target_delivery_date as "targetDeliveryDate",
       created_by as "createdBy", sent_at as "sentAt", received_at as "receivedAt", delivered_at as "deliveredAt", completed_at as "completedAt",
       tenant_id as "tenantId", user_id as "userId", created_at as "createdAt", updated_at as "updatedAt",
       locked_by_tenant_id as "lockedByTenantId", locked_by_user_id as "lockedByUserId", locked_at as "lockedAt"
       FROM purchase_orders WHERE id = $1`,
      [poId]
    );
    const updatedPO = {
      ...result[0],
      totalAmount: parseFloat(result[0].totalAmount) || 0,
      items: typeof result[0].items === 'string' ? JSON.parse(result[0].items) : result[0].items
    };
    if (po.supplier_tenant_id) {
      emitToTenant(po.supplier_tenant_id, WS_EVENTS.PURCHASE_ORDER_UPDATED, updatedPO);
    }
    emitToTenant(req.tenantId!, WS_EVENTS.PURCHASE_ORDER_UPDATED, updatedPO);
    res.json(updatedPO);
  } catch (error: any) {
    console.error('Error updating PO revision:', error);
    res.status(500).json({ error: 'Failed to update PO' });
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
       RETURNING 
        id,
        po_number as "poNumber",
        buyer_tenant_id as "buyerTenantId",
        supplier_tenant_id as "supplierTenantId",
        project_id as "projectId",
        total_amount as "totalAmount",
        status,
        items,
        description,
        target_delivery_date as "targetDeliveryDate",
        created_by as "createdBy",
        sent_at as "sentAt",
        received_at as "receivedAt",
        delivered_at as "deliveredAt",
        completed_at as "completedAt",
        tenant_id as "tenantId",
        user_id as "userId",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      updateValues
    );

    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Failed to update purchase order status' });
    }

    // Parse numeric fields and JSON items
    const updatedPO = {
      ...result[0],
      totalAmount: parseFloat(result[0].totalAmount) || 0,
      items: typeof result[0].items === 'string' ? JSON.parse(result[0].items) : result[0].items
    };

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

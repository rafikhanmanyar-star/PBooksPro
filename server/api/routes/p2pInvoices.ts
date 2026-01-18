import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';
import { validateInvoiceTransition } from '../../services/p2p/stateMachine.js';
import { logStatusChange, logInvoiceFlip } from '../../services/p2p/auditTrail.js';
import { notifyPOInvoiced } from '../../services/p2p/notifications.js';

const router = Router();
const getDb = () => getDatabaseService();

/**
 * GET /api/p2p-invoices
 * Get all P2P invoices for the tenant
 */
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, poId } = req.query;

    let query = `
      SELECT * FROM p2p_invoices 
      WHERE tenant_id = $1
    `;
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (poId) {
      query += ` AND po_id = $${paramIndex++}`;
      params.push(poId);
    }

    query += ' ORDER BY created_at DESC';

    const invoices = await db.query(query, params);
    res.json(invoices);
  } catch (error: any) {
    console.error('Error fetching P2P invoices:', error);
    res.status(500).json({ error: 'Failed to fetch P2P invoices' });
  }
});

/**
 * GET /api/p2p-invoices/:id
 * Get a specific P2P invoice
 */
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const invoice = await db.query(
      'SELECT * FROM p2p_invoices WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!invoice || invoice.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice[0]);
  } catch (error: any) {
    console.error('Error fetching P2P invoice:', error);
    res.status(500).json({ error: 'Failed to fetch P2P invoice' });
  }
});

/**
 * POST /api/p2p-invoices/flip-from-po/:poId
 * Supplier creates invoice from SENT PO
 */
router.post('/flip-from-po/:poId', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { poId } = req.params;

    // Get PO
    const poResult = await db.query(
      'SELECT * FROM purchase_orders WHERE id = $1',
      [poId]
    );

    if (!poResult || poResult.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    const po = poResult[0];

    // Validate PO status is SENT
    if (po.status !== 'SENT' && po.status !== 'RECEIVED') {
      return res.status(400).json({ error: `Cannot create invoice from PO with status ${po.status}. PO must be SENT or RECEIVED.` });
    }

    // Validate supplier is authorized (supplier_tenant_id matches current tenant)
    if (po.supplier_tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Unauthorized: Only the supplier can flip this PO to an invoice' });
    }

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const invoiceId = `p2p_inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Parse PO items (stored as JSON string in database)
    const items = typeof po.items === 'string' ? JSON.parse(po.items) : po.items;

    // Create invoice from PO items
    const invoiceResult = await db.query(
      `INSERT INTO p2p_invoices (
        id, invoice_number, po_id, buyer_tenant_id, supplier_tenant_id, amount,
        status, items, tenant_id, user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        invoiceId,
        invoiceNumber,
        poId,
        po.buyer_tenant_id,
        po.supplier_tenant_id,
        po.total_amount,
        'PENDING',
        JSON.stringify(items),
        req.tenantId,
        req.user?.userId || null,
        now,
        now
      ]
    );

    if (!invoiceResult || invoiceResult.length === 0) {
      return res.status(500).json({ error: 'Failed to create invoice' });
    }

    const invoice = invoiceResult[0];

    // Update PO status to INVOICED
    await db.query(
      `UPDATE purchase_orders 
       SET status = 'INVOICED', updated_at = NOW()
       WHERE id = $1`,
      [poId]
    );

    // Log audit trail
    await logInvoiceFlip(poId, invoiceId, req.user?.userId, req.tenantId);
    await logStatusChange('PO', poId, 'STATUS_CHANGE', po.status, 'INVOICED', req.user?.userId, req.tenantId);

    // Trigger notification (stub)
    await notifyPOInvoiced(poId, invoiceId, po.buyer_tenant_id);

    // Emit WebSocket events
    if (req.tenantId) {
      emitToTenant(req.tenantId, WS_EVENTS.P2P_INVOICE_CREATED, invoice);
      emitToTenant(req.tenantId, WS_EVENTS.PURCHASE_ORDER_UPDATED, { id: poId, status: 'INVOICED' });
    }

    res.status(201).json(invoice);
  } catch (error: any) {
    console.error('Error flipping PO to invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice from PO' });
  }
});

/**
 * PUT /api/p2p-invoices/:id/approve
 * Buyer approves invoice
 */
router.put('/:id/approve', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { reason } = req.body;

    // Get invoice
    const invoiceResult = await db.query(
      'SELECT * FROM p2p_invoices WHERE id = $1 AND buyer_tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!invoiceResult || invoiceResult.length === 0) {
      return res.status(404).json({ error: 'Invoice not found or unauthorized' });
    }

    const invoice = invoiceResult[0];

    // Validate invoice status allows approval
    try {
      validateInvoiceTransition(invoice.status, 'APPROVED' as any);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    // Update status to APPROVED
    const now = new Date().toISOString();
    const result = await db.query(
      `UPDATE p2p_invoices 
       SET status = 'APPROVED', reviewed_by = $1, reviewed_at = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [req.user?.userId || null, now, req.params.id]
    );

    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Failed to approve invoice' });
    }

    const updatedInvoice = result[0];

    // Log audit trail
    if (req.tenantId) {
      await logStatusChange('INVOICE', req.params.id, 'APPROVED', invoice.status, 'APPROVED', req.user?.userId, req.tenantId, reason);

      // Emit WebSocket event
      emitToTenant(req.tenantId, WS_EVENTS.P2P_INVOICE_UPDATED, updatedInvoice);
    }

    res.json(updatedInvoice);
  } catch (error: any) {
    console.error('Error approving invoice:', error);
    res.status(500).json({ error: 'Failed to approve invoice' });
  }
});

/**
 * PUT /api/p2p-invoices/:id/reject
 * Buyer rejects invoice
 */
router.put('/:id/reject', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // Get invoice
    const invoiceResult = await db.query(
      'SELECT * FROM p2p_invoices WHERE id = $1 AND buyer_tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!invoiceResult || invoiceResult.length === 0) {
      return res.status(404).json({ error: 'Invoice not found or unauthorized' });
    }

    const invoice = invoiceResult[0];

    // Validate invoice status allows rejection
    try {
      validateInvoiceTransition(invoice.status, 'REJECTED' as any);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    // Update status to REJECTED
    const now = new Date().toISOString();
    const result = await db.query(
      `UPDATE p2p_invoices 
       SET status = 'REJECTED', reviewed_by = $1, reviewed_at = $2, rejected_reason = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [req.user?.userId || null, now, reason, req.params.id]
    );

    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Failed to reject invoice' });
    }

    const updatedInvoice = result[0];

    // Log audit trail
    if (req.tenantId) {
      await logStatusChange('INVOICE', req.params.id, 'REJECTED', invoice.status, 'REJECTED', req.user?.userId, req.tenantId, reason);

      // Emit WebSocket event
      emitToTenant(req.tenantId, WS_EVENTS.P2P_INVOICE_UPDATED, updatedInvoice);
    }

    res.json(updatedInvoice);
  } catch (error: any) {
    console.error('Error rejecting invoice:', error);
    res.status(500).json({ error: 'Failed to reject invoice' });
  }
});

export default router;

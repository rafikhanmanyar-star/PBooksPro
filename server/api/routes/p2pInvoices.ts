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
 * Returns invoices where:
 *   - buyer_tenant_id matches (invoices for POs this tenant created as buyer)
 *   - OR supplier_tenant_id matches (invoices this tenant created as supplier)
 */
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, poId } = req.query;

    let query = `
      SELECT 
        inv.id,
        inv.invoice_number as "invoiceNumber",
        inv.po_id as "poId",
        inv.buyer_tenant_id as "buyerTenantId",
        inv.supplier_tenant_id as "supplierTenantId",
        inv.amount,
        inv.status,
        inv.items,
        inv.reviewed_by as "reviewedBy",
        inv.reviewed_at as "reviewedAt",
        inv.rejected_reason as "rejectedReason",
        inv.tenant_id as "tenantId",
        inv.user_id as "userId",
        inv.created_at as "createdAt",
        inv.updated_at as "updatedAt",
        po.po_number as "poNumber"
      FROM p2p_invoices inv
      LEFT JOIN purchase_orders po ON inv.po_id = po.id
      WHERE (inv.buyer_tenant_id = $1 OR inv.supplier_tenant_id = $1)
    `;
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND inv.status = $${paramIndex++}`;
      params.push(status);
    }

    if (poId) {
      query += ` AND inv.po_id = $${paramIndex++}`;
      params.push(poId);
    }

    query += ' ORDER BY inv.created_at DESC';

    const invoices = await db.query(query, params);
    // Parse numeric fields and JSON items
    const parsedInvoices = invoices.map((inv: any) => ({
      ...inv,
      amount: parseFloat(inv.amount) || 0,
      items: typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items
    }));
    res.json(parsedInvoices);
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
      `SELECT 
        inv.id,
        inv.invoice_number as "invoiceNumber",
        inv.po_id as "poId",
        inv.buyer_tenant_id as "buyerTenantId",
        inv.supplier_tenant_id as "supplierTenantId",
        inv.amount,
        inv.status,
        inv.items,
        inv.reviewed_by as "reviewedBy",
        inv.reviewed_at as "reviewedAt",
        inv.rejected_reason as "rejectedReason",
        inv.tenant_id as "tenantId",
        inv.user_id as "userId",
        inv.created_at as "createdAt",
        inv.updated_at as "updatedAt",
        po.po_number as "poNumber"
      FROM p2p_invoices inv
      LEFT JOIN purchase_orders po ON inv.po_id = po.id
      WHERE inv.id = $1 AND (inv.buyer_tenant_id = $2 OR inv.supplier_tenant_id = $2)`,
      [req.params.id, req.tenantId]
    );

    if (!invoice || invoice.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Parse numeric fields and JSON items
    const parsedInvoice = {
      ...invoice[0],
      amount: parseFloat(invoice[0].amount) || 0,
      items: typeof invoice[0].items === 'string' ? JSON.parse(invoice[0].items) : invoice[0].items
    };
    res.json(parsedInvoice);
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
      RETURNING 
        id,
        invoice_number as "invoiceNumber",
        po_id as "poId",
        buyer_tenant_id as "buyerTenantId",
        supplier_tenant_id as "supplierTenantId",
        amount,
        status,
        items,
        reviewed_by as "reviewedBy",
        reviewed_at as "reviewedAt",
        rejected_reason as "rejectedReason",
        tenant_id as "tenantId",
        user_id as "userId",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
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

    // Parse numeric fields and JSON items
    const invoice = {
      ...invoiceResult[0],
      amount: parseFloat(invoiceResult[0].amount) || 0,
      items: typeof invoiceResult[0].items === 'string' ? JSON.parse(invoiceResult[0].items) : invoiceResult[0].items
    };

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

    // Emit WebSocket events to supplier
    if (req.tenantId) {
      emitToTenant(req.tenantId, WS_EVENTS.P2P_INVOICE_CREATED, invoice);
      emitToTenant(req.tenantId, WS_EVENTS.PURCHASE_ORDER_UPDATED, { id: poId, status: 'INVOICED' });
    }

    // Also emit to buyer so their dashboard updates
    if (po.buyer_tenant_id && po.buyer_tenant_id !== req.tenantId) {
      emitToTenant(po.buyer_tenant_id, WS_EVENTS.P2P_INVOICE_CREATED, invoice);
      emitToTenant(po.buyer_tenant_id, WS_EVENTS.PURCHASE_ORDER_UPDATED, { id: poId, status: 'INVOICED' });
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
 * When approved, automatically creates a bill in the buyer's project bills section with UNPAID status
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

    // Get the PO to fetch project_id and supplier information
    const poResult = await db.query(
      'SELECT po.*, t.name as supplier_name, t.company_name as supplier_company_name FROM purchase_orders po LEFT JOIN tenants t ON po.supplier_tenant_id = t.id WHERE po.id = $1',
      [invoice.po_id]
    );

    const po = poResult && poResult.length > 0 ? poResult[0] : null;

    // Update status to APPROVED
    const now = new Date().toISOString();
    const result = await db.query(
      `UPDATE p2p_invoices 
       SET status = 'APPROVED', reviewed_by = $1, reviewed_at = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING 
        id,
        invoice_number as "invoiceNumber",
        po_id as "poId",
        buyer_tenant_id as "buyerTenantId",
        supplier_tenant_id as "supplierTenantId",
        amount,
        status,
        items,
        reviewed_by as "reviewedBy",
        reviewed_at as "reviewedAt",
        rejected_reason as "rejectedReason",
        tenant_id as "tenantId",
        user_id as "userId",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [req.user?.userId || null, now, req.params.id]
    );

    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Failed to approve invoice' });
    }

    // Parse numeric fields and JSON items
    const updatedInvoice = {
      ...result[0],
      amount: parseFloat(result[0].amount) || 0,
      items: typeof result[0].items === 'string' ? JSON.parse(result[0].items) : result[0].items
    };

    // Create a bill in the buyer's bills table with UNPAID status
    let createdBill = null;
    try {
      // Get supplier information from registered_suppliers table (created during registration approval)
      const registeredSupplierResult = await db.query(
        `SELECT * FROM registered_suppliers 
         WHERE buyer_tenant_id = $1 AND supplier_tenant_id = $2 AND status = 'ACTIVE'`,
        [req.tenantId, invoice.supplier_tenant_id]
      );
      
      const registeredSupplier = registeredSupplierResult && registeredSupplierResult.length > 0 
        ? registeredSupplierResult[0] 
        : null;
      
      // Get supplier name and company from registered_suppliers or fallback to PO/tenant info
      const supplierCompany = registeredSupplier?.supplier_company || po?.supplier_company_name || 'Supplier';
      const supplierName = registeredSupplier?.supplier_name || po?.supplier_name || supplierCompany;
      const supplierContactNo = registeredSupplier?.supplier_contact_no || '';
      const supplierAddress = registeredSupplier?.supplier_address || '';
      
      // Find existing contact in vendor directory by matching company name or supplier tenant ID
      let contactId = null;
      
      // First try to find by company name (exact match first)
      let existingContact = await db.query(
        `SELECT id FROM contacts WHERE tenant_id = $1 AND contact_type = 'Vendor' AND company_name = $2 LIMIT 1`,
        [req.tenantId, supplierCompany]
      );
      
      // If not found, try partial match
      if (!existingContact || existingContact.length === 0) {
        existingContact = await db.query(
          `SELECT id FROM contacts WHERE tenant_id = $1 AND contact_type = 'Vendor' AND (name ILIKE $2 OR company_name ILIKE $2) LIMIT 1`,
          [req.tenantId, `%${supplierCompany}%`]
        );
      }
      
      if (existingContact && existingContact.length > 0) {
        contactId = existingContact[0].id;
      } else {
        // Create a new contact for this supplier using registered supplier info
        const newContactId = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.query(
          `INSERT INTO contacts (id, name, company_name, phone, address, contact_type, tenant_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'Vendor', $6, NOW(), NOW())`,
          [newContactId, supplierName, supplierCompany, supplierContactNo, supplierAddress, req.tenantId]
        );
        contactId = newContactId;
        console.log(`Created new vendor contact for supplier: ${supplierCompany} (${newContactId})`);
      }

      // Generate bill number
      const billNumber = `BILL-${invoice.invoice_number}`;
      const billId = `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Calculate due date (Net 30 from approval date by default)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      // Get category from PO items if available
      const items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : invoice.items;
      const categoryId = items && items.length > 0 && items[0].categoryId ? items[0].categoryId : null;

      // Build description with PO number
      const poNumber = po?.po_number || 'N/A';
      const billDescription = `PO: ${poNumber} | Invoice: ${invoice.invoice_number} | Vendor: ${supplierCompany}`;

      // Create bill in bills table
      const billResult = await db.query(
        `INSERT INTO bills (
          id, tenant_id, bill_number, contact_id, amount, paid_amount, status,
          issue_date, due_date, description, category_id, project_id,
          user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING *`,
        [
          billId,
          req.tenantId,
          billNumber,
          contactId,
          parseFloat(invoice.amount) || 0,
          0, // paid_amount starts at 0
          'Unpaid', // UNPAID status
          now.split('T')[0], // issue_date is today
          dueDateStr,
          billDescription,
          categoryId,
          po?.project_id || null, // Link to project from PO
          req.user?.userId || null
        ]
      );

      if (billResult && billResult.length > 0) {
        createdBill = billResult[0];
        console.log(`Bill created from approved invoice: ${billNumber}, Project: ${po?.project_id || 'None'}, Vendor: ${supplierCompany}`);
        
        // Emit WebSocket event for the new bill
        emitToTenant(req.tenantId!, WS_EVENTS.BILL_CREATED, {
          bill: createdBill,
          userId: req.user?.userId,
          source: 'p2p_invoice_approval'
        });
      }
    } catch (billError: any) {
      console.error('Error creating bill from approved invoice:', billError);
      // Don't fail the invoice approval if bill creation fails
      // The invoice is already approved
    }

    // Log audit trail
    if (req.tenantId) {
      await logStatusChange('INVOICE', req.params.id, 'APPROVED', invoice.status, 'APPROVED', req.user?.userId, req.tenantId, reason);

      // Emit WebSocket event to buyer
      emitToTenant(req.tenantId, WS_EVENTS.P2P_INVOICE_UPDATED, updatedInvoice);
    }

    // Also emit to supplier so their portal updates
    if (invoice.supplier_tenant_id && invoice.supplier_tenant_id !== req.tenantId) {
      emitToTenant(invoice.supplier_tenant_id, WS_EVENTS.P2P_INVOICE_UPDATED, updatedInvoice);
    }

    // Return the invoice with bill info if created
    res.json({
      ...updatedInvoice,
      billCreated: !!createdBill,
      billId: createdBill?.id,
      billNumber: createdBill?.bill_number
    });
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
       RETURNING 
        id,
        invoice_number as "invoiceNumber",
        po_id as "poId",
        buyer_tenant_id as "buyerTenantId",
        supplier_tenant_id as "supplierTenantId",
        amount,
        status,
        items,
        reviewed_by as "reviewedBy",
        reviewed_at as "reviewedAt",
        rejected_reason as "rejectedReason",
        tenant_id as "tenantId",
        user_id as "userId",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [req.user?.userId || null, now, reason, req.params.id]
    );

    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Failed to reject invoice' });
    }

    // Parse numeric fields and JSON items
    const updatedInvoice = {
      ...result[0],
      amount: parseFloat(result[0].amount) || 0,
      items: typeof result[0].items === 'string' ? JSON.parse(result[0].items) : result[0].items
    };

    // Log audit trail
    if (req.tenantId) {
      await logStatusChange('INVOICE', req.params.id, 'REJECTED', invoice.status, 'REJECTED', req.user?.userId, req.tenantId, reason);

      // Emit WebSocket event to buyer
      emitToTenant(req.tenantId, WS_EVENTS.P2P_INVOICE_UPDATED, updatedInvoice);
    }

    // Also emit to supplier so their portal updates
    if (invoice.supplier_tenant_id && invoice.supplier_tenant_id !== req.tenantId) {
      emitToTenant(invoice.supplier_tenant_id, WS_EVENTS.P2P_INVOICE_UPDATED, updatedInvoice);
    }

    res.json(updatedInvoice);
  } catch (error: any) {
    console.error('Error rejecting invoice:', error);
    res.status(500).json({ error: 'Failed to reject invoice' });
  }
});

export default router;

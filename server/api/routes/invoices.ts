import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all invoices
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, invoiceType, projectId } = req.query;
    
    let query = 'SELECT * FROM invoices WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (invoiceType) {
      query += ` AND invoice_type = $${paramIndex++}`;
      params.push(invoiceType);
    }
    if (projectId) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }

    query += ' ORDER BY issue_date DESC';

    const invoices = await db.query(query, params);
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET invoice by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const invoices = await db.query(
      'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json(invoices[0]);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// POST create/update invoice (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const invoice = req.body;
    
    // Validate required fields
    if (!invoice.invoiceNumber) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Invoice number is required'
      });
    }
    
    // Generate ID if not provided
    const invoiceId = invoice.id || `invoice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if invoice with this ID already exists and belongs to a different tenant
    if (invoice.id) {
      const existingInvoice = await db.query(
        'SELECT tenant_id FROM invoices WHERE id = $1',
        [invoiceId]
      );
      
      if (existingInvoice.length > 0 && existingInvoice[0].tenant_id !== req.tenantId) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'An invoice with this ID already exists in another organization'
        });
      }
    }
    
    // Check if invoice exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id FROM invoices WHERE id = $1 AND tenant_id = $2',
      [invoiceId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO invoices (
        id, tenant_id, invoice_number, contact_id, amount, paid_amount, status,
        issue_date, due_date, invoice_type, description, project_id, building_id,
        property_id, unit_id, category_id, agreement_id, security_deposit_charge,
        service_charges, rental_month, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                COALESCE((SELECT created_at FROM invoices WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        contact_id = EXCLUDED.contact_id,
        amount = EXCLUDED.amount,
        paid_amount = EXCLUDED.paid_amount,
        status = EXCLUDED.status,
        issue_date = EXCLUDED.issue_date,
        due_date = EXCLUDED.due_date,
        invoice_type = EXCLUDED.invoice_type,
        description = EXCLUDED.description,
        project_id = EXCLUDED.project_id,
        building_id = EXCLUDED.building_id,
        property_id = EXCLUDED.property_id,
        unit_id = EXCLUDED.unit_id,
        category_id = EXCLUDED.category_id,
        agreement_id = EXCLUDED.agreement_id,
        security_deposit_charge = EXCLUDED.security_deposit_charge,
        service_charges = EXCLUDED.service_charges,
        rental_month = EXCLUDED.rental_month,
        updated_at = NOW()
      RETURNING *`,
      [
        invoiceId,
        req.tenantId,
        invoice.invoiceNumber,
        invoice.contactId,
        invoice.amount,
        invoice.paidAmount || 0,
        invoice.status,
        invoice.issueDate,
        invoice.dueDate,
        invoice.invoiceType,
        invoice.description || null,
        invoice.projectId || null,
        invoice.buildingId || null,
        invoice.propertyId || null,
        invoice.unitId || null,
        invoice.categoryId || null,
        invoice.agreementId || null,
        invoice.securityDepositCharge || null,
        invoice.serviceCharges || null,
        invoice.rentalMonth || null
      ]
    );
    const saved = result[0];
    
    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_UPDATED, {
        invoice: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_CREATED, {
        invoice: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }
    
    res.status(isUpdate ? 200 : 201).json(saved);
  } catch (error: any) {
    console.error('Error creating/updating invoice:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Invoice number already exists' });
    }
    res.status(500).json({ error: 'Failed to save invoice' });
  }
});

// PUT update invoice
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const invoice = req.body;
    const result = await db.query(
      `UPDATE invoices 
       SET invoice_number = $1, contact_id = $2, amount = $3, paid_amount = $4, 
           status = $5, issue_date = $6, due_date = $7, invoice_type = $8, 
           description = $9, project_id = $10, building_id = $11, property_id = $12,
           unit_id = $13, category_id = $14, agreement_id = $15, 
           security_deposit_charge = $16, service_charges = $17, rental_month = $18,
           updated_at = NOW()
       WHERE id = $19 AND tenant_id = $20
       RETURNING *`,
      [
        invoice.invoiceNumber,
        invoice.contactId,
        invoice.amount,
        invoice.paidAmount || 0,
        invoice.status,
        invoice.issueDate,
        invoice.dueDate,
        invoice.invoiceType,
        invoice.description || null,
        invoice.projectId || null,
        invoice.buildingId || null,
        invoice.propertyId || null,
        invoice.unitId || null,
        invoice.categoryId || null,
        invoice.agreementId || null,
        invoice.securityDepositCharge || null,
        invoice.serviceCharges || null,
        invoice.rentalMonth || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_UPDATED, {
      invoice: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// DELETE invoice
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM invoices WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_DELETED, {
      invoiceId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

export default router;


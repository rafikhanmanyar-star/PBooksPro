import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

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

// POST create invoice
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const invoice = req.body;
    const result = await db.query(
      `INSERT INTO invoices (
        id, tenant_id, invoice_number, contact_id, amount, paid_amount, status,
        issue_date, due_date, invoice_type, description, project_id, building_id,
        property_id, unit_id, category_id, agreement_id, security_deposit_charge,
        service_charges, rental_month
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        invoice.id,
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
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Invoice number already exists' });
    }
    res.status(500).json({ error: 'Failed to create invoice' });
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
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

export default router;


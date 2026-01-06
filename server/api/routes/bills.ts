import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all bills
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, projectId, categoryId } = req.query;
    
    let query = 'SELECT * FROM bills WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (projectId) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }
    if (categoryId) {
      query += ` AND category_id = $${paramIndex++}`;
      params.push(categoryId);
    }

    query += ' ORDER BY issue_date DESC';

    const bills = await db.query(query, params);
    res.json(bills);
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

// GET bill by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const bills = await db.query(
      'SELECT * FROM bills WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (bills.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    res.json(bills[0]);
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
});

// POST create/update bill (upsert)
router.post('/', async (req: TenantRequest, res) => {
  const bill = req.body; // Declare outside try block so it's accessible in catch
  try {
    const db = getDb();
    
    // Validate required fields
    if (!bill.billNumber) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Bill number is required'
      });
    }
    
    // Generate ID if not provided
    const billId = bill.id || `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if bill with this ID already exists and belongs to a different tenant
    if (bill.id) {
      const existingBill = await db.query(
        'SELECT tenant_id FROM bills WHERE id = $1',
        [billId]
      );
      
      if (existingBill.length > 0 && existingBill[0].tenant_id !== req.tenantId) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'A bill with this ID already exists in another organization'
        });
      }
    }
    
    // Check if bill exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id FROM bills WHERE id = $1 AND tenant_id = $2',
      [billId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Check if bill number already exists for this tenant (only for new bills or when bill number is being changed)
    if (!isUpdate || (isUpdate && existing[0].bill_number !== bill.billNumber)) {
      const duplicateBill = await db.query(
        'SELECT id FROM bills WHERE bill_number = $1 AND tenant_id = $2 AND id != $3',
        [bill.billNumber, req.tenantId, billId]
      );
      
      if (duplicateBill.length > 0) {
        return res.status(400).json({ 
          error: 'Bill number already exists',
          message: `A bill with number "${bill.billNumber}" already exists for this organization.`
        });
      }
    }
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO bills (
        id, tenant_id, bill_number, contact_id, amount, paid_amount, status,
        issue_date, due_date, description, category_id, project_id, building_id,
        property_id, project_agreement_id, contract_id, staff_id,
        expense_category_items, document_path, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 
                COALESCE((SELECT created_at FROM bills WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        bill_number = EXCLUDED.bill_number,
        contact_id = EXCLUDED.contact_id,
        amount = EXCLUDED.amount,
        paid_amount = EXCLUDED.paid_amount,
        status = EXCLUDED.status,
        issue_date = EXCLUDED.issue_date,
        due_date = EXCLUDED.due_date,
        description = EXCLUDED.description,
        category_id = EXCLUDED.category_id,
        project_id = EXCLUDED.project_id,
        building_id = EXCLUDED.building_id,
        property_id = EXCLUDED.property_id,
        project_agreement_id = EXCLUDED.project_agreement_id,
        contract_id = EXCLUDED.contract_id,
        staff_id = EXCLUDED.staff_id,
        expense_category_items = EXCLUDED.expense_category_items,
        document_path = EXCLUDED.document_path,
        updated_at = NOW()
      RETURNING *`,
      [
        billId,
        req.tenantId,
        bill.billNumber,
        bill.contactId,
        bill.amount,
        bill.paidAmount || 0,
        bill.status || 'Unpaid',
        bill.issueDate,
        bill.dueDate || null,
        bill.description || null,
        bill.categoryId || null,
        bill.projectId || null,
        bill.buildingId || null,
        bill.propertyId || null,
        bill.projectAgreementId || null,
        bill.contractId || null,
        bill.staffId || null,
        bill.expenseCategoryItems ? JSON.stringify(bill.expenseCategoryItems) : null,
        bill.documentPath || null
      ]
    );
    const saved = result[0];
    
    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      emitToTenant(req.tenantId!, WS_EVENTS.BILL_UPDATED, {
        bill: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      emitToTenant(req.tenantId!, WS_EVENTS.BILL_CREATED, {
        bill: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }
    
    res.status(isUpdate ? 200 : 201).json(saved);
  } catch (error: any) {
    console.error('Error creating/updating bill:', error);
    if (error.code === '23505') { // Unique violation
      // Check if it's a bill_number constraint violation
      if (error.constraint && error.constraint.includes('bill_number')) {
        return res.status(400).json({ 
          error: 'Bill number already exists',
          message: `A bill with number "${bill.billNumber}" already exists. Please use a unique bill number.`
        });
      }
      return res.status(400).json({ 
        error: 'Duplicate entry',
        message: 'A bill with this identifier already exists.'
      });
    }
    res.status(500).json({ error: 'Failed to save bill', message: error.message });
  }
});

// PUT update bill
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const bill = req.body;
    const result = await db.query(
      `UPDATE bills 
       SET bill_number = $1, contact_id = $2, amount = $3, paid_amount = $4, 
           status = $5, issue_date = $6, due_date = $7, description = $8, 
           category_id = $9, project_id = $10, building_id = $11, property_id = $12,
           project_agreement_id = $13, contract_id = $14, staff_id = $15,
           expense_category_items = $16, document_path = $17, updated_at = NOW()
       WHERE id = $18 AND tenant_id = $19
       RETURNING *`,
      [
        bill.billNumber,
        bill.contactId,
        bill.amount,
        bill.paidAmount || 0,
        bill.status || 'Unpaid',
        bill.issueDate,
        bill.dueDate || null,
        bill.description || null,
        bill.categoryId || null,
        bill.projectId || null,
        bill.buildingId || null,
        bill.propertyId || null,
        bill.projectAgreementId || null,
        bill.contractId || null,
        bill.staffId || null,
        bill.expenseCategoryItems ? JSON.stringify(bill.expenseCategoryItems) : null,
        bill.documentPath || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    const saved = result[0];
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.BILL_UPDATED, {
      bill: saved,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    res.json(saved);
  } catch (error) {
    console.error('Error updating bill:', error);
    res.status(500).json({ error: 'Failed to update bill' });
  }
});

// DELETE bill
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM bills WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.BILL_DELETED, {
      billId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting bill:', error);
    res.status(500).json({ error: 'Failed to delete bill' });
  }
});

export default router;


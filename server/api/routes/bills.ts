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

// POST create bill
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const bill = req.body;
    const result = await db.query(
      `INSERT INTO bills (
        id, tenant_id, bill_number, contact_id, amount, paid_amount, status,
        issue_date, due_date, description, category_id, project_id, building_id,
        property_id, project_agreement_id, contract_id, staff_id,
        expense_category_items, document_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        bill.id,
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
    emitToTenant(req.tenantId!, WS_EVENTS.BILL_CREATED, {
      bill: saved,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    res.status(201).json(saved);
  } catch (error: any) {
    console.error('Error creating bill:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Bill number already exists' });
    }
    res.status(500).json({ error: 'Failed to create bill' });
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


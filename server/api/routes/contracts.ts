import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all contracts
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, projectId, vendorId } = req.query;
    
    let query = 'SELECT * FROM contracts WHERE tenant_id = $1';
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
    if (vendorId) {
      query += ` AND vendor_id = $${paramIndex++}`;
      params.push(vendorId);
    }

    query += ' ORDER BY start_date DESC';

    const contracts = await db.query(query, params);
    res.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// GET contract by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const contracts = await db.query(
      'SELECT * FROM contracts WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (contracts.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    res.json(contracts[0]);
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

// POST create contract
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const contract = req.body;
    const result = await db.query(
      `INSERT INTO contracts (
        id, tenant_id, contract_number, name, project_id, vendor_id, total_amount,
        area, rate, start_date, end_date, status, category_ids,
        expense_category_items, terms_and_conditions, payment_terms,
        description, document_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        contract.id,
        req.tenantId,
        contract.contractNumber,
        contract.name,
        contract.projectId,
        contract.vendorId,
        contract.totalAmount,
        contract.area || null,
        contract.rate || null,
        contract.startDate,
        contract.endDate,
        contract.status,
        JSON.stringify(contract.categoryIds || []),
        contract.expenseCategoryItems ? JSON.stringify(contract.expenseCategoryItems) : null,
        contract.termsAndConditions || null,
        contract.paymentTerms || null,
        contract.description || null,
        contract.documentPath || null
      ]
    );
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating contract:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Contract number already exists' });
    }
    res.status(500).json({ error: 'Failed to create contract' });
  }
});

// PUT update contract
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const contract = req.body;
    const result = await db.query(
      `UPDATE contracts 
       SET contract_number = $1, name = $2, project_id = $3, vendor_id = $4,
           total_amount = $5, area = $6, rate = $7, start_date = $8, end_date = $9,
           status = $10, category_ids = $11, expense_category_items = $12,
           terms_and_conditions = $13, payment_terms = $14, description = $15,
           document_path = $16, updated_at = NOW()
       WHERE id = $17 AND tenant_id = $18
       RETURNING *`,
      [
        contract.contractNumber,
        contract.name,
        contract.projectId,
        contract.vendorId,
        contract.totalAmount,
        contract.area || null,
        contract.rate || null,
        contract.startDate,
        contract.endDate,
        contract.status,
        JSON.stringify(contract.categoryIds || []),
        contract.expenseCategoryItems ? JSON.stringify(contract.expenseCategoryItems) : null,
        contract.termsAndConditions || null,
        contract.paymentTerms || null,
        contract.description || null,
        contract.documentPath || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating contract:', error);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

// DELETE contract
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM contracts WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting contract:', error);
    res.status(500).json({ error: 'Failed to delete contract' });
  }
});

export default router;


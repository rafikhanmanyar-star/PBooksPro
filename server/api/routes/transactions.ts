import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all transactions (automatically filtered by tenant via RLS)
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { projectId, startDate, endDate, type, limit, offset } = req.query;
    
    let query = 'SELECT * FROM transactions WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (projectId) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }
    if (startDate) {
      query += ` AND date >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND date <= $${paramIndex++}`;
      params.push(endDate);
    }
    if (type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(type);
    }

    query += ' ORDER BY date DESC';

    if (limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(parseInt(limit as string));
    }
    if (offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(parseInt(offset as string));
    }

    const transactions = await db.query(query, params);
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET single transaction
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const transactions = await db.query(
      'SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (transactions.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(transactions[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// POST create transaction
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const transaction = req.body;
    const query = `
      INSERT INTO transactions (
        id, tenant_id, type, amount, date, description, account_id, 
        category_id, contact_id, project_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const result = await db.query(query, [
      transaction.id,
      req.tenantId,
      transaction.type,
      transaction.amount,
      transaction.date,
      transaction.description,
      transaction.accountId,
      transaction.categoryId,
      transaction.contactId,
      transaction.projectId,
    ]);
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT update transaction
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const transaction = req.body;
    const query = `
      UPDATE transactions 
      SET type = $1, amount = $2, date = $3, description = $4, 
          account_id = $5, category_id = $6, contact_id = $7, project_id = $8,
          updated_at = NOW()
      WHERE id = $9 AND tenant_id = $10
      RETURNING *
    `;
    const result = await db.query(query, [
      transaction.type,
      transaction.amount,
      transaction.date,
      transaction.description,
      transaction.accountId,
      transaction.categoryId,
      transaction.contactId,
      transaction.projectId,
      req.params.id,
      req.tenantId
    ]);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE transaction
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM transactions WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;


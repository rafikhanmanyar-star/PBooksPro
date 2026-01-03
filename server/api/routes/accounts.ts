import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all accounts
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const accounts = await db.query(
      'SELECT * FROM accounts WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// POST create account
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const account = req.body;
    const result = await db.query(
      `INSERT INTO accounts (
        id, tenant_id, name, type, balance, description, parent_account_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        account.id,
        req.tenantId,
        account.name,
        account.type,
        account.balance || 0,
        account.description,
        account.parentAccountId
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PUT update account
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const account = req.body;
    const result = await db.query(
      `UPDATE accounts 
       SET name = $1, type = $2, balance = $3, description = $4, 
           parent_account_id = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [
        account.name,
        account.type,
        account.balance,
        account.description,
        account.parentAccountId,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE account
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM accounts WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;


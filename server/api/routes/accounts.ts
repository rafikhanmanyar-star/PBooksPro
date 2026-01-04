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

// POST create/update account (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    console.log('📥 POST /accounts - Request received:', {
      tenantId: req.tenantId,
      accountData: {
        id: req.body.id,
        name: req.body.name,
        type: req.body.type
      }
    });
    
    const db = getDb();
    const account = req.body;
    
    // Generate ID if not provided
    const accountId = account.id || `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /accounts - Using account ID:', accountId);
    
    // Use transaction for data integrity (upsert behavior)
    const result = await db.transaction(async (client) => {
      // Check if account with this ID already exists
      const existing = await client.query(
        'SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2',
        [accountId, req.tenantId]
      );
      
      if (existing.rows.length > 0) {
        // Update existing account
        console.log('🔄 POST /accounts - Updating existing account:', accountId);
        const updateResult = await client.query(
          `UPDATE accounts 
           SET name = $1, type = $2, balance = $3, description = $4, 
               parent_account_id = $5, updated_at = NOW()
           WHERE id = $6 AND tenant_id = $7
           RETURNING *`,
          [
            account.name,
            account.type,
            account.balance || 0,
            account.description || null,
            account.parentAccountId || null,
            accountId,
            req.tenantId
          ]
        );
        return updateResult.rows[0];
      } else {
        // Create new account
        console.log('➕ POST /accounts - Creating new account:', accountId);
        const insertResult = await client.query(
          `INSERT INTO accounts (
            id, tenant_id, name, type, balance, description, parent_account_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          RETURNING *`,
          [
            accountId,
            req.tenantId,
            account.name,
            account.type,
            account.balance || 0,
            account.description || null,
            account.parentAccountId || null
          ]
        );
        return insertResult.rows[0];
      }
    });
    
    if (!result) {
      console.error('❌ POST /accounts - Transaction returned no result');
      return res.status(500).json({ error: 'Failed to create/update account' });
    }
    
    console.log('✅ POST /accounts - Account saved successfully:', {
      id: result.id,
      name: result.name,
      tenantId: req.tenantId
    });
    
    res.status(201).json(result);
  } catch (error: any) {
    console.error('❌ POST /accounts - Error:', {
      error: error,
      errorMessage: error.message,
      errorCode: error.code,
      tenantId: req.tenantId,
      accountId: req.body?.id
    });
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: 'Duplicate account',
        message: 'An account with this ID already exists'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create/update account',
      message: error.message || 'Internal server error'
    });
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


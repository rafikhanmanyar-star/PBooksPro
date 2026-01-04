import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Helper function to log transaction audit
async function logTransactionAudit(
  db: any,
  tenantId: string,
  userId: string,
  userName: string,
  userRole: string,
  action: string,
  transactionId: string | null,
  transactionData: any,
  oldValues: any = null,
  req: any
) {
  try {
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(
      `INSERT INTO transaction_audit_log (
        id, tenant_id, transaction_id, user_id, user_name, user_role, action,
        transaction_type, amount, description, old_values, new_values, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        auditId,
        tenantId,
        transactionId,
        userId,
        userName,
        userRole,
        action,
        transactionData?.type || null,
        transactionData?.amount || null,
        transactionData?.description || null,
        oldValues ? JSON.stringify(oldValues) : null,
        transactionData ? JSON.stringify(transactionData) : null,
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown'
      ]
    );
  } catch (error) {
    console.error('Error logging transaction audit:', error);
    // Don't throw - audit logging should not break the main operation
  }
}

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
    
    // Log view action for audit (optional - can be disabled for performance)
    // if (req.user && transactions.length > 0) {
    //   await logTransactionAudit(
    //     db,
    //     req.tenantId!,
    //     req.user.userId,
    //     req.user.username || 'Unknown',
    //     req.user.role || 'Unknown',
    //     'VIEW',
    //     null,
    //     { count: transactions.length },
    //     null,
    //     req
    //   );
    // }
    
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
    
    // Log audit entry
    if (req.user) {
      await logTransactionAudit(
        db,
        req.tenantId!,
        req.user.userId,
        req.user.username || 'Unknown',
        req.user.role || 'Unknown',
        'CREATE',
        result[0].id,
        result[0],
        null,
        req
      );
    }
    
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
    
    // Get old values for audit log
    const oldTransaction = await db.query(
      'SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (oldTransaction.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
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
    
    // Log audit entry
    if (req.user) {
      await logTransactionAudit(
        db,
        req.tenantId!,
        req.user.userId,
        req.user.username || 'Unknown',
        req.user.role || 'Unknown',
        'UPDATE',
        req.params.id,
        result[0],
        oldTransaction[0],
        req
      );
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
    
    // Get transaction data for audit log before deletion
    const oldTransaction = await db.query(
      'SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (oldTransaction.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const result = await db.query(
      'DELETE FROM transactions WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    // Log audit entry
    if (req.user) {
      await logTransactionAudit(
        db,
        req.tenantId!,
        req.user.userId,
        req.user.username || 'Unknown',
        req.user.role || 'Unknown',
        'DELETE',
        req.params.id,
        null,
        oldTransaction[0],
        req
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;


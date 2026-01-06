import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

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

// POST create/update transaction (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    console.log('📥 POST /transactions - Request received:', {
      tenantId: req.tenantId,
      transactionData: {
        id: req.body.id,
        type: req.body.type,
        amount: req.body.amount
      }
    });
    
    const db = getDb();
    const transaction = req.body;
    
    // Generate ID if not provided
    const transactionId = transaction.id || `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /transactions - Using transaction ID:', transactionId);
    
    // Use transaction for data integrity (upsert behavior)
    let wasUpdate = false;
    let oldValues = null;
    const result = await db.transaction(async (client) => {
      // Check if transaction with this ID already exists
      const existing = await client.query(
        'SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2',
        [transactionId, req.tenantId]
      );
      
      if (existing.rows.length > 0) {
        // Update existing transaction
        wasUpdate = true;
        oldValues = existing.rows[0];
        console.log('🔄 POST /transactions - Updating existing transaction:', transactionId);
        const updateResult = await client.query(
          `UPDATE transactions 
           SET type = $1, subtype = $2, amount = $3, date = $4, description = $5, 
               account_id = $6, from_account_id = $7, to_account_id = $8, category_id = $9, 
               contact_id = $10, project_id = $11, building_id = $12, property_id = $13,
               unit_id = $14, invoice_id = $15, bill_id = $16, payslip_id = $17,
               contract_id = $18, agreement_id = $19, batch_id = $20, is_system = $21, updated_at = NOW()
           WHERE id = $22 AND tenant_id = $23
           RETURNING *`,
          [
            transaction.type,
            transaction.subtype || null,
            transaction.amount,
            transaction.date,
            transaction.description || null,
            transaction.accountId || null,
            transaction.fromAccountId || null,
            transaction.toAccountId || null,
            transaction.categoryId || null,
            transaction.contactId || null,
            transaction.projectId || null,
            transaction.buildingId || null,
            transaction.propertyId || null,
            transaction.unitId || null,
            transaction.invoiceId || null,
            transaction.billId || null,
            transaction.payslipId || null,
            transaction.contractId || null,
            transaction.agreementId || null,
            transaction.batchId || null,
            transaction.isSystem || false,
            transactionId,
            req.tenantId
          ]
        );
        return updateResult.rows[0];
      } else {
        // Create new transaction
        console.log('➕ POST /transactions - Creating new transaction:', transactionId);
        const insertResult = await client.query(
          `INSERT INTO transactions (
            id, tenant_id, type, subtype, amount, date, description, account_id, 
            from_account_id, to_account_id, category_id, contact_id, project_id,
            building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
            contract_id, agreement_id, batch_id, is_system, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW())
          RETURNING *`,
          [
            transactionId,
            req.tenantId,
            transaction.type,
            transaction.subtype || null,
            transaction.amount,
            transaction.date,
            transaction.description || null,
            transaction.accountId || null,
            transaction.fromAccountId || null,
            transaction.toAccountId || null,
            transaction.categoryId || null,
            transaction.contactId || null,
            transaction.projectId || null,
            transaction.buildingId || null,
            transaction.propertyId || null,
            transaction.unitId || null,
            transaction.invoiceId || null,
            transaction.billId || null,
            transaction.payslipId || null,
            transaction.contractId || null,
            transaction.agreementId || null,
            transaction.batchId || null,
            transaction.isSystem || false
          ]
        );
        return insertResult.rows[0];
      }
    });
    
    if (!result) {
      console.error('❌ POST /transactions - Transaction returned no result');
      return res.status(500).json({ error: 'Failed to create/update transaction' });
    }
    
    // Log audit entry
    if (req.user) {
      await logTransactionAudit(
        db,
        req.tenantId!,
        req.user.userId,
        req.user.username || 'Unknown',
        req.user.role || 'Unknown',
        wasUpdate ? 'UPDATE' : 'CREATE',
        result.id,
        result,
        oldValues,
        req
      );
    }
    
    // Update bill's paid_amount if this transaction is linked to a bill
    if (result.bill_id) {
      try {
        // Calculate total paid amount from all transactions for this bill
        const billTransactions = await db.query(
          'SELECT SUM(amount) as total_paid FROM transactions WHERE bill_id = $1 AND tenant_id = $2',
          [result.bill_id, req.tenantId]
        );
        const totalPaid = parseFloat(billTransactions[0]?.total_paid || '0');
        
        // Get bill amount to calculate status
        const billData = await db.query(
          'SELECT amount FROM bills WHERE id = $1 AND tenant_id = $2',
          [result.bill_id, req.tenantId]
        );
        
        if (billData.length > 0) {
          const billAmount = parseFloat(billData[0].amount);
          let newStatus = 'Unpaid';
          if (totalPaid >= billAmount - 0.01) {
            newStatus = 'Paid';
          } else if (totalPaid > 0.01) {
            newStatus = 'Partially Paid';
          }
          
          // Update bill's paid_amount and status
          await db.query(
            'UPDATE bills SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4',
            [totalPaid, newStatus, result.bill_id, req.tenantId]
          );
          
          console.log('✅ POST /transactions - Updated bill paid_amount:', {
            billId: result.bill_id,
            totalPaid,
            status: newStatus
          });
        }
      } catch (billUpdateError) {
        // Log error but don't fail the transaction save
        console.error('⚠️ POST /transactions - Failed to update bill paid_amount:', billUpdateError);
      }
    }
    
    // Update invoice's paid_amount if this transaction is linked to an invoice
    if (result.invoice_id) {
      try {
        // Calculate total paid amount from all transactions for this invoice
        const invoiceTransactions = await db.query(
          'SELECT SUM(amount) as total_paid FROM transactions WHERE invoice_id = $1 AND tenant_id = $2',
          [result.invoice_id, req.tenantId]
        );
        const totalPaid = parseFloat(invoiceTransactions[0]?.total_paid || '0');
        
        // Get invoice amount to calculate status
        const invoiceData = await db.query(
          'SELECT amount FROM invoices WHERE id = $1 AND tenant_id = $2',
          [result.invoice_id, req.tenantId]
        );
        
        if (invoiceData.length > 0) {
          const invoiceAmount = parseFloat(invoiceData[0].amount);
          let newStatus = 'Unpaid';
          if (totalPaid >= invoiceAmount - 0.1) {
            newStatus = 'Paid';
          } else if (totalPaid > 0.1) {
            newStatus = 'Partially Paid';
          }
          
          // Update invoice's paid_amount and status
          await db.query(
            'UPDATE invoices SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4',
            [totalPaid, newStatus, result.invoice_id, req.tenantId]
          );
          
          console.log('✅ POST /transactions - Updated invoice paid_amount:', {
            invoiceId: result.invoice_id,
            totalPaid,
            status: newStatus
          });
        }
      } catch (invoiceUpdateError) {
        // Log error but don't fail the transaction save
        console.error('⚠️ POST /transactions - Failed to update invoice paid_amount:', invoiceUpdateError);
      }
    }
    
    console.log('✅ POST /transactions - Transaction saved successfully:', {
      id: result.id,
      type: result.type,
      amount: result.amount,
      tenantId: req.tenantId
    });
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, wasUpdate ? WS_EVENTS.TRANSACTION_UPDATED : WS_EVENTS.TRANSACTION_CREATED, {
      transaction: result,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
    res.status(201).json(result);
  } catch (error: any) {
    console.error('❌ POST /transactions - Error:', {
      error: error,
      errorMessage: error.message,
      errorCode: error.code,
      tenantId: req.tenantId,
      transactionId: req.body?.id
    });
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: 'Duplicate transaction',
        message: 'A transaction with this ID already exists'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create/update transaction',
      message: error.message || 'Internal server error'
    });
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
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.TRANSACTION_UPDATED, {
      transaction: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
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
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.TRANSACTION_DELETED, {
      transactionId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;


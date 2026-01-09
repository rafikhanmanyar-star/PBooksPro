import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// System accounts that can be auto-created if missing
const SYSTEM_ACCOUNTS: { [key: string]: { name: string; type: string; description: string } } = {
  'sys-acc-cash': { name: 'Cash', type: 'Bank', description: 'Default cash account' },
  'sys-acc-ar': { name: 'Accounts Receivable', type: 'Asset', description: 'System account for unpaid invoices' },
  'sys-acc-ap': { name: 'Accounts Payable', type: 'Liability', description: 'System account for unpaid bills and salaries' },
  'sys-acc-equity': { name: 'Owner Equity', type: 'Equity', description: 'System account for owner capital and equity' },
  'sys-acc-clearing': { name: 'Internal Clearing', type: 'Bank', description: 'System account for internal transfers and equity clearing' }
};

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
    
    // Validate required fields
    if (!transaction.type) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Transaction type is required'
      });
    }
    if (!transaction.amount) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Transaction amount is required'
      });
    }
    if (!transaction.date) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Transaction date is required'
      });
    }
    if (!transaction.accountId) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Account ID is required'
      });
    }
    
    // Generate ID if not provided
    const transactionId = transaction.id || `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /transactions - Using transaction ID:', transactionId);
    console.log('📋 POST /transactions - Full transaction data:', JSON.stringify(transaction, null, 2));
    
    // Use transaction for data integrity (upsert behavior)
    let wasUpdate = false;
    let oldValues = null;
    let billLocked = false;
    let invoiceLocked = false;
    
    console.log('🔄 POST /transactions - Starting database transaction');
    const result = await db.transaction(async (client) => {
      console.log('✅ POST /transactions - Transaction client acquired');
      
      // Validate and ensure account exists
      const accountCheck = await client.query(
        'SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2',
        [transaction.accountId, req.tenantId]
      );
      
      if (accountCheck.rows.length === 0) {
        // Check if it's a system account that should be auto-created
        const systemAccount = SYSTEM_ACCOUNTS[transaction.accountId];
        if (systemAccount) {
          // Auto-create system account
          console.log(`🔧 POST /transactions - Auto-creating missing system account: ${transaction.accountId}`);
          await client.query(
            `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 0, TRUE, $5, NOW(), NOW())
             ON CONFLICT (id) DO NOTHING`,
            [transaction.accountId, req.tenantId, systemAccount.name, systemAccount.type, systemAccount.description]
          );
          console.log(`✅ POST /transactions - System account created: ${transaction.accountId}`);
        } else {
          // Not a system account - return error
          throw {
            code: 'ACCOUNT_NOT_FOUND',
            message: `Account with ID "${transaction.accountId}" does not exist. Please select a valid account.`,
            accountId: transaction.accountId
          };
        }
      }
      
      // Validate from_account_id if provided (for transfers)
      if (transaction.fromAccountId) {
        const fromAccountCheck = await client.query(
          'SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2',
          [transaction.fromAccountId, req.tenantId]
        );
        
        if (fromAccountCheck.rows.length === 0) {
          // Check if it's a system account that should be auto-created
          const systemAccount = SYSTEM_ACCOUNTS[transaction.fromAccountId];
          if (systemAccount) {
            // Auto-create system account
            console.log(`🔧 POST /transactions - Auto-creating missing system account (fromAccount): ${transaction.fromAccountId}`);
            await client.query(
              `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 0, TRUE, $5, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING`,
              [transaction.fromAccountId, req.tenantId, systemAccount.name, systemAccount.type, systemAccount.description]
            );
            console.log(`✅ POST /transactions - System account created (fromAccount): ${transaction.fromAccountId}`);
          } else {
            // Not a system account - return error
            throw {
              code: 'ACCOUNT_NOT_FOUND',
              message: `From account with ID "${transaction.fromAccountId}" does not exist. Please select a valid account.`,
              accountId: transaction.fromAccountId
            };
          }
        }
      }
      
      // Validate to_account_id if provided (for transfers)
      if (transaction.toAccountId) {
        const toAccountCheck = await client.query(
          'SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2',
          [transaction.toAccountId, req.tenantId]
        );
        
        if (toAccountCheck.rows.length === 0) {
          // Check if it's a system account that should be auto-created
          const systemAccount = SYSTEM_ACCOUNTS[transaction.toAccountId];
          if (systemAccount) {
            // Auto-create system account
            console.log(`🔧 POST /transactions - Auto-creating missing system account (toAccount): ${transaction.toAccountId}`);
            await client.query(
              `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 0, TRUE, $5, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING`,
              [transaction.toAccountId, req.tenantId, systemAccount.name, systemAccount.type, systemAccount.description]
            );
            console.log(`✅ POST /transactions - System account created (toAccount): ${transaction.toAccountId}`);
          } else {
            // Not a system account - return error
            throw {
              code: 'ACCOUNT_NOT_FOUND',
              message: `To account with ID "${transaction.toAccountId}" does not exist. Please select a valid account.`,
              accountId: transaction.toAccountId
            };
          }
        }
      }
      
      // If transaction is linked to a bill, lock the bill row first to prevent concurrent payments
      if (transaction.billId && !wasUpdate) {
        try {
          console.log('🔒 POST /transactions - Attempting to lock bill:', transaction.billId);
          const billLock = await client.query(
            'SELECT * FROM bills WHERE id = $1 AND tenant_id = $2 FOR UPDATE NOWAIT',
            [transaction.billId, req.tenantId]
          );
          
          if (billLock.rows.length === 0) {
            throw new Error('Bill not found');
          }
          
          billLocked = true;
          const bill = billLock.rows[0];
          const billAmount = parseFloat(bill.amount);
          const currentPaidAmount = parseFloat(bill.paid_amount || '0');
          const paymentAmount = parseFloat(transaction.amount);
          
          // Validate overpayment: Check if payment would exceed bill amount
          if (currentPaidAmount + paymentAmount > billAmount + 0.01) {
            const overpayment = (currentPaidAmount + paymentAmount) - billAmount;
            throw {
              code: 'PAYMENT_OVERPAYMENT',
              message: `Payment amount (${paymentAmount}) would exceed bill amount. Current paid: ${currentPaidAmount}, Bill amount: ${billAmount}, Overpayment: ${overpayment.toFixed(2)}`,
              overpayment: overpayment
            };
          }
          
          console.log('✅ POST /transactions - Bill locked and validated:', {
            billId: transaction.billId,
            currentPaid: currentPaidAmount,
            paymentAmount: paymentAmount,
            billAmount: billAmount
          });
        } catch (lockError: any) {
          if (lockError.code === '55P03' || lockError.code === 'LOCK_NOT_AVAILABLE') {
            // Lock not available - another transaction is processing payment
            throw {
              code: 'BILL_LOCKED',
              message: 'This bill is currently being processed by another user. Please try again in a moment.',
              retryAfter: 1
            };
          }
          if (lockError.code === 'PAYMENT_OVERPAYMENT') {
            throw lockError;
          }
          // Re-throw other errors
          throw lockError;
        }
      }
      
      // If transaction is linked to an invoice, lock the invoice row first
      if (transaction.invoiceId && !wasUpdate) {
        try {
          console.log('🔒 POST /transactions - Attempting to lock invoice:', transaction.invoiceId);
          const invoiceLock = await client.query(
            'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE NOWAIT',
            [transaction.invoiceId, req.tenantId]
          );
          
          if (invoiceLock.rows.length === 0) {
            throw new Error('Invoice not found');
          }
          
          invoiceLocked = true;
          const invoice = invoiceLock.rows[0];
          const invoiceAmount = parseFloat(invoice.amount);
          const currentPaidAmount = parseFloat(invoice.paid_amount || '0');
          const paymentAmount = parseFloat(transaction.amount);
          
          // Validate overpayment for invoice
          if (currentPaidAmount + paymentAmount > invoiceAmount + 0.1) {
            const overpayment = (currentPaidAmount + paymentAmount) - invoiceAmount;
            throw {
              code: 'PAYMENT_OVERPAYMENT',
              message: `Payment amount (${paymentAmount}) would exceed invoice amount. Current paid: ${currentPaidAmount}, Invoice amount: ${invoiceAmount}, Overpayment: ${overpayment.toFixed(2)}`,
              overpayment: overpayment
            };
          }
          
          console.log('✅ POST /transactions - Invoice locked and validated');
        } catch (lockError: any) {
          if (lockError.code === '55P03' || lockError.code === 'LOCK_NOT_AVAILABLE') {
            throw {
              code: 'INVOICE_LOCKED',
              message: 'This invoice is currently being processed by another user. Please try again in a moment.',
              retryAfter: 1
            };
          }
          if (lockError.code === 'PAYMENT_OVERPAYMENT') {
            throw lockError;
          }
          throw lockError;
        }
      }
      
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
               contract_id = $18, agreement_id = $19, batch_id = $20, is_system = $21, 
               user_id = $22, updated_at = NOW()
           WHERE id = $23 AND tenant_id = $24
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
            req.user?.userId || null,
            transactionId,
            req.tenantId
          ]
        );
        return updateResult.rows[0];
      } else {
        // Create new transaction
        console.log('➕ POST /transactions - Creating new transaction:', transactionId);
        console.log('📝 POST /transactions - Insert data:', {
          transactionId,
          tenantId: req.tenantId,
          type: transaction.type,
          amount: transaction.amount,
          billId: transaction.billId
        });
        
        const insertResult = await client.query(
          `INSERT INTO transactions (
            id, tenant_id, user_id, type, subtype, amount, date, description, account_id, 
            from_account_id, to_account_id, category_id, contact_id, project_id,
            building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
            contract_id, agreement_id, batch_id, is_system, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW())
          RETURNING *`,
          [
            transactionId,
            req.tenantId,
            req.user?.userId || null,
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
        
        console.log('✅ POST /transactions - Transaction inserted successfully:', {
          id: insertResult.rows[0]?.id,
          rowCount: insertResult.rowCount
        });
        
        // If bill is locked, update it within the same transaction
        if (billLocked && transaction.billId) {
          // Recalculate total paid amount from all transactions for this bill
          const billTransactions = await client.query(
            'SELECT SUM(amount) as total_paid FROM transactions WHERE bill_id = $1 AND tenant_id = $2',
            [transaction.billId, req.tenantId]
          );
          const totalPaid = parseFloat(billTransactions.rows[0]?.total_paid || '0');
          
          // Get bill amount to calculate status
          const billData = await client.query(
            'SELECT amount FROM bills WHERE id = $1 AND tenant_id = $2',
            [transaction.billId, req.tenantId]
          );
          
          if (billData.rows.length > 0) {
            const billAmount = parseFloat(billData.rows[0].amount);
            let newStatus = 'Unpaid';
            if (totalPaid >= billAmount - 0.01) {
              newStatus = 'Paid';
            } else if (totalPaid > 0.01) {
              newStatus = 'Partially Paid';
            }
            
            // Update bill (row is already locked via FOR UPDATE NOWAIT)
            const updatedBill = await client.query(
              `UPDATE bills 
               SET paid_amount = $1, status = $2, updated_at = NOW() 
               WHERE id = $3 AND tenant_id = $4
               RETURNING *`,
              [totalPaid, newStatus, transaction.billId, req.tenantId]
            );
            
            console.log('✅ POST /transactions - Updated bill within transaction:', {
              billId: transaction.billId,
              totalPaid,
              status: newStatus
            });
          }
        }
        
        // If invoice is locked, update it within the same transaction
        if (invoiceLocked && transaction.invoiceId) {
          const invoiceTransactions = await client.query(
            'SELECT SUM(amount) as total_paid FROM transactions WHERE invoice_id = $1 AND tenant_id = $2',
            [transaction.invoiceId, req.tenantId]
          );
          const totalPaid = parseFloat(invoiceTransactions.rows[0]?.total_paid || '0');
          
          const invoiceData = await client.query(
            'SELECT amount FROM invoices WHERE id = $1 AND tenant_id = $2',
            [transaction.invoiceId, req.tenantId]
          );
          
          if (invoiceData.rows.length > 0) {
            const invoiceAmount = parseFloat(invoiceData.rows[0].amount);
            let newStatus = 'Unpaid';
            if (totalPaid >= invoiceAmount - 0.1) {
              newStatus = 'Paid';
            } else if (totalPaid > 0.1) {
              newStatus = 'Partially Paid';
            }
            
            await client.query(
              'UPDATE invoices SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4',
              [totalPaid, newStatus, transaction.invoiceId, req.tenantId]
            );
            
            console.log('✅ POST /transactions - Updated invoice within transaction');
          }
        }
        
        const insertedTransaction = insertResult.rows[0];
        console.log('✅ POST /transactions - Returning inserted transaction:', {
          id: insertedTransaction?.id,
          type: insertedTransaction?.type,
          amount: insertedTransaction?.amount
        });
        return insertedTransaction;
      }
    });
    
    console.log('✅ POST /transactions - Transaction completed, result:', {
      hasResult: !!result,
      resultId: result?.id,
      resultType: result?.type
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
    // Note: For new transactions, bill is already updated within the transaction above
    // This section only handles updates to existing transactions or when bill wasn't locked
    if (result.bill_id && wasUpdate) {
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
          const updatedBill = await db.query(
            'UPDATE bills SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING *',
            [totalPaid, newStatus, result.bill_id, req.tenantId]
          );
          
          console.log('✅ POST /transactions - Updated bill paid_amount:', {
            billId: result.bill_id,
            totalPaid,
            status: newStatus
          });
          
          // Emit WebSocket event to notify other users of bill update
          if (updatedBill.length > 0) {
            emitToTenant(req.tenantId!, WS_EVENTS.BILL_UPDATED, {
              bill: updatedBill[0],
              userId: req.user?.userId,
              username: req.user?.username,
            });
          }
        }
      } catch (billUpdateError) {
        // Log error but don't fail the transaction save
        console.error('⚠️ POST /transactions - Failed to update bill paid_amount:', billUpdateError);
      }
    } else if (result.bill_id && !wasUpdate) {
      // For new transactions, bill was updated in transaction, just fetch and emit event
      try {
        const updatedBill = await db.query(
          'SELECT * FROM bills WHERE id = $1 AND tenant_id = $2',
          [result.bill_id, req.tenantId]
        );
        
        if (updatedBill.length > 0) {
          emitToTenant(req.tenantId!, WS_EVENTS.BILL_UPDATED, {
            bill: updatedBill[0],
            userId: req.user?.userId,
            username: req.user?.username,
          });
        }
      } catch (error) {
        console.error('⚠️ POST /transactions - Failed to fetch updated bill:', error);
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
          
          // Get full invoice data to ensure we have all required fields for upsert
          const fullInvoiceData = await db.query(
            'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
            [result.invoice_id, req.tenantId]
          );
          
          if (fullInvoiceData.length > 0) {
            // Invoice exists - update it
            const invoice = fullInvoiceData[0];
            const updatedInvoice = await db.query(
              `UPDATE invoices 
               SET paid_amount = $1, status = $2, updated_at = NOW() 
               WHERE id = $3 AND tenant_id = $4 
               RETURNING *`,
              [totalPaid, newStatus, result.invoice_id, req.tenantId]
            );
            
            console.log('✅ POST /transactions - Updated invoice paid_amount:', {
              invoiceId: result.invoice_id,
              totalPaid,
              status: newStatus
            });
            
            // Emit WebSocket event to notify other users of invoice update
            if (updatedInvoice.length > 0) {
              emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_UPDATED, {
                invoice: updatedInvoice[0],
                userId: req.user?.userId,
                username: req.user?.username,
              });
            }
          } else {
            // Invoice doesn't exist in cloud DB yet - this shouldn't happen but log it
            console.warn('⚠️ POST /transactions - Invoice not found in cloud DB for paid_amount update:', {
              invoiceId: result.invoice_id,
              tenantId: req.tenantId
            });
            // The invoice will be synced when the frontend syncs it
          }
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
    
    // Handle specific error codes
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: 'Duplicate transaction',
        message: 'A transaction with this ID already exists'
      });
    }
    
    if (error.code === 'BILL_LOCKED' || error.code === 'INVOICE_LOCKED') {
      return res.status(409).json({ 
        error: 'Concurrent modification',
        message: error.message,
        code: error.code,
        retryAfter: error.retryAfter
      });
    }
    
    if (error.code === 'PAYMENT_OVERPAYMENT') {
      return res.status(400).json({ 
        error: 'Overpayment detected',
        message: error.message,
        code: error.code,
        overpayment: error.overpayment
      });
    }
    
    if (error.code === 'ACCOUNT_NOT_FOUND') {
      return res.status(400).json({ 
        error: 'Account not found',
        message: error.message,
        code: error.code,
        accountId: error.accountId
      });
    }
    
    if (error.code === 'BILL_VERSION_MISMATCH') {
      return res.status(409).json({ 
        error: 'Concurrent modification',
        message: error.message,
        code: error.code
      });
    }
    
    // Handle foreign key constraint violations
    if (error.code === '23503') {
      const constraint = error.constraint;
      if (constraint === 'transactions_account_id_fkey') {
        return res.status(400).json({ 
          error: 'Account not found',
          message: `The selected account does not exist. Please select a valid account.`,
          code: 'ACCOUNT_NOT_FOUND',
          detail: error.detail
        });
      }
      if (constraint === 'transactions_from_account_id_fkey') {
        return res.status(400).json({ 
          error: 'From account not found',
          message: `The selected "from" account does not exist. Please select a valid account.`,
          code: 'ACCOUNT_NOT_FOUND',
          detail: error.detail
        });
      }
      if (constraint === 'transactions_to_account_id_fkey') {
        return res.status(400).json({ 
          error: 'To account not found',
          message: `The selected "to" account does not exist. Please select a valid account.`,
          code: 'ACCOUNT_NOT_FOUND',
          detail: error.detail
        });
      }
    }
    
    // Handle PostgreSQL lock errors
    if (error.code === '55P03' || error.message?.includes('could not obtain lock')) {
      return res.status(409).json({ 
        error: 'Lock timeout',
        message: 'This resource is currently being processed by another user. Please try again in a moment.',
        code: 'LOCK_TIMEOUT'
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
      SET type = $1, subtype = $2, amount = $3, date = $4, description = $5, 
          account_id = $6, from_account_id = $7, to_account_id = $8, category_id = $9, 
          contact_id = $10, project_id = $11, building_id = $12, property_id = $13,
          unit_id = $14, invoice_id = $15, bill_id = $16, payslip_id = $17,
          contract_id = $18, agreement_id = $19, batch_id = $20, is_system = $21, 
          user_id = $22, updated_at = NOW()
      WHERE id = $23 AND tenant_id = $24
      RETURNING *
    `;
    const result = await db.query(query, [
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
      req.user?.userId || null,
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
    
    // Update bill's paid_amount if this transaction is linked to a bill (check both old and new bill_id)
    const billIdToUpdate = result[0].bill_id || oldTransaction[0].bill_id;
    if (billIdToUpdate) {
      try {
        const billTransactions = await db.query(
          'SELECT SUM(amount) as total_paid FROM transactions WHERE bill_id = $1 AND tenant_id = $2',
          [billIdToUpdate, req.tenantId]
        );
        const totalPaid = parseFloat(billTransactions[0]?.total_paid || '0');
        
        const billData = await db.query(
          'SELECT amount FROM bills WHERE id = $1 AND tenant_id = $2',
          [billIdToUpdate, req.tenantId]
        );
        
        if (billData.length > 0) {
          const billAmount = parseFloat(billData[0].amount);
          let newStatus = 'Unpaid';
          if (totalPaid >= billAmount - 0.01) {
            newStatus = 'Paid';
          } else if (totalPaid > 0.01) {
            newStatus = 'Partially Paid';
          }
          
          const updatedBill = await db.query(
            'UPDATE bills SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING *',
            [totalPaid, newStatus, billIdToUpdate, req.tenantId]
          );
          
          if (updatedBill.length > 0) {
            emitToTenant(req.tenantId!, WS_EVENTS.BILL_UPDATED, {
              bill: updatedBill[0],
              userId: req.user?.userId,
              username: req.user?.username,
            });
          }
        }
      } catch (billUpdateError) {
        console.error('⚠️ PUT /transactions - Failed to update bill paid_amount:', billUpdateError);
      }
    }
    
    // Update invoice's paid_amount if this transaction is linked to an invoice (check both old and new invoice_id)
    const invoiceIdToUpdate = result[0].invoice_id || oldTransaction[0].invoice_id;
    if (invoiceIdToUpdate) {
      try {
        const invoiceTransactions = await db.query(
          'SELECT SUM(amount) as total_paid FROM transactions WHERE invoice_id = $1 AND tenant_id = $2',
          [invoiceIdToUpdate, req.tenantId]
        );
        const totalPaid = parseFloat(invoiceTransactions[0]?.total_paid || '0');
        
        const invoiceData = await db.query(
          'SELECT amount FROM invoices WHERE id = $1 AND tenant_id = $2',
          [invoiceIdToUpdate, req.tenantId]
        );
        
        if (invoiceData.length > 0) {
          const invoiceAmount = parseFloat(invoiceData[0].amount);
          let newStatus = 'Unpaid';
          if (totalPaid >= invoiceAmount - 0.1) {
            newStatus = 'Paid';
          } else if (totalPaid > 0.1) {
            newStatus = 'Partially Paid';
          }
          
          // Check if invoice exists before updating
          const fullInvoiceData = await db.query(
            'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
            [invoiceIdToUpdate, req.tenantId]
          );
          
          if (fullInvoiceData.length > 0) {
            const updatedInvoice = await db.query(
              'UPDATE invoices SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING *',
              [totalPaid, newStatus, invoiceIdToUpdate, req.tenantId]
            );
            
            if (updatedInvoice.length > 0) {
              emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_UPDATED, {
                invoice: updatedInvoice[0],
                userId: req.user?.userId,
                username: req.user?.username,
              });
            }
          } else {
            console.warn('⚠️ PUT /transactions - Invoice not found in cloud DB for paid_amount update:', {
              invoiceId: invoiceIdToUpdate,
              tenantId: req.tenantId
            });
          }
        }
      } catch (invoiceUpdateError) {
        console.error('⚠️ PUT /transactions - Failed to update invoice paid_amount:', invoiceUpdateError);
      }
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
    
    // Update bill's paid_amount if this transaction was linked to a bill
    if (oldTransaction[0].bill_id) {
      try {
        const billTransactions = await db.query(
          'SELECT SUM(amount) as total_paid FROM transactions WHERE bill_id = $1 AND tenant_id = $2',
          [oldTransaction[0].bill_id, req.tenantId]
        );
        const totalPaid = parseFloat(billTransactions[0]?.total_paid || '0');
        
        const billData = await db.query(
          'SELECT amount FROM bills WHERE id = $1 AND tenant_id = $2',
          [oldTransaction[0].bill_id, req.tenantId]
        );
        
        if (billData.length > 0) {
          const billAmount = parseFloat(billData[0].amount);
          let newStatus = 'Unpaid';
          if (totalPaid >= billAmount - 0.01) {
            newStatus = 'Paid';
          } else if (totalPaid > 0.01) {
            newStatus = 'Partially Paid';
          }
          
          const updatedBill = await db.query(
            'UPDATE bills SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING *',
            [totalPaid, newStatus, oldTransaction[0].bill_id, req.tenantId]
          );
          
          if (updatedBill.length > 0) {
            emitToTenant(req.tenantId!, WS_EVENTS.BILL_UPDATED, {
              bill: updatedBill[0],
              userId: req.user?.userId,
              username: req.user?.username,
            });
          }
        }
      } catch (billUpdateError) {
        console.error('⚠️ DELETE /transactions - Failed to update bill paid_amount:', billUpdateError);
      }
    }
    
    // Update invoice's paid_amount if this transaction was linked to an invoice
    if (oldTransaction[0].invoice_id) {
      try {
        const invoiceTransactions = await db.query(
          'SELECT SUM(amount) as total_paid FROM transactions WHERE invoice_id = $1 AND tenant_id = $2',
          [oldTransaction[0].invoice_id, req.tenantId]
        );
        const totalPaid = parseFloat(invoiceTransactions[0]?.total_paid || '0');
        
        const invoiceData = await db.query(
          'SELECT amount FROM invoices WHERE id = $1 AND tenant_id = $2',
          [oldTransaction[0].invoice_id, req.tenantId]
        );
        
        if (invoiceData.length > 0) {
          const invoiceAmount = parseFloat(invoiceData[0].amount);
          let newStatus = 'Unpaid';
          if (totalPaid >= invoiceAmount - 0.1) {
            newStatus = 'Paid';
          } else if (totalPaid > 0.1) {
            newStatus = 'Partially Paid';
          }
          
          // Check if invoice exists before updating
          const fullInvoiceData = await db.query(
            'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
            [oldTransaction[0].invoice_id, req.tenantId]
          );
          
          if (fullInvoiceData.length > 0) {
            const updatedInvoice = await db.query(
              'UPDATE invoices SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING *',
              [totalPaid, newStatus, oldTransaction[0].invoice_id, req.tenantId]
            );
            
            if (updatedInvoice.length > 0) {
              emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_UPDATED, {
                invoice: updatedInvoice[0],
                userId: req.user?.userId,
                username: req.user?.username,
              });
            }
          } else {
            console.warn('⚠️ DELETE /transactions - Invoice not found in cloud DB for paid_amount update:', {
              invoiceId: oldTransaction[0].invoice_id,
              tenantId: req.tenantId
            });
          }
        }
      } catch (invoiceUpdateError) {
        console.error('⚠️ DELETE /transactions - Failed to update invoice paid_amount:', invoiceUpdateError);
      }
    }
    
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

// POST batch transactions - For bulk payment operations
router.post('/batch', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const transactions = Array.isArray(req.body) ? req.body : req.body.transactions || [];
    
    if (!transactions || transactions.length === 0) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'At least one transaction is required'
      });
    }
    
    const results: Array<{
      transactionId: string;
      success: boolean;
      error?: string;
      transaction?: any;
    }> = [];
    
    // Process each transaction individually with proper locking
    for (const transaction of transactions) {
      try {
        const transactionId = transaction.id || `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const savedTransaction = await db.transaction(async (client) => {
          // Validate and ensure account exists
          const accountCheck = await client.query(
            'SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2',
            [transaction.accountId, req.tenantId]
          );
          
          if (accountCheck.rows.length === 0) {
            // Check if it's a system account that should be auto-created
            const systemAccount = SYSTEM_ACCOUNTS[transaction.accountId];
            if (systemAccount) {
              // Auto-create system account
              await client.query(
                `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 0, TRUE, $5, NOW(), NOW())
                 ON CONFLICT (id) DO NOTHING`,
                [transaction.accountId, req.tenantId, systemAccount.name, systemAccount.type, systemAccount.description]
              );
            } else {
              throw {
                code: 'ACCOUNT_NOT_FOUND',
                message: `Account with ID "${transaction.accountId}" does not exist. Please select a valid account.`,
                accountId: transaction.accountId
              };
            }
          }
          
          // Validate from_account_id if provided (for transfers)
          if (transaction.fromAccountId) {
            const fromAccountCheck = await client.query(
              'SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2',
              [transaction.fromAccountId, req.tenantId]
            );
            
            if (fromAccountCheck.rows.length === 0) {
              const systemAccount = SYSTEM_ACCOUNTS[transaction.fromAccountId];
              if (systemAccount) {
                await client.query(
                  `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, 0, TRUE, $5, NOW(), NOW())
                   ON CONFLICT (id) DO NOTHING`,
                  [transaction.fromAccountId, req.tenantId, systemAccount.name, systemAccount.type, systemAccount.description]
                );
              } else {
                throw {
                  code: 'ACCOUNT_NOT_FOUND',
                  message: `From account with ID "${transaction.fromAccountId}" does not exist. Please select a valid account.`,
                  accountId: transaction.fromAccountId
                };
              }
            }
          }
          
          // Validate to_account_id if provided (for transfers)
          if (transaction.toAccountId) {
            const toAccountCheck = await client.query(
              'SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2',
              [transaction.toAccountId, req.tenantId]
            );
            
            if (toAccountCheck.rows.length === 0) {
              const systemAccount = SYSTEM_ACCOUNTS[transaction.toAccountId];
              if (systemAccount) {
                await client.query(
                  `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, 0, TRUE, $5, NOW(), NOW())
                   ON CONFLICT (id) DO NOTHING`,
                  [transaction.toAccountId, req.tenantId, systemAccount.name, systemAccount.type, systemAccount.description]
                );
              } else {
                throw {
                  code: 'ACCOUNT_NOT_FOUND',
                  message: `To account with ID "${transaction.toAccountId}" does not exist. Please select a valid account.`,
                  accountId: transaction.toAccountId
                };
              }
            }
          }
          
          // Lock bill if transaction is linked to a bill
          if (transaction.billId && !transaction.id) { // Only lock for new transactions
            try {
              const billLock = await client.query(
                'SELECT * FROM bills WHERE id = $1 AND tenant_id = $2 FOR UPDATE NOWAIT',
                [transaction.billId, req.tenantId]
              );
              
              if (billLock.rows.length === 0) {
                throw { code: 'BILL_NOT_FOUND', message: 'Bill not found' };
              }
              
              const bill = billLock.rows[0];
              const billAmount = parseFloat(bill.amount);
              const currentPaidAmount = parseFloat(bill.paid_amount || '0');
              const paymentAmount = parseFloat(transaction.amount);
              
              // Validate overpayment
              if (currentPaidAmount + paymentAmount > billAmount + 0.01) {
                const overpayment = (currentPaidAmount + paymentAmount) - billAmount;
                throw {
                  code: 'PAYMENT_OVERPAYMENT',
                  message: `Payment would exceed bill amount. Overpayment: ${overpayment.toFixed(2)}`,
                  overpayment: overpayment
                };
              }
            } catch (lockError: any) {
              if (lockError.code === '55P03' || lockError.code === 'LOCK_NOT_AVAILABLE') {
                throw {
                  code: 'BILL_LOCKED',
                  message: 'Bill is currently being processed by another user',
                  retryAfter: 1
                };
              }
              throw lockError;
            }
          }
          
          // Check if transaction already exists
          const existing = await client.query(
            'SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2',
            [transactionId, req.tenantId]
          );
          
          let savedTransaction;
          if (existing.rows.length > 0) {
            // Update existing
            const updateResult = await client.query(
              `UPDATE transactions 
               SET type = $1, subtype = $2, amount = $3, date = $4, description = $5, 
                   account_id = $6, from_account_id = $7, to_account_id = $8, category_id = $9, 
                   contact_id = $10, project_id = $11, building_id = $12, property_id = $13,
                   unit_id = $14, invoice_id = $15, bill_id = $16, payslip_id = $17,
                   contract_id = $18, agreement_id = $19, batch_id = $20, is_system = $21, 
                   user_id = $22, updated_at = NOW()
               WHERE id = $23 AND tenant_id = $24
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
                req.user?.userId || null,
                transactionId,
                req.tenantId
              ]
            );
            savedTransaction = updateResult.rows[0];
          } else {
            // Create new
            const insertResult = await client.query(
              `INSERT INTO transactions (
                id, tenant_id, user_id, type, subtype, amount, date, description, account_id, 
                from_account_id, to_account_id, category_id, contact_id, project_id,
                building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
                contract_id, agreement_id, batch_id, is_system, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW())
              RETURNING *`,
              [
                transactionId,
                req.tenantId,
                req.user?.userId || null,
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
            savedTransaction = insertResult.rows[0];
            
            // Update bill if linked
            if (transaction.billId && !transaction.id) {
              const billTransactions = await client.query(
                'SELECT SUM(amount) as total_paid FROM transactions WHERE bill_id = $1 AND tenant_id = $2',
                [transaction.billId, req.tenantId]
              );
              const totalPaid = parseFloat(billTransactions.rows[0]?.total_paid || '0');
              
              const billData = await client.query(
                'SELECT amount FROM bills WHERE id = $1 AND tenant_id = $2',
                [transaction.billId, req.tenantId]
              );
              
              if (billData.rows.length > 0) {
                const billAmount = parseFloat(billData.rows[0].amount);
                let newStatus = 'Unpaid';
                if (totalPaid >= billAmount - 0.01) {
                  newStatus = 'Paid';
                } else if (totalPaid > 0.01) {
                  newStatus = 'Partially Paid';
                }
                
                // Update bill (row is already locked via FOR UPDATE NOWAIT)
                const updatedBill = await client.query(
                  `UPDATE bills 
                   SET paid_amount = $1, status = $2, updated_at = NOW() 
                   WHERE id = $3 AND tenant_id = $4
                   RETURNING *`,
                  [totalPaid, newStatus, transaction.billId, req.tenantId]
                );
                
                // Emit WebSocket event for bill update
                if (updatedBill.rows.length > 0) {
                  emitToTenant(req.tenantId!, WS_EVENTS.BILL_UPDATED, {
                    bill: updatedBill.rows[0],
                    userId: req.user?.userId,
                    username: req.user?.username,
                  });
                }
              }
            }
          }
          
          return savedTransaction;
        });
        
        // Transaction succeeded
        results.push({
          transactionId,
          success: true,
          transaction: savedTransaction
        });
        
        // Emit WebSocket event for transaction
        emitToTenant(req.tenantId!, WS_EVENTS.TRANSACTION_CREATED, {
          transaction: savedTransaction,
          userId: req.user?.userId,
          username: req.user?.username,
        });
        
      } catch (error: any) {
        // Transaction failed
        const transactionId = transaction.id || `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Handle foreign key constraint violations for accounts
        let errorMessage = error.message || error.code || 'Unknown error';
        let errorCode = error.code;
        
        if (error.code === '23503') {
          const constraint = error.constraint;
          if (constraint === 'transactions_account_id_fkey') {
            errorMessage = `The selected account does not exist. Please select a valid account.`;
            errorCode = 'ACCOUNT_NOT_FOUND';
          } else if (constraint === 'transactions_from_account_id_fkey') {
            errorMessage = `The selected "from" account does not exist. Please select a valid account.`;
            errorCode = 'ACCOUNT_NOT_FOUND';
          } else if (constraint === 'transactions_to_account_id_fkey') {
            errorMessage = `The selected "to" account does not exist. Please select a valid account.`;
            errorCode = 'ACCOUNT_NOT_FOUND';
          }
        }
        
        results.push({
          transactionId,
          success: false,
          error: errorMessage,
          ...(errorCode && { code: errorCode }),
          ...(error.overpayment && { overpayment: error.overpayment }),
          ...(error.accountId && { accountId: error.accountId })
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    res.status(200).json({
      success: failureCount === 0,
      total: transactions.length,
      succeeded: successCount,
      failed: failureCount,
      results
    });
    
  } catch (error: any) {
    console.error('Error processing batch transactions:', error);
    res.status(500).json({ 
      error: 'Failed to process batch transactions',
      message: error.message || 'Internal server error'
    });
  }
});

export default router;


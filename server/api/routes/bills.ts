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

    let query = 'SELECT * FROM bills WHERE tenant_id = $1 AND deleted_at IS NULL';
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
      'SELECT * FROM bills WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
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
      'SELECT id, status, bill_number, version FROM bills WHERE id = $1 AND tenant_id = $2',
      [billId, req.tenantId]
    );
    const isUpdate = existing.length > 0;

    // Immutability: reject updates to paid bills (financial data safety)
    if (isUpdate && existing[0].status === 'Paid') {
      return res.status(403).json({
        error: 'Immutable record',
        message: 'Cannot modify a paid bill. Posted financial records are immutable.',
        code: 'BILL_PAID_IMMUTABLE',
      });
    }

    // Optimistic locking check for POST update
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    const serverVersion = isUpdate ? existing[0].version : null;
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

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
        id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status,
        issue_date, due_date, description, category_id, project_id, building_id,
        property_id, project_agreement_id, contract_id, staff_id, expense_bearer_type,
        expense_category_items, document_path, document_id, user_id, created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                COALESCE((SELECT created_at FROM bills WHERE id = $1), NOW()), NOW(), 1)
      ON CONFLICT (id) 
      DO UPDATE SET
        bill_number = EXCLUDED.bill_number,
        contact_id = EXCLUDED.contact_id,
        vendor_id = EXCLUDED.vendor_id,
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
        expense_bearer_type = EXCLUDED.expense_bearer_type,
        expense_category_items = EXCLUDED.expense_category_items,
        document_path = EXCLUDED.document_path,
        document_id = EXCLUDED.document_id,
        user_id = EXCLUDED.user_id,
        updated_at = NOW(),
        version = COALESCE(bills.version, 1) + 1,
        deleted_at = NULL
      WHERE bills.tenant_id = $2 AND (bills.version = $24 OR bills.version IS NULL)
      RETURNING *`,
      [
        billId,
        req.tenantId,
        bill.billNumber,
        bill.contactId || null,
        bill.vendorId || null,
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
        bill.expenseBearerType || null,
        bill.expenseCategoryItems ? JSON.stringify(bill.expenseCategoryItems) : null,
        bill.documentPath || null,
        bill.documentId || null,
        req.user?.userId || null,
        serverVersion
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

    // Immutability: reject updates to paid bills
    const current = await db.query(
      'SELECT status, version FROM bills WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (current.length > 0 && current[0].status === 'Paid') {
      return res.status(403).json({
        error: 'Immutable record',
        message: 'Cannot modify a paid bill. Posted financial records are immutable.',
        code: 'BILL_PAID_IMMUTABLE',
      });
    }

    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let putQuery = `
      UPDATE bills 
      SET bill_number = $1, contact_id = $2, vendor_id = $3, amount = $4, paid_amount = $5, 
          status = $6, issue_date = $7, due_date = $8, description = $9, 
          category_id = $10, project_id = $11, building_id = $12, property_id = $13,
          project_agreement_id = $14, contract_id = $15, staff_id = $16, expense_bearer_type = $17,
          expense_category_items = $18, document_path = $19, document_id = $20, user_id = $21, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $22 AND tenant_id = $23
    `;
    const putParams: any[] = [
      bill.billNumber,
      bill.contactId || null,
      bill.vendorId || null,
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
      bill.expenseBearerType || null,
      bill.expenseCategoryItems ? JSON.stringify(bill.expenseCategoryItems) : null,
      bill.documentPath || null,
      bill.documentId || null,
      req.user?.userId || null,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      putQuery += ` AND version = $24`;
      putParams.push(clientVersion);
    }

    putQuery += ` RETURNING *`;

    const result = await db.query(putQuery, putParams);

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

// POST pay bill - Dedicated endpoint for atomic payment processing
router.post('/:id/pay', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const billId = req.params.id;
    const { amount, accountId, date, description, categoryId, reference } = req.body;

    // Validate required fields
    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Payment amount must be greater than 0'
      });
    }

    if (!accountId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Payment account is required'
      });
    }

    const paymentDate = date || new Date().toISOString().split('T')[0];
    const paymentAmount = parseFloat(amount);

    // Process payment atomically within a transaction
    const result = await db.transaction(async (client) => {
      // Lock the bill row to prevent concurrent payments
      const billLock = await client.query(
        'SELECT * FROM bills WHERE id = $1 AND tenant_id = $2 FOR UPDATE NOWAIT',
        [billId, req.tenantId]
      );

      if (billLock.rows.length === 0) {
        throw { code: 'BILL_NOT_FOUND', message: 'Bill not found' };
      }

      const bill = billLock.rows[0];
      const billAmount = parseFloat(bill.amount);
      const currentPaidAmount = parseFloat(bill.paid_amount || '0');

      // Validate overpayment
      if (currentPaidAmount + paymentAmount > billAmount + 0.01) {
        const overpayment = (currentPaidAmount + paymentAmount) - billAmount;
        throw {
          code: 'PAYMENT_OVERPAYMENT',
          message: `Payment amount (${paymentAmount}) would exceed bill amount. Current paid: ${currentPaidAmount}, Bill amount: ${billAmount}, Overpayment: ${overpayment.toFixed(2)}`,
          overpayment: overpayment,
          remainingBalance: billAmount - currentPaidAmount
        };
      }

      // Create transaction
      const transactionId = `txn-bill-${Date.now()}-${billId}`;
      const transactionDescription = description ||
        `Bill Payment: #${bill.bill_number}${reference ? ` (Ref: ${reference})` : ''}`;

      const transactionResult = await client.query(
        `INSERT INTO transactions (
          id, tenant_id, user_id, type, amount, date, description, account_id,
          category_id, contact_id, vendor_id, project_id, building_id, property_id,
          project_agreement_id, contract_id, bill_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        RETURNING *`,
        [
          transactionId,
          req.tenantId,
          req.user?.userId || null,
          'EXPENSE',
          paymentAmount,
          paymentDate,
          transactionDescription,
          accountId,
          categoryId || bill.category_id || null,
          bill.contact_id || null,
          bill.vendor_id || null,
          bill.project_id || null,
          bill.building_id || null,
          bill.property_id || null,
          bill.project_agreement_id || null,
          bill.contract_id || null,
          billId
        ]
      );

      const transaction = transactionResult.rows[0];

      // Calculate new paid amount
      const billTransactions = await client.query(
        'SELECT SUM(amount) as total_paid FROM transactions WHERE bill_id = $1 AND tenant_id = $2',
        [billId, req.tenantId]
      );
      const totalPaid = parseFloat(billTransactions.rows[0]?.total_paid || '0');

      // Determine new status
      let newStatus = 'Unpaid';
      if (totalPaid >= billAmount - 0.01) {
        newStatus = 'Paid';
      } else if (totalPaid > 0.01) {
        newStatus = 'Partially Paid';
      }

      // Update bill (row is already locked via FOR UPDATE NOWAIT)
      const updatedBillResult = await client.query(
        `UPDATE bills 
         SET paid_amount = $1, status = $2, updated_at = NOW(), 
             version = COALESCE(version, 1) + 1 
         WHERE id = $3 AND tenant_id = $4
         RETURNING *`,
        [totalPaid, newStatus, billId, req.tenantId]
      );

      return {
        transaction: transaction,
        bill: updatedBillResult.rows[0]
      };
    });

    // Emit WebSocket events
    emitToTenant(req.tenantId!, WS_EVENTS.TRANSACTION_CREATED, {
      transaction: result.transaction,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    emitToTenant(req.tenantId!, WS_EVENTS.BILL_UPDATED, {
      bill: result.bill,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json({
      transaction: result.transaction,
      bill: result.bill,
      message: 'Payment processed successfully'
    });
  } catch (error: any) {
    console.error('Error processing bill payment:', error);

    if (error.code === 'BILL_NOT_FOUND') {
      return res.status(404).json({
        error: 'Bill not found',
        message: error.message
      });
    }

    if (error.code === 'PAYMENT_OVERPAYMENT') {
      return res.status(400).json({
        error: 'Overpayment detected',
        message: error.message,
        code: error.code,
        overpayment: error.overpayment,
        remainingBalance: error.remainingBalance
      });
    }

    if (error.code === 'BILL_VERSION_MISMATCH') {
      return res.status(409).json({
        error: 'Concurrent modification',
        message: error.message,
        code: error.code
      });
    }

    // Handle PostgreSQL lock errors
    if (error.code === '55P03' || error.message?.includes('could not obtain lock')) {
      return res.status(409).json({
        error: 'Lock timeout',
        message: 'This bill is currently being processed by another user. Please try again in a moment.',
        code: 'LOCK_TIMEOUT'
      });
    }

    res.status(500).json({
      error: 'Failed to process payment',
      message: error.message || 'Internal server error'
    });
  }
});

// DELETE bill
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();

    // Immutability: reject deletion of paid bills
    const current = await db.query(
      'SELECT status FROM bills WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (current.length > 0 && current[0].status === 'Paid') {
      return res.status(403).json({
        error: 'Immutable record',
        message: 'Cannot delete a paid bill. Posted financial records are immutable.',
        code: 'BILL_PAID_IMMUTABLE',
      });
    }

    const result = await db.query(
      'UPDATE bills SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
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


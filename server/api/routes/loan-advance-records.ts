import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { employeeId, type } = req.query;
    let query = 'SELECT * FROM loan_advance_records WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;
    if (employeeId) {
      query += ` AND employee_id = $${paramIndex++}`;
      params.push(employeeId);
    }
    if (type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(type);
    }
    query += ' ORDER BY issued_date DESC';
    const records = await db.query(query, params);
    res.json(records);
  } catch (error) {
    console.error('Error fetching loan/advance records:', error);
    res.status(500).json({ error: 'Failed to fetch loan/advance records' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const records = await db.query(
      'SELECT * FROM loan_advance_records WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (records.length === 0) {
      return res.status(404).json({ error: 'Loan/advance record not found' });
    }
    res.json(records[0]);
  } catch (error) {
    console.error('Error fetching loan/advance record:', error);
    res.status(500).json({ error: 'Failed to fetch loan/advance record' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const record = req.body;
    if (!record.employeeId || !record.type || !record.amount) {
      return res.status(400).json({ error: 'Employee ID, type, and amount are required' });
    }
    const recordId = record.id || `loan_advance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM loan_advance_records WHERE id = $1 AND tenant_id = $2',
      [recordId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO loan_advance_records (
        id, tenant_id, user_id, employee_id, type, amount, issued_date, repayment_start_date,
        total_installments, installment_amount, repayment_frequency, outstanding_balance, status,
        description, transaction_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                COALESCE((SELECT created_at FROM loan_advance_records WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        employee_id = EXCLUDED.employee_id, type = EXCLUDED.type, amount = EXCLUDED.amount,
        issued_date = EXCLUDED.issued_date, repayment_start_date = EXCLUDED.repayment_start_date,
        total_installments = EXCLUDED.total_installments, installment_amount = EXCLUDED.installment_amount,
        repayment_frequency = EXCLUDED.repayment_frequency, outstanding_balance = EXCLUDED.outstanding_balance,
        status = EXCLUDED.status, description = EXCLUDED.description, transaction_id = EXCLUDED.transaction_id,
        user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        recordId, req.tenantId, req.user?.userId || null, record.employeeId, record.type,
        record.amount || 0, record.issuedDate, record.repaymentStartDate,
        record.totalInstallments || null, record.installmentAmount || null,
        record.repaymentFrequency || 'monthly', record.outstandingBalance || record.amount || 0,
        record.status || 'active', record.description || null, record.transactionId || null
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.LOAN_ADVANCE_RECORD_UPDATED : WS_EVENTS.LOAN_ADVANCE_RECORD_CREATED, {
      record: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating loan/advance record:', error);
    res.status(500).json({ error: 'Failed to create/update loan/advance record', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM loan_advance_records WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Loan/advance record not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.LOAN_ADVANCE_RECORD_DELETED, {
      recordId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting loan/advance record:', error);
    res.status(500).json({ error: 'Failed to delete loan/advance record' });
  }
});

export default router;

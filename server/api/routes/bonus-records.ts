import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { employeeId } = req.query;
    let query = 'SELECT * FROM bonus_records WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    if (employeeId) {
      query += ' AND employee_id = $2';
      params.push(employeeId);
      query += ' ORDER BY effective_date DESC';
    } else {
      query += ' ORDER BY created_at DESC';
    }
    const records = await db.query(query, params);
    res.json(records);
  } catch (error) {
    console.error('Error fetching bonus records:', error);
    res.status(500).json({ error: 'Failed to fetch bonus records' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const records = await db.query(
      'SELECT * FROM bonus_records WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (records.length === 0) {
      return res.status(404).json({ error: 'Bonus record not found' });
    }
    res.json(records[0]);
  } catch (error) {
    console.error('Error fetching bonus record:', error);
    res.status(500).json({ error: 'Failed to fetch bonus record' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const record = req.body;
    const recordId = record.id || `bonus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM bonus_records WHERE id = $1 AND tenant_id = $2',
      [recordId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO bonus_records (
        id, tenant_id, user_id, employee_id, type, amount, description, effective_date,
        payroll_month, is_recurring, recurrence_pattern, eligibility_rule,
        approved_by, approved_at, status, project_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                COALESCE((SELECT created_at FROM bonus_records WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        employee_id = EXCLUDED.employee_id, type = EXCLUDED.type, amount = EXCLUDED.amount,
        description = EXCLUDED.description, effective_date = EXCLUDED.effective_date,
        payroll_month = EXCLUDED.payroll_month, is_recurring = EXCLUDED.is_recurring,
        recurrence_pattern = EXCLUDED.recurrence_pattern, eligibility_rule = EXCLUDED.eligibility_rule,
        approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at,
        status = EXCLUDED.status, project_id = EXCLUDED.project_id,
        user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        recordId, req.tenantId, req.user?.userId || null, record.employeeId, record.type,
        record.amount || 0, record.description, record.effectiveDate,
        record.payrollMonth || null, record.isRecurring || false, record.recurrencePattern || null,
        record.eligibilityRule || null, record.approvedBy || null, record.approvedAt || null,
        record.status || 'pending', record.projectId || null
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.BONUS_RECORD_UPDATED : WS_EVENTS.BONUS_RECORD_CREATED, {
      record: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating bonus record:', error);
    res.status(500).json({ error: 'Failed to create/update bonus record', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM bonus_records WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Bonus record not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.BONUS_RECORD_DELETED, {
      recordId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting bonus record:', error);
    res.status(500).json({ error: 'Failed to delete bonus record' });
  }
});

export default router;

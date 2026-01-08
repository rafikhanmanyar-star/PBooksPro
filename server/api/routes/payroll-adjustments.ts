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
    let query = 'SELECT * FROM payroll_adjustments WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    if (employeeId) {
      query += ' AND employee_id = $2';
      params.push(employeeId);
    }
    query += ' ORDER BY effective_date DESC';
    const adjustments = await db.query(query, params);
    res.json(adjustments);
  } catch (error) {
    console.error('Error fetching payroll adjustments:', error);
    res.status(500).json({ error: 'Failed to fetch payroll adjustments' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const adjustments = await db.query(
      'SELECT * FROM payroll_adjustments WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (adjustments.length === 0) {
      return res.status(404).json({ error: 'Payroll adjustment not found' });
    }
    res.json(adjustments[0]);
  } catch (error) {
    console.error('Error fetching payroll adjustment:', error);
    res.status(500).json({ error: 'Failed to fetch payroll adjustment' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const adjustment = req.body;
    const adjustmentId = adjustment.id || `payroll_adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM payroll_adjustments WHERE id = $1 AND tenant_id = $2',
      [adjustmentId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO payroll_adjustments (
        id, tenant_id, user_id, employee_id, type, category, amount, description, effective_date,
        payroll_month, is_recurring, recurrence_pattern, formula, reason, performed_by, performed_at, status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                COALESCE((SELECT created_at FROM payroll_adjustments WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        employee_id = EXCLUDED.employee_id, type = EXCLUDED.type, category = EXCLUDED.category,
        amount = EXCLUDED.amount, description = EXCLUDED.description, effective_date = EXCLUDED.effective_date,
        payroll_month = EXCLUDED.payroll_month, is_recurring = EXCLUDED.is_recurring,
        recurrence_pattern = EXCLUDED.recurrence_pattern, formula = EXCLUDED.formula,
        reason = EXCLUDED.reason, performed_by = EXCLUDED.performed_by, performed_at = EXCLUDED.performed_at,
        status = EXCLUDED.status, user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        adjustmentId, req.tenantId, req.user?.userId || null, adjustment.employeeId,
        adjustment.type, adjustment.category, adjustment.amount || 0, adjustment.description,
        adjustment.effectiveDate, adjustment.payrollMonth || null, adjustment.isRecurring || false,
        adjustment.recurrencePattern || null, adjustment.formula || null, adjustment.reason,
        adjustment.performedBy || req.user?.username || 'system', adjustment.performedAt || new Date().toISOString(),
        adjustment.status || 'active'
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.PAYROLL_ADJUSTMENT_UPDATED : WS_EVENTS.PAYROLL_ADJUSTMENT_CREATED, {
      adjustment: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating payroll adjustment:', error);
    res.status(500).json({ error: 'Failed to create/update payroll adjustment', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM payroll_adjustments WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Payroll adjustment not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.PAYROLL_ADJUSTMENT_DELETED, {
      adjustmentId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting payroll adjustment:', error);
    res.status(500).json({ error: 'Failed to delete payroll adjustment' });
  }
});

export default router;

import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const cycles = await db.query(
      'SELECT * FROM payroll_cycles WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json(cycles);
  } catch (error) {
    console.error('Error fetching payroll cycles:', error);
    res.status(500).json({ error: 'Failed to fetch payroll cycles' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const cycles = await db.query(
      'SELECT * FROM payroll_cycles WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (cycles.length === 0) {
      return res.status(404).json({ error: 'Payroll cycle not found' });
    }
    res.json(cycles[0]);
  } catch (error) {
    console.error('Error fetching payroll cycle:', error);
    res.status(500).json({ error: 'Failed to fetch payroll cycle' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const cycle = req.body;
    const cycleId = cycle.id || `payroll_cycle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM payroll_cycles WHERE id = $1 AND tenant_id = $2',
      [cycleId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO payroll_cycles (
        id, tenant_id, user_id, name, month, frequency, start_date, end_date, pay_date, issue_date,
        status, payslip_ids, total_employees, total_gross_salary, total_deductions, total_net_salary,
        project_costs, created_at, approved_at, approved_by, locked_at, locked_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                COALESCE((SELECT created_at FROM payroll_cycles WHERE id = $1), NOW()), $18, $19, $20, $21, $22)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, month = EXCLUDED.month, frequency = EXCLUDED.frequency,
        start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, pay_date = EXCLUDED.pay_date,
        issue_date = EXCLUDED.issue_date, status = EXCLUDED.status, payslip_ids = EXCLUDED.payslip_ids,
        total_employees = EXCLUDED.total_employees, total_gross_salary = EXCLUDED.total_gross_salary,
        total_deductions = EXCLUDED.total_deductions, total_net_salary = EXCLUDED.total_net_salary,
        project_costs = EXCLUDED.project_costs, approved_at = EXCLUDED.approved_at,
        approved_by = EXCLUDED.approved_by, locked_at = EXCLUDED.locked_at,
        locked_by = EXCLUDED.locked_by, notes = EXCLUDED.notes, user_id = EXCLUDED.user_id
      RETURNING *`,
      [
        cycleId, req.tenantId, req.user?.userId || null, cycle.name, cycle.month, cycle.frequency,
        cycle.startDate, cycle.endDate, cycle.payDate, cycle.issueDate, cycle.status || 'draft',
        cycle.payslipIds ? JSON.stringify(cycle.payslipIds) : '[]', cycle.totalEmployees || 0,
        cycle.totalGrossSalary || 0, cycle.totalDeductions || 0, cycle.totalNetSalary || 0,
        cycle.projectCosts ? JSON.stringify(cycle.projectCosts) : null,
        cycle.approvedAt || null, cycle.approvedBy || null, cycle.lockedAt || null,
        cycle.lockedBy || null, cycle.notes || null
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.PAYROLL_CYCLE_UPDATED : WS_EVENTS.PAYROLL_CYCLE_CREATED, {
      cycle: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating payroll cycle:', error);
    res.status(500).json({ error: 'Failed to create/update payroll cycle', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM payroll_cycles WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Payroll cycle not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.PAYROLL_CYCLE_DELETED, {
      cycleId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting payroll cycle:', error);
    res.status(500).json({ error: 'Failed to delete payroll cycle' });
  }
});

export default router;

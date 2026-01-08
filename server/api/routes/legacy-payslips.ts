import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { staffId, month, payslipType } = req.query;
    let query = 'SELECT * FROM legacy_payslips WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;
    if (staffId) {
      query += ` AND staff_id = $${paramIndex++}`;
      params.push(staffId);
    }
    if (month) {
      query += ` AND month = $${paramIndex++}`;
      params.push(month);
    }
    if (payslipType) {
      query += ` AND payslip_type = $${paramIndex++}`;
      params.push(payslipType);
    }
    query += ' ORDER BY issue_date DESC';
    const payslips = await db.query(query, params);
    res.json(payslips);
  } catch (error) {
    console.error('Error fetching legacy payslips:', error);
    res.status(500).json({ error: 'Failed to fetch legacy payslips' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const payslips = await db.query(
      'SELECT * FROM legacy_payslips WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (payslips.length === 0) {
      return res.status(404).json({ error: 'Legacy payslip not found' });
    }
    res.json(payslips[0]);
  } catch (error) {
    console.error('Error fetching legacy payslip:', error);
    res.status(500).json({ error: 'Failed to fetch legacy payslip' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const payslip = req.body;
    const payslipId = payslip.id || `legacy_payslip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM legacy_payslips WHERE id = $1 AND tenant_id = $2',
      [payslipId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const allowancesJson = payslip.allowances ? (typeof payslip.allowances === 'string' ? payslip.allowances : JSON.stringify(payslip.allowances)) : '[]';
    const deductionsJson = payslip.deductions ? (typeof payslip.deductions === 'string' ? payslip.deductions : JSON.stringify(payslip.deductions)) : '[]';
    const bonusesJson = payslip.bonuses ? (typeof payslip.bonuses === 'string' ? payslip.bonuses : JSON.stringify(payslip.bonuses)) : '[]';
    
    const result = await db.query(
      `INSERT INTO legacy_payslips (
        id, tenant_id, user_id, staff_id, month, issue_date, basic_salary, allowances, total_allowances,
        deductions, total_deductions, bonuses, total_bonuses, gross_salary, net_salary, status,
        paid_amount, payment_date, transaction_id, project_id, building_id, generated_at, payslip_type,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                COALESCE((SELECT created_at FROM legacy_payslips WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        staff_id = EXCLUDED.staff_id, month = EXCLUDED.month, issue_date = EXCLUDED.issue_date,
        basic_salary = EXCLUDED.basic_salary, allowances = EXCLUDED.allowances, total_allowances = EXCLUDED.total_allowances,
        deductions = EXCLUDED.deductions, total_deductions = EXCLUDED.total_deductions,
        bonuses = EXCLUDED.bonuses, total_bonuses = EXCLUDED.total_bonuses,
        gross_salary = EXCLUDED.gross_salary, net_salary = EXCLUDED.net_salary, status = EXCLUDED.status,
        paid_amount = EXCLUDED.paid_amount, payment_date = EXCLUDED.payment_date,
        transaction_id = EXCLUDED.transaction_id, project_id = EXCLUDED.project_id,
        building_id = EXCLUDED.building_id, generated_at = EXCLUDED.generated_at,
        payslip_type = EXCLUDED.payslip_type, user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        payslipId, req.tenantId, req.user?.userId || null, payslip.staffId, payslip.month, payslip.issueDate,
        payslip.basicSalary || 0, allowancesJson, payslip.totalAllowances || 0,
        deductionsJson, payslip.totalDeductions || 0, bonusesJson, payslip.totalBonuses || 0,
        payslip.grossSalary || 0, payslip.netSalary || 0, payslip.status || 'draft',
        payslip.paidAmount || 0, payslip.paymentDate || null, payslip.transactionId || null,
        payslip.projectId || null, payslip.buildingId || null, payslip.generatedAt || new Date().toISOString(),
        payslip.payslipType || 'project'
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.LEGACY_PAYSLIP_UPDATED : WS_EVENTS.LEGACY_PAYSLIP_CREATED, {
      payslip: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating legacy payslip:', error);
    res.status(500).json({ error: 'Failed to create/update legacy payslip', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM legacy_payslips WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Legacy payslip not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.LEGACY_PAYSLIP_DELETED, {
      payslipId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting legacy payslip:', error);
    res.status(500).json({ error: 'Failed to delete legacy payslip' });
  }
});

export default router;

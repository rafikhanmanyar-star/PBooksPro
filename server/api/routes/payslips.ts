import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { employeeId, payrollCycleId, month } = req.query;
    let query = 'SELECT * FROM payslips WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;
    if (employeeId) {
      query += ` AND employee_id = $${paramIndex++}`;
      params.push(employeeId);
    }
    if (payrollCycleId) {
      query += ` AND payroll_cycle_id = $${paramIndex++}`;
      params.push(payrollCycleId);
    }
    if (month) {
      query += ` AND month = $${paramIndex++}`;
      params.push(month);
    }
    query += ' ORDER BY created_at DESC';
    const payslips = await db.query(query, params);
    res.json(payslips);
  } catch (error) {
    console.error('Error fetching payslips:', error);
    res.status(500).json({ error: 'Failed to fetch payslips' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const payslips = await db.query(
      'SELECT * FROM payslips WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (payslips.length === 0) {
      return res.status(404).json({ error: 'Payslip not found' });
    }
    res.json(payslips[0]);
  } catch (error) {
    console.error('Error fetching payslip:', error);
    res.status(500).json({ error: 'Failed to fetch payslip' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const payslip = req.body;
    const payslipId = payslip.id || `payslip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM payslips WHERE id = $1 AND tenant_id = $2',
      [payslipId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Convert JSON fields to JSONB for PostgreSQL
    const allowancesJson = payslip.allowances ? (typeof payslip.allowances === 'string' ? payslip.allowances : JSON.stringify(payslip.allowances)) : '[]';
    const bonusesJson = payslip.bonuses ? (typeof payslip.bonuses === 'string' ? payslip.bonuses : JSON.stringify(payslip.bonuses)) : '[]';
    const overtimeJson = payslip.overtime ? (typeof payslip.overtime === 'string' ? payslip.overtime : JSON.stringify(payslip.overtime)) : '[]';
    const commissionsJson = payslip.commissions ? (typeof payslip.commissions === 'string' ? payslip.commissions : JSON.stringify(payslip.commissions)) : '[]';
    const deductionsJson = payslip.deductions ? (typeof payslip.deductions === 'string' ? payslip.deductions : JSON.stringify(payslip.deductions)) : '[]';
    const taxDeductionsJson = payslip.taxDeductions ? (typeof payslip.taxDeductions === 'string' ? payslip.taxDeductions : JSON.stringify(payslip.taxDeductions)) : '[]';
    const statutoryDeductionsJson = payslip.statutoryDeductions ? (typeof payslip.statutoryDeductions === 'string' ? payslip.statutoryDeductions : JSON.stringify(payslip.statutoryDeductions)) : '[]';
    const loanDeductionsJson = payslip.loanDeductions ? (typeof payslip.loanDeductions === 'string' ? payslip.loanDeductions : JSON.stringify(payslip.loanDeductions)) : '[]';
    const costAllocationsJson = payslip.costAllocations ? (typeof payslip.costAllocations === 'string' ? payslip.costAllocations : JSON.stringify(payslip.costAllocations)) : '[]';
    const snapshotJson = payslip.snapshot ? (typeof payslip.snapshot === 'string' ? payslip.snapshot : JSON.stringify(payslip.snapshot)) : null;
    
    const result = await db.query(
      `INSERT INTO payslips (
        id, tenant_id, user_id, employee_id, payroll_cycle_id, month, issue_date, pay_period_start, pay_period_end,
        basic_salary, allowances, total_allowances, bonuses, total_bonuses, overtime, total_overtime,
        commissions, total_commissions, deductions, total_deductions, tax_deductions, total_tax,
        statutory_deductions, total_statutory, loan_deductions, total_loan_deductions,
        gross_salary, taxable_income, net_salary, cost_allocations, is_prorated, proration_days,
        proration_reason, status, paid_amount, payment_date, transaction_id, payment_account_id,
        generated_at, generated_by, approved_at, approved_by, notes, snapshot, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46,
                COALESCE((SELECT created_at FROM payslips WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        employee_id = EXCLUDED.employee_id, payroll_cycle_id = EXCLUDED.payroll_cycle_id, month = EXCLUDED.month,
        issue_date = EXCLUDED.issue_date, pay_period_start = EXCLUDED.pay_period_start, pay_period_end = EXCLUDED.pay_period_end,
        basic_salary = EXCLUDED.basic_salary, allowances = EXCLUDED.allowances, total_allowances = EXCLUDED.total_allowances,
        bonuses = EXCLUDED.bonuses, total_bonuses = EXCLUDED.total_bonuses, overtime = EXCLUDED.overtime, total_overtime = EXCLUDED.total_overtime,
        commissions = EXCLUDED.commissions, total_commissions = EXCLUDED.total_commissions,
        deductions = EXCLUDED.deductions, total_deductions = EXCLUDED.total_deductions,
        tax_deductions = EXCLUDED.tax_deductions, total_tax = EXCLUDED.total_tax,
        statutory_deductions = EXCLUDED.statutory_deductions, total_statutory = EXCLUDED.total_statutory,
        loan_deductions = EXCLUDED.loan_deductions, total_loan_deductions = EXCLUDED.total_loan_deductions,
        gross_salary = EXCLUDED.gross_salary, taxable_income = EXCLUDED.taxable_income, net_salary = EXCLUDED.net_salary,
        cost_allocations = EXCLUDED.cost_allocations, is_prorated = EXCLUDED.is_prorated,
        proration_days = EXCLUDED.proration_days, proration_reason = EXCLUDED.proration_reason,
        status = EXCLUDED.status, paid_amount = EXCLUDED.paid_amount, payment_date = EXCLUDED.payment_date,
        transaction_id = EXCLUDED.transaction_id, payment_account_id = EXCLUDED.payment_account_id,
        generated_at = EXCLUDED.generated_at, generated_by = EXCLUDED.generated_by,
        approved_at = EXCLUDED.approved_at, approved_by = EXCLUDED.approved_by, notes = EXCLUDED.notes,
        snapshot = EXCLUDED.snapshot, user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        payslipId, req.tenantId, req.user?.userId || null, payslip.employeeId, payslip.payrollCycleId,
        payslip.month, payslip.issueDate, payslip.payPeriodStart, payslip.payPeriodEnd,
        payslip.basicSalary || 0, allowancesJson, payslip.totalAllowances || 0,
        bonusesJson, payslip.totalBonuses || 0, overtimeJson, payslip.totalOvertime || 0,
        commissionsJson, payslip.totalCommissions || 0, deductionsJson, payslip.totalDeductions || 0,
        taxDeductionsJson, payslip.totalTax || 0, statutoryDeductionsJson, payslip.totalStatutory || 0,
        loanDeductionsJson, payslip.totalLoanDeductions || 0,
        payslip.grossSalary || 0, payslip.taxableIncome || 0, payslip.netSalary || 0,
        costAllocationsJson, payslip.isProrated || false, payslip.prorationDays || null,
        payslip.prorationReason || null, payslip.status || 'draft', payslip.paidAmount || 0,
        payslip.paymentDate || null, payslip.transactionId || null, payslip.paymentAccountId || null,
        payslip.generatedAt || new Date().toISOString(), payslip.generatedBy || null,
        payslip.approvedAt || null, payslip.approvedBy || null, payslip.notes || null,
        snapshotJson
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.PAYSLIP_UPDATED : WS_EVENTS.PAYSLIP_CREATED, {
      payslip: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating payslip:', error);
    res.status(500).json({ error: 'Failed to create/update payslip', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM payslips WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Payslip not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.PAYSLIP_DELETED, {
      payslipId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting payslip:', error);
    res.status(500).json({ error: 'Failed to delete payslip' });
  }
});

export default router;

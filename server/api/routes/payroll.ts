/**
 * Payroll API Routes
 * 
 * Provides endpoints for payroll management including employees, payroll runs,
 * grades, projects, and salary components.
 */

import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant } from '../../services/websocketHelper.js';

const getDb = () => getDatabaseService();

// Helper function to round numbers to 2 decimal places
const roundToTwo = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

// Helper function to calculate allowance/deduction amount with proper rounding
const calculateAmount = (basic: number, amount: number, isPercentage: boolean): number => {
  const calculated = isPercentage ? (basic * amount) / 100 : amount;
  return roundToTwo(calculated);
};

/** Internal: generate payslips for a payroll run. Does not update run status. */
async function generatePayslipsForRun(
  tenantId: string,
  runId: string,
  run: { month: string; year: number }
): Promise<{
  newPayslipsCount: number;
  newTotalAmount: number;
  existingTotalAmount: number;
  existingEmployeeIds: Set<string>;
  totalEmployeeCount: number;
  combinedTotalAmount: number;
}> {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthIndex = monthNames.indexOf(run.month);
  if (monthIndex === -1) throw new Error(`Invalid month: ${run.month}`);

  const periodStart = new Date(run.year, monthIndex, 1);
  const periodEnd = new Date(run.year, monthIndex + 1, 0);
  const daysInMonth = periodEnd.getDate();

  const existingPayslips = await getDb().query(
    `SELECT employee_id, net_pay FROM payslips 
     WHERE payroll_run_id = $1 AND tenant_id = $2`,
    [runId, tenantId]
  );
  const existingEmployeeIds = new Set(existingPayslips.map((p: any) => p.employee_id));
  const existingTotalAmount = existingPayslips.reduce((sum: number, p: any) => sum + parseFloat(p.net_pay || 0), 0);

  const employees = await getDb().query(
    `SELECT * FROM payroll_employees 
     WHERE tenant_id = $1 AND status = 'ACTIVE'
     AND joining_date <= $2
     AND (termination_date IS NULL OR termination_date >= $3)
     AND id NOT IN (
       SELECT employee_id FROM payslips 
       WHERE payroll_run_id = $4 AND tenant_id = $1
     )`,
    [tenantId, periodEnd.toISOString().split('T')[0], periodStart.toISOString().split('T')[0], runId]
  );

  let newTotalAmount = 0;
  let newPayslipsCount = 0;

  for (const emp of employees) {
    const salary = emp.salary || {};
    const joiningDate = new Date(emp.joining_date);
    let proRataFactor = 1.0;
    let workedDays = daysInMonth;

    if (joiningDate >= periodStart && joiningDate <= periodEnd) {
      workedDays = periodEnd.getDate() - joiningDate.getDate() + 1;
      proRataFactor = workedDays / daysInMonth;
    }
    if (emp.termination_date) {
      const terminationDate = new Date(emp.termination_date);
      if (terminationDate >= periodStart && terminationDate <= periodEnd) {
        workedDays = terminationDate.getDate();
        proRataFactor = workedDays / daysInMonth;
      }
    }

    const basic = roundToTwo((salary.basic || 0) * proRataFactor);
    let totalAllowances = 0;
    (salary.allowances || [])
      .filter((a: any) => {
        const name = (a.name || '').toLowerCase();
        return name !== 'basic pay' && name !== 'basic salary';
      })
      .forEach((a: any) => {
        const allowanceAmount = calculateAmount(salary.basic || 0, a.amount, a.is_percentage);
        totalAllowances += roundToTwo(allowanceAmount * proRataFactor);
      });
    totalAllowances = roundToTwo(totalAllowances);

    const grossForDeductions = roundToTwo(basic + totalAllowances);
    let totalDeductions = 0;
    (salary.deductions || []).forEach((d: any) => {
      totalDeductions += calculateAmount(grossForDeductions, d.amount, d.is_percentage);
    });
    totalDeductions = roundToTwo(totalDeductions);

    const adjustments = emp.adjustments || [];
    const earningAdj = roundToTwo(adjustments.filter((a: any) => a.type === 'EARNING').reduce((sum: number, a: any) => sum + a.amount, 0));
    const deductionAdj = roundToTwo(adjustments.filter((a: any) => a.type === 'DEDUCTION').reduce((sum: number, a: any) => sum + a.amount, 0));

    const grossPay = roundToTwo(basic + totalAllowances + earningAdj);
    const netPay = roundToTwo(grossPay - totalDeductions - deductionAdj);

    newTotalAmount += netPay;
    newPayslipsCount++;

    await getDb().query(
      `INSERT INTO payslips 
       (tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, 
        total_deductions, total_adjustments, gross_pay, net_pay,
        allowance_details, deduction_details, adjustment_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [tenantId, runId, emp.id, basic, totalAllowances, totalDeductions,
        earningAdj - deductionAdj, grossPay, netPay,
        JSON.stringify(salary.allowances || []),
        JSON.stringify(salary.deductions || []),
        JSON.stringify(adjustments)]
    );
  }

  const combinedTotalAmount = existingTotalAmount + newTotalAmount;
  const totalEmployeeCount = existingEmployeeIds.size + newPayslipsCount;

  return {
    newPayslipsCount,
    newTotalAmount,
    existingTotalAmount,
    existingEmployeeIds,
    totalEmployeeCount,
    combinedTotalAmount
  };
}

const router = Router();

// =====================================================
// EMPLOYEE ROUTES
// =====================================================

// Helper: run employees list query; if deleted_at column is missing (e.g. migration not run), retry without it
async function queryEmployeesWithDepartments(tenantId: string, includeDeletedFilter: boolean) {
  return getDb().query(
    `SELECT e.*, 
            d.name as department_name,
            d.code as department_code
     FROM payroll_employees e
     LEFT JOIN payroll_departments d ON e.department_id = d.id
     WHERE e.tenant_id = $1${includeDeletedFilter ? ' AND e.deleted_at IS NULL' : ''}
     ORDER BY e.name ASC`,
    [tenantId]
  );
}

// GET /payroll/employees - List all employees with department info
router.get('/employees', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    let employees: any[];
    try {
      employees = await queryEmployeesWithDepartments(tenantId, true);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('deleted_at') || msg.includes('does not exist')) {
        console.warn('Payroll employees: deleted_at column missing, using fallback query. Run migration 20260216_add_missing_sync_metadata.sql.');
        employees = await queryEmployeesWithDepartments(tenantId, false);
      } else {
        throw err;
      }
    }

    res.json(employees);
  } catch (error: any) {
    console.error('Error fetching payroll employees:', error);
    const message = error?.message || 'Failed to fetch employees';
    const isStagingOrDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      error: 'Failed to fetch employees',
      ...(isStagingOrDev && { details: message }),
    });
  }
});

// Helper: single employee by id (optional deleted_at filter for compatibility)
async function queryEmployeeById(id: string, tenantId: string, includeDeletedFilter: boolean) {
  return getDb().query(
    `SELECT e.*, 
            d.name as department_name,
            d.code as department_code,
            d.description as department_description
     FROM payroll_employees e
     LEFT JOIN payroll_departments d ON e.department_id = d.id
     WHERE e.id = $1 AND e.tenant_id = $2${includeDeletedFilter ? ' AND e.deleted_at IS NULL' : ''}`,
    [id, tenantId]
  );
}

// GET /payroll/employees/:id - Get single employee with department info
router.get('/employees/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    let employees: any[];
    try {
      employees = await queryEmployeeById(id, tenantId, true);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('deleted_at') || msg.includes('does not exist')) {
        employees = await queryEmployeeById(id, tenantId, false);
      } else {
        throw err;
      }
    }

    if (employees.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employees[0]);
  } catch (error: any) {
    console.error('Error fetching employee:', error);
    const message = error?.message || 'Failed to fetch employee';
    const isStagingOrDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      error: 'Failed to fetch employee',
      ...(isStagingOrDev && { details: message }),
    });
  }
});

// POST /payroll/employees - Create new employee with department linking
router.post('/employees', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const {
      name, email, phone, address, designation, department, department_id,
      grade, joining_date, salary, projects
    } = req.body;

    // If department_id is provided, use it; otherwise try to find by department name
    let effectiveDepartmentId = department_id;
    if (!effectiveDepartmentId && department) {
      const deptResult = await getDb().query(
        `SELECT id FROM payroll_departments WHERE tenant_id = $1 AND name = $2`,
        [tenantId, department]
      );
      if (deptResult.length > 0) {
        effectiveDepartmentId = deptResult[0].id;
      }
    }

    // Generate employee code in format EID-0001, EID-0002, etc.
    let employeeCode = 'EID-0001'; // Default for first employee
    try {
      const lastEmployee = await getDb().query(
        `SELECT employee_code FROM payroll_employees 
         WHERE tenant_id = $1 AND employee_code LIKE 'EID-%'
         ORDER BY employee_code DESC LIMIT 1`,
        [tenantId]
      );

      if (lastEmployee.length > 0 && lastEmployee[0].employee_code) {
        // ...
      }
    } catch (error) {
      console.warn('Error generating employee code, using default:', error);
    }

    const employeeId = req.body.id || `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await getDb().query(
      'SELECT id, version FROM payroll_employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, tenantId]
    );
    const isUpdate = existing.length > 0;

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

    const result = await getDb().query(
      `INSERT INTO payroll_employees 
       (id, tenant_id, name, email, phone, address, designation, department, department_id, grade, 
        joining_date, salary, projects, status, employee_code, created_by, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ACTIVE', $14, $15, 1)
       ON CONFLICT (id) 
       DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address,
         designation = EXCLUDED.designation,
         department = EXCLUDED.department,
         department_id = EXCLUDED.department_id,
         grade = EXCLUDED.grade,
         joining_date = EXCLUDED.joining_date,
         salary = EXCLUDED.salary,
         projects = EXCLUDED.projects,
         status = EXCLUDED.status,
         employee_code = EXCLUDED.employee_code,
         updated_by = $15,
         updated_at = NOW(),
         version = COALESCE(payroll_employees.version, 1) + 1,
         deleted_at = NULL
       WHERE payroll_employees.tenant_id = $2 AND (payroll_employees.version = $16 OR payroll_employees.version IS NULL)
       RETURNING *`,
      [employeeId, tenantId, name, email, phone, address, designation, department, effectiveDepartmentId || null, grade,
        joining_date, JSON.stringify(salary || { basic: 0, allowances: [], deductions: [] }),
        JSON.stringify(projects || []), employeeCode, userId, serverVersion]
    );

    // Notify via WebSocket
    emitToTenant(tenantId, 'payroll_employee_created', { id: result[0].id });

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// PUT /payroll/employees/:id - Update employee with department linking
router.put('/employees/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const {
      name, email, phone, address, photo, designation, department, department_id,
      grade, joining_date, status, termination_date, salary, adjustments, projects
    } = req.body;

    // If department_id is provided, use it; otherwise try to find by department name
    let effectiveDepartmentId = department_id;
    if (department_id === undefined && department) {
      const deptResult = await getDb().query(
        `SELECT id FROM payroll_departments WHERE tenant_id = $1 AND name = $2`,
        [tenantId, department]
      );
      if (deptResult.length > 0) {
        effectiveDepartmentId = deptResult[0].id;
      }
    }

    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE payroll_employees SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        address = COALESCE($4, address),
        photo = COALESCE($5, photo),
        designation = COALESCE($6, designation),
        department = COALESCE($7, department),
        department_id = COALESCE($8, department_id),
        grade = COALESCE($9, grade),
        joining_date = COALESCE($10, joining_date),
        status = COALESCE($11, status),
        termination_date = COALESCE($12, termination_date),
        salary = COALESCE($13, salary),
        adjustments = COALESCE($14, adjustments),
        projects = COALESCE($15, projects),
        updated_by = $16,
        updated_at = NOW(),
        version = COALESCE(version, 1) + 1
      WHERE id = $17 AND tenant_id = $18
    `;
    const queryParams: any[] = [
      name, email, phone, address, photo, designation, department, effectiveDepartmentId,
      grade, joining_date, status, termination_date,
      salary ? JSON.stringify(salary) : null,
      adjustments ? JSON.stringify(adjustments) : null,
      projects ? JSON.stringify(projects) : null,
      userId, id, tenantId
    ];

    if (clientVersion != null) {
      updateQuery += ` AND version = $19`;
      queryParams.push(clientVersion);
    }

    updateQuery += ` RETURNING *`;
    const result = await getDb().query(updateQuery, queryParams);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    emitToTenant(tenantId, 'payroll_employee_updated', { id });

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// DELETE /payroll/employees/:id - Delete employee
router.delete('/employees/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const result = await getDb().query(
      `UPDATE payroll_employees SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    emitToTenant(tenantId, 'payroll_employee_deleted', { id });

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// =====================================================
// PAYROLL RUNS ROUTES
// =====================================================

// GET /payroll/runs - List all payroll runs
router.get('/runs', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const runs = await getDb().query(
      `SELECT * FROM payroll_runs 
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY year DESC, created_at DESC`,
      [tenantId]
    );

    res.json(runs);
  } catch (error) {
    console.error('Error fetching payroll runs:', error);
    res.status(500).json({ error: 'Failed to fetch payroll runs' });
  }
});

// GET /payroll/runs/:id - Get single payroll run
router.get('/runs/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const runs = await getDb().query(
      `SELECT * FROM payroll_runs WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );

    if (runs.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    res.json(runs[0]);
  } catch (error) {
    console.error('Error fetching payroll run:', error);
    res.status(500).json({ error: 'Failed to fetch payroll run' });
  }
});

// POST /payroll/runs - Create new payroll run
router.post('/runs', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Calculate period start and end dates
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIndex = monthNames.indexOf(month);
    if (monthIndex === -1) {
      return res.status(400).json({ error: `Invalid month: ${month}` });
    }

    const periodStart = new Date(year, monthIndex, 1);
    const periodEnd = new Date(year, monthIndex + 1, 0); // Last day of month

    // Check for existing payroll run for this month/year (unique constraint)
    const existingRun = await getDb().query(
      `SELECT id, status FROM payroll_runs WHERE tenant_id = $1 AND month = $2 AND year = $3`,
      [tenantId, month, year]
    );

    if (existingRun.length > 0) {
      return res.status(409).json({
        error: `A payroll run for ${month} ${year} already exists (status: ${existingRun[0].status})`,
        existingRunId: existingRun[0].id,
        existingStatus: existingRun[0].status
      });
    }

    // Get active employees count who should be included in this payroll
    const empCount = await getDb().query(
      `SELECT COUNT(*) as count FROM payroll_employees 
       WHERE tenant_id = $1 AND status = 'ACTIVE'
       AND joining_date <= $2
       AND (termination_date IS NULL OR termination_date >= $3)`,
      [tenantId, periodEnd.toISOString().split('T')[0], periodStart.toISOString().split('T')[0]]
    );

    const runId = req.body.id || `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await getDb().query(
      'SELECT id, version FROM payroll_runs WHERE id = $1 AND tenant_id = $2',
      [runId, tenantId]
    );
    const isUpdate = existing.length > 0;

    // Optimistic locking check
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    const serverVersion = isUpdate ? existing[0].version : null;
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

    const result = await getDb().query(
      `INSERT INTO payroll_runs 
       (id, tenant_id, month, year, period_start, period_end, status, employee_count, created_by, version)
       VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8, 1)
       ON CONFLICT (id) 
       DO UPDATE SET
         month = EXCLUDED.month,
         year = EXCLUDED.year,
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end,
         status = EXCLUDED.status,
         employee_count = EXCLUDED.employee_count,
         updated_by = $8,
         updated_at = NOW(),
         version = COALESCE(payroll_runs.version, 1) + 1,
         deleted_at = NULL
       WHERE payroll_runs.tenant_id = $2 AND (payroll_runs.version = $9 OR payroll_runs.version IS NULL)
       RETURNING *`,
      [runId, tenantId, month, year, periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0], empCount[0]?.count || 0, userId, serverVersion]
    );

    const createdRun = result[0];

    // Generate payslips immediately (no separate approval step)
    let processing_summary = {
      new_payslips_generated: 0,
      existing_payslips_skipped: 0,
      total_payslips: createdRun.employee_count || 0,
      new_amount_added: 0,
      previous_amount: 0,
      total_amount: parseFloat(createdRun.total_amount || 0)
    };
    try {
      const summary = await generatePayslipsForRun(tenantId, createdRun.id, { month: createdRun.month, year: createdRun.year });
      const updateResult = await getDb().query(
        `UPDATE payroll_runs SET
          status = 'APPROVED',
          total_amount = $1,
          employee_count = $2,
          updated_by = $3
         WHERE id = $4 AND tenant_id = $5
         RETURNING *`,
        [summary.combinedTotalAmount, summary.totalEmployeeCount, userId, createdRun.id, tenantId]
      );
      const updatedRun = updateResult[0];
      processing_summary = {
        new_payslips_generated: summary.newPayslipsCount,
        existing_payslips_skipped: summary.existingEmployeeIds.size,
        total_payslips: summary.totalEmployeeCount,
        new_amount_added: summary.newTotalAmount,
        previous_amount: summary.existingTotalAmount,
        total_amount: summary.combinedTotalAmount
      };
      emitToTenant(tenantId, 'payroll_run_created', { id: createdRun.id });
      return res.status(201).json({ ...updatedRun, processing_summary });
    } catch (processErr) {
      console.error('Error generating payslips on create:', processErr);
      emitToTenant(tenantId, 'payroll_run_created', { id: createdRun.id });
      return res.status(201).json({ ...createdRun, processing_summary });
    }
  } catch (error: any) {
    console.error('Error creating payroll run:', error);
    console.error('Error details:', { code: error.code, detail: error.detail, constraint: error.constraint, message: error.message });

    // Handle unique constraint violation (duplicate month/year)
    if (error.code === '23505' || error.constraint?.includes('payroll_runs_unique')) {
      return res.status(409).json({ error: `A payroll run for this month/year already exists` });
    }

    // Handle RLS policy violation
    if (error.code === '42501') {
      return res.status(403).json({ error: 'Permission denied - tenant context issue' });
    }

    res.status(500).json({ error: 'Failed to create payroll run', details: error.message });
  }
});

// PUT /payroll/runs/:id - Update payroll run status
router.put('/runs/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { status, total_amount } = req.body;

    // Get current payroll run
    const currentRun = await getDb().query(
      `SELECT * FROM payroll_runs WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (currentRun.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const currentStatus = currentRun[0].status;

    // Define valid status transitions
    const validTransitions: { [key: string]: string[] } = {
      'DRAFT': ['APPROVED', 'PAID', 'CANCELLED', 'PROCESSING'],
      'PROCESSING': ['DRAFT', 'CANCELLED'],
      'APPROVED': ['PAID', 'DRAFT'],
      'PAID': [], // Final state - no transitions allowed
      'CANCELLED': [] // Final state - no transitions allowed
    };

    // Validate status transition
    if (!validTransitions[currentStatus]?.includes(status)) {
      return res.status(400).json({
        error: `Invalid status transition from ${currentStatus} to ${status}`,
        validTransitions: validTransitions[currentStatus] || []
      });
    }

    // Validation before approval
    if (status === 'APPROVED') {
      // Calculate period dates for this run
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const monthIndex = monthNames.indexOf(currentRun[0].month);
      const periodStart = new Date(currentRun[0].year, monthIndex, 1);
      const periodEnd = new Date(currentRun[0].year, monthIndex + 1, 0);

      // Get all active employees who should be included in this payroll period
      const activeEmployees = await getDb().query(
        `SELECT COUNT(*) as count FROM payroll_employees 
         WHERE tenant_id = $1 AND status = 'ACTIVE'
         AND joining_date <= $2
         AND (termination_date IS NULL OR termination_date >= $3)`,
        [tenantId, periodEnd.toISOString().split('T')[0], periodStart.toISOString().split('T')[0]]
      );
      const activeCount = parseInt(activeEmployees[0].count);

      // Get all payslips for this run
      const payslips = await getDb().query(
        `SELECT * FROM payslips WHERE payroll_run_id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      // Check if all active employees have payslips
      if (payslips.length < activeCount) {
        return res.status(400).json({
          error: `Cannot approve: ${activeCount - payslips.length} active employees are missing payslips. Please process payroll first.`,
          missingPayslips: activeCount - payslips.length,
          totalActive: activeCount,
          payslipsGenerated: payslips.length
        });
      }

      // Validate total amount matches sum of payslips
      const payslipTotal = payslips.reduce((sum: number, p: any) => {
        return sum + parseFloat(p.net_pay || 0);
      }, 0);
      const runTotal = parseFloat(currentRun[0].total_amount || 0);
      const difference = Math.abs(payslipTotal - runTotal);

      // Allow small rounding differences (up to 0.01)
      if (difference > 0.01) {
        return res.status(400).json({
          error: `Cannot approve: Total amount mismatch. Run total: ${runTotal}, Payslips sum: ${payslipTotal}, Difference: ${difference}`,
          runTotal,
          payslipTotal,
          difference
        });
      }

      // Validate employee count matches
      if (payslips.length !== parseInt(currentRun[0].employee_count || 0)) {
        return res.status(400).json({
          error: `Cannot approve: Employee count mismatch. Run count: ${currentRun[0].employee_count}, Payslips count: ${payslips.length}`,
          runEmployeeCount: currentRun[0].employee_count,
          payslipCount: payslips.length
        });
      }
    }

    // Validation before marking as PAID (allow DRAFT or APPROVED once all payslips are paid)
    if (status === 'PAID') {
      if (currentStatus !== 'APPROVED' && currentStatus !== 'DRAFT') {
        return res.status(400).json({
          error: 'Payroll run must be DRAFT or APPROVED before it can be marked as PAID',
          currentStatus
        });
      }

      // Check if all payslips are paid
      const payslips = await getDb().query(
        `SELECT COUNT(*) as total, 
                COUNT(*) FILTER (WHERE is_paid = true) as paid
         FROM payslips 
         WHERE payroll_run_id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      const totalPayslips = parseInt(payslips[0].total);
      const paidPayslips = parseInt(payslips[0].paid);

      if (totalPayslips === 0) {
        return res.status(400).json({
          error: 'Cannot mark as PAID: No payslips found for this run'
        });
      }

      if (paidPayslips < totalPayslips) {
        return res.status(400).json({
          error: `Cannot mark as PAID: ${totalPayslips - paidPayslips} payslips are still unpaid`,
          totalPayslips,
          paidPayslips,
          unpaidPayslips: totalPayslips - paidPayslips
        });
      }
    }

    // Prevent modifications to approved/paid runs
    if ((currentStatus === 'APPROVED' || currentStatus === 'PAID') && status === 'DRAFT') {
      // Only allow going back to DRAFT if explicitly requested and user has permission
      // For now, we'll allow it but log a warning
      console.warn(`⚠️ Payroll run ${id} being reverted from ${currentStatus} to DRAFT by user ${userId}`);
    }

    let additionalFields = '';
    const params: any[] = [status, userId, id, tenantId];

    if (status === 'APPROVED') {
      additionalFields = ', approved_by = $5, approved_at = CURRENT_TIMESTAMP';
      params.push(userId);
    } else if (status === 'PAID') {
      additionalFields = ', paid_at = CURRENT_TIMESTAMP';
    }

    if (total_amount !== undefined) {
      const idx = params.length + 1;
      additionalFields += `, total_amount = $${idx}`;
      params.push(total_amount);
    }

    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE payroll_runs SET
        status = $1,
        updated_by = $2,
        updated_at = NOW(),
        version = COALESCE(version, 1) + 1
        ${additionalFields}
      WHERE id = $3 AND tenant_id = $4
    `;

    if (clientVersion != null) {
      updateQuery = updateQuery.replace('WHERE id = $3', `WHERE id = $3 AND version = $${params.length + 1}`);
      params.push(clientVersion);
    }

    const result = await getDb().query(
      updateQuery.replace('WHERE id = $3', 'WHERE id = $3'), // redundant but safe
      params
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    emitToTenant(tenantId, 'payroll_run_updated', { id });

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating payroll run:', error);
    res.status(500).json({ error: 'Failed to update payroll run' });
  }
});

// DELETE /payroll/runs/:id - Soft delete payroll run
router.delete('/runs/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const result = await getDb().query(
      `UPDATE payroll_runs SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    emitToTenant(tenantId, 'payroll_run_updated', { id, deleted: true });

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting payroll run:', error);
    res.status(500).json({ error: 'Failed to delete payroll run' });
  }
});

// POST /payroll/runs/:id/process - Process payroll and generate payslips
// Only generates payslips for employees who don't already have one for this payroll run
router.post('/runs/:id/process', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    // Get the payroll run to check its status
    const runCheck = await getDb().query(
      `SELECT * FROM payroll_runs WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (runCheck.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    // Prevent reprocessing PAID runs (final state)
    // Allow APPROVED runs to be reprocessed for new backdated employees
    const currentStatus = runCheck[0].status;
    if (currentStatus === 'PAID') {
      return res.status(400).json({
        error: `Cannot process payroll run with status PAID. This is a final state.`,
        currentStatus
      });
    }

    if (currentStatus === 'APPROVED') {
      console.log(`📋 Re-processing APPROVED payroll run ${id} to add new employees. Will auto-approve after.`);
    }

    // Set status to PROCESSING while processing
    if (currentStatus !== 'PROCESSING') {
      await getDb().query(
        `UPDATE payroll_runs SET status = 'PROCESSING', updated_by = $1 WHERE id = $2 AND tenant_id = $3`,
        [userId, id, tenantId]
      );
    }

    try {
      const run = runCheck[0];
      const summary = await generatePayslipsForRun(tenantId, id, { month: run.month, year: run.year });

      // After generating payslips: set status to APPROVED (no separate approval step)
      const newStatus = summary.newPayslipsCount > 0 ? 'APPROVED' : currentStatus;

      const result = await getDb().query(
        `UPDATE payroll_runs SET
          status = $1,
          total_amount = $2,
          employee_count = $3,
          updated_by = $4
         WHERE id = $5 AND tenant_id = $6
         RETURNING *`,
        [newStatus, summary.combinedTotalAmount, summary.totalEmployeeCount, userId, id, tenantId]
      );

      emitToTenant(tenantId, 'payroll_run_updated', { id });

      res.json({
        ...result[0],
        processing_summary: {
          new_payslips_generated: summary.newPayslipsCount,
          existing_payslips_skipped: summary.existingEmployeeIds.size,
          total_payslips: summary.totalEmployeeCount,
          new_amount_added: summary.newTotalAmount,
          previous_amount: summary.existingTotalAmount,
          total_amount: summary.combinedTotalAmount
        }
      });
    } catch (processingError) {
      await getDb().query(
        `UPDATE payroll_runs SET status = $1, updated_by = $2 WHERE id = $3 AND tenant_id = $4`,
        [currentStatus === 'PROCESSING' ? 'DRAFT' : currentStatus, userId, id, tenantId]
      );
      throw processingError;
    }
  } catch (error) {
    console.error('Error processing payroll:', error);
    res.status(500).json({ error: 'Failed to process payroll' });
  }
});

// GET /payroll/runs/:id/payslips - Get payslips for a run
router.get('/runs/:runId/payslips', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { runId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const payslips = await getDb().query(
      `SELECT p.*, e.name as employee_name, e.designation, e.department
       FROM payslips p
       JOIN payroll_employees e ON p.employee_id = e.id
       WHERE p.payroll_run_id = $1 AND p.tenant_id = $2
       ORDER BY e.name ASC`,
      [runId, tenantId]
    );

    res.json(payslips);
  } catch (error) {
    console.error('Error fetching payslips:', error);
    res.status(500).json({ error: 'Failed to fetch payslips' });
  }
});

// GET /payroll/employees/:id/payslips - Get employee's payslip history
router.get('/employees/:employeeId/payslips', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { employeeId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const payslips = await getDb().query(
      `SELECT p.*, r.month, r.year, r.status as run_status
       FROM payslips p
       JOIN payroll_runs r ON p.payroll_run_id = r.id
       WHERE p.employee_id = $1 AND p.tenant_id = $2
       ORDER BY r.year DESC, r.created_at DESC`,
      [employeeId, tenantId]
    );

    res.json(payslips);
  } catch (error) {
    console.error('Error fetching employee payslips:', error);
    res.status(500).json({ error: 'Failed to fetch payslips' });
  }
});

// =====================================================
// GRADE LEVELS ROUTES
// =====================================================

// GET /payroll/grades - List all grades
router.get('/grades', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const grades = await getDb().query(
      `SELECT * FROM payroll_grades WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );

    res.json(grades);
  } catch (error) {
    console.error('Error fetching grades:', error);
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
});

// POST /payroll/grades - Create grade
router.post('/grades', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { name, description, min_salary, max_salary } = req.body;

    const result = await getDb().query(
      `INSERT INTO payroll_grades 
       (tenant_id, name, description, min_salary, max_salary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, name, description, min_salary || 0, max_salary || 0, userId]
    );

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating grade:', error);
    res.status(500).json({ error: 'Failed to create grade' });
  }
});

// PUT /payroll/grades/:id - Update grade
router.put('/grades/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { name, description, min_salary, max_salary } = req.body;

    const result = await getDb().query(
      `UPDATE payroll_grades SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        min_salary = COALESCE($3, min_salary),
        max_salary = COALESCE($4, max_salary),
        updated_by = $5
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [name, description, min_salary, max_salary, userId, id, tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating grade:', error);
    res.status(500).json({ error: 'Failed to update grade' });
  }
});

// =====================================================
// PROJECTS ROUTES
// =====================================================

// GET /payroll/projects - List all projects
router.get('/projects', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const projects = await getDb().query(
      `SELECT * FROM payroll_projects WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );

    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// POST /payroll/projects - Create project
router.post('/projects', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { name, code, description, status } = req.body;

    const result = await getDb().query(
      `INSERT INTO payroll_projects 
       (tenant_id, name, code, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, name, code, description, status || 'ACTIVE', userId]
    );

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /payroll/projects/:id - Update project
router.put('/projects/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { name, code, description, status } = req.body;

    const result = await getDb().query(
      `UPDATE payroll_projects SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        description = COALESCE($3, description),
        status = COALESCE($4, status),
        updated_by = $5
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [name, code, description, status, userId, id, tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// =====================================================
// SALARY COMPONENT TYPES ROUTES
// =====================================================

// GET /payroll/earning-types
router.get('/earning-types', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const components = await getDb().query(
      `SELECT * FROM payroll_salary_components 
       WHERE tenant_id = $1 AND type = 'ALLOWANCE' AND is_active = true
       ORDER BY name ASC`,
      [tenantId]
    );

    res.json(components.map((r: { name: string; default_value: number; is_percentage: boolean }) => ({
      name: r.name,
      amount: r.default_value,
      is_percentage: r.is_percentage,
      type: r.is_percentage ? 'Percentage' : 'Fixed'
    })));
  } catch (error) {
    console.error('Error fetching earning types:', error);
    res.status(500).json({ error: 'Failed to fetch earning types' });
  }
});

// GET /payroll/deduction-types
router.get('/deduction-types', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const components = await getDb().query(
      `SELECT * FROM payroll_salary_components 
       WHERE tenant_id = $1 AND type = 'DEDUCTION' AND is_active = true
       ORDER BY name ASC`,
      [tenantId]
    );

    res.json(components.map((r: { name: string; default_value: number; is_percentage: boolean }) => ({
      name: r.name,
      amount: r.default_value,
      is_percentage: r.is_percentage,
      type: r.is_percentage ? 'Percentage' : 'Fixed'
    })));
  } catch (error) {
    console.error('Error fetching deduction types:', error);
    res.status(500).json({ error: 'Failed to fetch deduction types' });
  }
});

// PUT /payroll/earning-types - Update earning types
router.put('/earning-types', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const { types } = req.body;

    for (const type of types) {
      await getDb().query(
        `INSERT INTO payroll_salary_components 
         (tenant_id, name, type, is_percentage, default_value)
         VALUES ($1, $2, 'ALLOWANCE', $3, $4)
         ON CONFLICT (tenant_id, name, type) DO UPDATE SET
          is_percentage = EXCLUDED.is_percentage,
          default_value = EXCLUDED.default_value`,
        [tenantId, type.name, type.is_percentage, type.amount]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating earning types:', error);
    res.status(500).json({ error: 'Failed to update earning types' });
  }
});

// PUT /payroll/deduction-types - Update deduction types
router.put('/deduction-types', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const { types } = req.body;

    for (const type of types) {
      await getDb().query(
        `INSERT INTO payroll_salary_components 
         (tenant_id, name, type, is_percentage, default_value)
         VALUES ($1, $2, 'DEDUCTION', $3, $4)
         ON CONFLICT (tenant_id, name, type) DO UPDATE SET
          is_percentage = EXCLUDED.is_percentage,
          default_value = EXCLUDED.default_value`,
        [tenantId, type.name, type.is_percentage, type.amount]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating deduction types:', error);
    res.status(500).json({ error: 'Failed to update deduction types' });
  }
});

// =====================================================
// PAYSLIP PAYMENT ROUTES
// =====================================================

// POST /payroll/payslips/:id/pay - Pay individual payslip and create transaction
router.post('/payslips/:id/pay', async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  const { id } = req.params;
  let accountId: string | undefined;

  try {

    console.log('💰 Payslip payment request:', {
      payslipId: id,
      tenantId,
      tenantIdType: typeof tenantId,
      tenantIdLength: tenantId?.length,
      userId,
      body: req.body
    });

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { categoryId, projectId, description, amount: requestAmount } = req.body;
    accountId = req.body.accountId;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    // System category ID for Salary Expenses - used by default for salary payments
    const SALARY_EXPENSES_CATEGORY_ID = 'sys-cat-sal-exp';
    const effectiveCategoryId = categoryId || SALARY_EXPENSES_CATEGORY_ID;

    // Get payslip details with employee info and payroll run status
    const payslipResult = await getDb().query(
      `SELECT p.*, e.name as employee_name, e.projects as employee_projects, 
              r.month, r.year, r.status as run_status, r.id as run_id
       FROM payslips p
       JOIN payroll_employees e ON p.employee_id = e.id
       JOIN payroll_runs r ON p.payroll_run_id = r.id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenantId]
    );

    if (payslipResult.length === 0) {
      console.error('❌ Payslip not found:', { payslipId: id, tenantId });
      return res.status(404).json({ error: 'Payslip not found' });
    }

    const payslip = payslipResult[0];
    console.log('✅ Payslip found:', {
      id: payslip.id,
      employee: payslip.employee_name,
      netPay: payslip.net_pay,
      isPaid: payslip.is_paid,
      runStatus: payslip.run_status
    });

    if (payslip.is_paid) {
      return res.status(400).json({ error: 'Payslip is already paid' });
    }

    // Use request amount if provided and valid; otherwise use payslip net pay
    const netPay = parseFloat(payslip.net_pay || '0');
    let paymentAmount = netPay;
    if (requestAmount !== undefined && requestAmount !== null && requestAmount !== '') {
      const parsed = parseFloat(String(requestAmount));
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'Payment amount must be a positive number' });
      }
      paymentAmount = parsed;
    }

    // Determine project from employee's project allocation (first one with highest allocation)
    let effectiveProjectId = projectId;
    if (!effectiveProjectId && payslip.employee_projects) {
      const projects = typeof payslip.employee_projects === 'string'
        ? JSON.parse(payslip.employee_projects)
        : payslip.employee_projects;
      if (projects && projects.length > 0) {
        // Sort by percentage descending and get the first one
        const sortedProjects = [...projects].sort((a: any, b: any) => (b.percentage || 0) - (a.percentage || 0));
        effectiveProjectId = sortedProjects[0].project_id;
      }
    }

    const txnDescription = description || `Salary payment for ${payslip.employee_name} - ${payslip.month} ${payslip.year}`;

    // System accounts that can be auto-created if missing (same as transactions route)
    const SYSTEM_ACCOUNTS: { [key: string]: { name: string; type: string; description: string } } = {
      'sys-acc-cash': { name: 'Cash', type: 'Bank', description: 'Default cash account' },
      'sys-acc-ar': { name: 'Accounts Receivable', type: 'Asset', description: 'System account for unpaid invoices' },
      'sys-acc-ap': { name: 'Accounts Payable', type: 'Liability', description: 'System account for unpaid bills and salaries' },
      'sys-acc-equity': { name: 'Owner Equity', type: 'Equity', description: 'System account for owner capital and equity' },
      'sys-acc-clearing': { name: 'Internal Clearing', type: 'Bank', description: 'System account for internal transfers and equity clearing' }
    };

    // Process payment atomically within a transaction (same approach as bill payment)

    // Process payment atomically within a transaction (same approach as bill payment)
    const db = getDb();
    const result = await db.transaction(async (client) => {
      // Validate and ensure account exists (same approach as transactions route - inside transaction)
      const accountCheck = await client.query(
        'SELECT id, name, type, balance FROM accounts WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)',
        [accountId, tenantId]
      );

      if (accountCheck.rows.length === 0) {
        // Check if it's a system account that should be auto-created
        if (!accountId) {
          throw {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Account ID is required',
            accountId: accountId
          };
        }

        // Use the base ID for system account lookup
        const systemAccount = SYSTEM_ACCOUNTS[accountId];
        if (systemAccount) {
          // Auto-create system account as a global entity (tenant_id IS NULL)
          console.log(`🔧 POST /payroll/payslips/:id/pay - Auto-creating missing global system account: ${accountId}`);
          await client.query(
            `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
             VALUES ($1, NULL, $2, $3, 0, TRUE, $4, NOW(), NOW())
             ON CONFLICT (id) DO NOTHING`,
            [accountId, systemAccount.name, systemAccount.type, systemAccount.description]
          );
          console.log(`✅ POST /payroll/payslips/:id/pay - Global system account created: ${accountId}`);

          // Re-query to get the newly created account
          const newAccountCheck = await client.query(
            'SELECT id, name, type, balance FROM accounts WHERE id = $1 AND tenant_id IS NULL',
            [accountId]
          );
          if (newAccountCheck.rows.length > 0) {
            accountCheck.rows.push(newAccountCheck.rows[0]);
          }
        }

        // If still not found, throw error (same as transactions route)
        if (accountCheck.rows.length === 0) {
          throw {
            code: 'ACCOUNT_NOT_FOUND',
            message: `Account with ID "${accountId}" does not exist or does not belong to this tenant. Please select a valid account.`,
            accountId: accountId
          };
        }
      }

      const account = accountCheck.rows[0];
      console.log('✅ Account verified:', { id: account.id, name: account.name, type: account.type, balance: account.balance });

      // Generate transaction ID
      const transactionId = `payslip-pay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      console.log('💳 Creating transaction:', {
        id: transactionId,
        type: 'Expense',
        amount: paymentAmount,
        accountId: accountId,
        categoryId: effectiveCategoryId,
        projectId: effectiveProjectId
      });

      // Create expense transaction for salary payment
      const transactionResult = await client.query(
        `INSERT INTO transactions 
         (id, tenant_id, type, amount, date, description, account_id, category_id, project_id, user_id, payslip_id)
         VALUES ($1, $2, 'Expense', $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [transactionId, tenantId, paymentAmount, txnDescription, accountId, effectiveCategoryId, effectiveProjectId || null, userId, id]
      );

      const transaction = transactionResult.rows[0];
      console.log('✅ Transaction created:', transaction.id);

      // Update account balance (supports both tenant-specific and global accounts)
      await client.query(
        `UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND (tenant_id = $3 OR tenant_id IS NULL)`,
        [paymentAmount, accountId, tenantId]
      );
      console.log('✅ Account balance updated');

      // Mark payslip as paid
      const updateResult = await client.query(
        `UPDATE payslips SET 
          is_paid = true,
          paid_at = CURRENT_TIMESTAMP,
          transaction_id = $1
         WHERE id = $2 AND tenant_id = $3
         RETURNING *`,
        [transaction.id, id, tenantId]
      );
      // 6. Check if all payslips for this run are now paid
      const runId = payslip.run_id;
      const statusCheck = await client.query(
        `SELECT COUNT(*) as total, 
                COUNT(*) FILTER (WHERE is_paid = true) as paid
         FROM payslips 
         WHERE payroll_run_id = $1 AND tenant_id = $2`,
        [runId, tenantId]
      );

      const totalNum = parseInt(statusCheck.rows[0].total);
      const paidNum = parseInt(statusCheck.rows[0].paid);

      if (totalNum > 0 && totalNum === paidNum) {
        console.log(`🎊 All ${totalNum} payslips for run ${runId} are paid. Updating run status to PAID.`);
        await client.query(
          'UPDATE payroll_runs SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
          ['PAID', runId, tenantId]
        );
      }

      return {
        transaction: transaction,
        payslip: updateResult.rows[0],
        totalCount: totalNum,
        paidCount: paidNum
      };
    });

    // 7. Emit WebSocket event and respond
    const totalPayslips = result.totalCount;
    const paidPayslips = result.paidCount;

    emitToTenant(tenantId, 'payslip_paid', {
      payslipId: id,
      transactionId: result.transaction.id,
      employeeId: payslip.employee_id,
      runId: payslip.run_id,
      paidCount: paidPayslips,
      totalCount: totalPayslips
    });

    console.log('✅ Payment completed successfully');
    res.json({
      success: true,
      payslip: result.payslip,
      transaction: result.transaction,
      paymentSummary: {
        paidPayslips,
        totalPayslips,
        remainingPayslips: totalPayslips - paidPayslips
      }
    });
  } catch (error: any) {
    console.error('❌ Error paying payslip:', error);

    // Handle specific error codes (same as transactions route)
    if (error.code === 'ACCOUNT_NOT_FOUND') {
      // Get available accounts for better error message
      const availableAccounts = await getDb().query(
        'SELECT id, name, type FROM accounts WHERE tenant_id = $1 ORDER BY name LIMIT 20',
        [tenantId]
      );

      return res.status(404).json({
        error: 'Payment account not found',
        message: error.message || `Account with ID "${accountId}" does not exist. Please select a valid account.`,
        accountId: accountId,
        availableAccounts: availableAccounts.map((a: any) => ({ id: a.id, name: a.name, type: a.type }))
      });
    }

    // Provide more specific error messages
    let errorMessage = 'Failed to pay payslip';
    if (error.code === '23503') {
      errorMessage = 'Invalid account, category, or project selected';
    } else if (error.code === '23505') {
      errorMessage = 'Duplicate transaction detected';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      error: errorMessage,
      details: error.message
    });
  }
});

// GET /payroll/payslips/:id - Get single payslip
router.get('/payslips/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const payslips = await getDb().query(
      `SELECT p.*, e.name as employee_name, e.designation, e.department,
              r.month, r.year, r.status as run_status
       FROM payslips p
       JOIN payroll_employees e ON p.employee_id = e.id
       JOIN payroll_runs r ON p.payroll_run_id = r.id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenantId]
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

// =====================================================
// PAYROLL SETTINGS ROUTES
// =====================================================

// GET /payroll/settings - Get payroll settings
router.get('/settings', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    // Get from app_settings table
    const settings = await getDb().query(
      `SELECT * FROM app_settings WHERE tenant_id = $1 AND key = 'payroll_settings'`,
      [tenantId]
    );

    if (settings.length === 0) {
      // Return default settings
      return res.json({
        defaultAccountId: null,
        defaultCategoryId: null,
        defaultProjectId: null
      });
    }

    res.json(settings[0].value);
  } catch (error) {
    console.error('Error fetching payroll settings:', error);
    res.status(500).json({ error: 'Failed to fetch payroll settings' });
  }
});

// PUT /payroll/settings - Update payroll settings
router.put('/settings', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { defaultAccountId, defaultCategoryId, defaultProjectId } = req.body;

    const settingsValue = {
      defaultAccountId,
      defaultCategoryId,
      defaultProjectId
    };

    // Upsert settings
    await getDb().query(
      `INSERT INTO app_settings (tenant_id, key, value)
       VALUES ($1, 'payroll_settings', $2)
       ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2`,
      [tenantId, JSON.stringify(settingsValue)]
    );

    res.json({ success: true, settings: settingsValue });
  } catch (error) {
    console.error('Error updating payroll settings:', error);
    res.status(500).json({ error: 'Failed to update payroll settings' });
  }
});

// =====================================================
// DEPARTMENT ROUTES
// =====================================================

// GET /payroll/departments - List all departments
router.get('/departments', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const departments = await getDb().query(
      `SELECT d.*, 
              pd.name as parent_department_name,
              (SELECT COUNT(*) FROM payroll_employees e WHERE e.department_id = d.id AND e.status = 'ACTIVE') as employee_count
       FROM payroll_departments d
       LEFT JOIN payroll_departments pd ON d.parent_department_id = pd.id
       WHERE d.tenant_id = $1 
       ORDER BY d.name ASC`,
      [tenantId]
    );

    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// GET /payroll/departments/:id - Get single department with employees
router.get('/departments/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const departments = await getDb().query(
      `SELECT d.*, 
              pd.name as parent_department_name
       FROM payroll_departments d
       LEFT JOIN payroll_departments pd ON d.parent_department_id = pd.id
       WHERE d.id = $1 AND d.tenant_id = $2`,
      [id, tenantId]
    );

    if (departments.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Get employees in this department
    const employees = await getDb().query(
      `SELECT id, name, email, designation, grade, status, photo
       FROM payroll_employees 
       WHERE department_id = $1 AND tenant_id = $2
       ORDER BY name ASC`,
      [id, tenantId]
    );

    res.json({
      ...departments[0],
      employees
    });
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({ error: 'Failed to fetch department' });
  }
});

// POST /payroll/departments - Create new department
router.post('/departments', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const {
      name,
      code,
      description,
      parent_department_id,
      head_employee_id,
      cost_center_code,
      budget_allocation,
      is_active
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const result = await getDb().query(
      `INSERT INTO payroll_departments 
       (tenant_id, name, code, description, parent_department_id, head_employee_id,
        cost_center_code, budget_allocation, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [tenantId, name, code || null, description || null,
        parent_department_id || null, head_employee_id || null,
        cost_center_code || null, budget_allocation || 0,
        is_active !== false, userId]
    );

    emitToTenant(tenantId, 'payroll_department_created', { id: result[0].id });

    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating department:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Department with this name or code already exists' });
    }
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// PUT /payroll/departments/:id - Update department
router.put('/departments/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const {
      name,
      code,
      description,
      parent_department_id,
      head_employee_id,
      cost_center_code,
      budget_allocation,
      is_active
    } = req.body;

    const result = await getDb().query(
      `UPDATE payroll_departments SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        description = COALESCE($3, description),
        parent_department_id = $4,
        head_employee_id = $5,
        cost_center_code = COALESCE($6, cost_center_code),
        budget_allocation = COALESCE($7, budget_allocation),
        is_active = COALESCE($8, is_active),
        updated_by = $9
       WHERE id = $10 AND tenant_id = $11
       RETURNING *`,
      [name, code, description, parent_department_id || null,
        head_employee_id || null, cost_center_code, budget_allocation,
        is_active, userId, id, tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    emitToTenant(tenantId, 'payroll_department_updated', { id });

    res.json(result[0]);
  } catch (error: any) {
    console.error('Error updating department:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Department with this name or code already exists' });
    }
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// DELETE /payroll/departments/:id - Delete department
router.delete('/departments/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    // Check if department has employees
    const empCount = await getDb().query(
      `SELECT COUNT(*) as count FROM payroll_employees 
       WHERE department_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (parseInt(empCount[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete department with assigned employees. Please reassign employees first.'
      });
    }

    // Check if department has child departments
    const childCount = await getDb().query(
      `SELECT COUNT(*) as count FROM payroll_departments 
       WHERE parent_department_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (parseInt(childCount[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete department with sub-departments. Please delete or reassign sub-departments first.'
      });
    }

    const result = await getDb().query(
      `DELETE FROM payroll_departments WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    emitToTenant(tenantId, 'payroll_department_deleted', { id });

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

// GET /payroll/departments/:id/employees - Get employees by department
router.get('/departments/:id/employees', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const employees = await getDb().query(
      `SELECT * FROM payroll_employees 
       WHERE department_id = $1 AND tenant_id = $2
       ORDER BY name ASC`,
      [id, tenantId]
    );

    res.json(employees);
  } catch (error) {
    console.error('Error fetching department employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// POST /payroll/departments/migrate - Migrate existing department names to normalized structure
router.post('/departments/migrate', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    // Call the migration function
    const result = await getDb().query(
      `SELECT migrate_employee_departments($1) as migrated_count`,
      [tenantId]
    );

    const migratedCount = result[0]?.migrated_count || 0;

    res.json({
      success: true,
      message: `Successfully migrated ${migratedCount} employee department references`,
      migrated_count: migratedCount
    });
  } catch (error) {
    console.error('Error migrating departments:', error);
    res.status(500).json({ error: 'Failed to migrate departments' });
  }
});

// GET /payroll/departments/stats - Get department statistics
router.get('/departments/stats', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const stats = await getDb().query(
      `SELECT 
         d.id,
         d.name,
         d.code,
         COUNT(e.id) as total_employees,
         COUNT(CASE WHEN e.status = 'ACTIVE' THEN 1 END) as active_employees,
         COALESCE(SUM(CASE WHEN e.status = 'ACTIVE' THEN (e.salary->>'basic')::numeric ELSE 0 END), 0) as total_basic_salary,
         d.budget_allocation
       FROM payroll_departments d
       LEFT JOIN payroll_employees e ON e.department_id = d.id AND e.tenant_id = $1
       WHERE d.tenant_id = $1 AND d.is_active = true
       GROUP BY d.id, d.name, d.code, d.budget_allocation
       ORDER BY total_employees DESC`,
      [tenantId]
    );

    res.json(stats);
  } catch (error) {
    console.error('Error fetching department stats:', error);
    res.status(500).json({ error: 'Failed to fetch department statistics' });
  }
});

// =====================================================
// MISSING PAYSLIPS DETECTION & GENERATION
// =====================================================

// GET /payroll/missing-payslips - Detect employees with missing payslips
router.get('/missing-payslips', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    // Get all payroll runs
    const runs = await getDb().query(
      `SELECT id, month, year, period_start, period_end FROM payroll_runs 
       WHERE tenant_id = $1 AND status != 'CANCELLED'
       ORDER BY year DESC, month DESC`,
      [tenantId]
    );

    const missingPayslips: any[] = [];

    for (const run of runs) {
      // Calculate period dates if not set
      let periodStart = run.period_start;
      let periodEnd = run.period_end;

      if (!periodStart || !periodEnd) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];
        const monthIndex = monthNames.indexOf(run.month);
        periodStart = new Date(run.year, monthIndex, 1).toISOString().split('T')[0];
        periodEnd = new Date(run.year, monthIndex + 1, 0).toISOString().split('T')[0];
      }

      // Find employees who should have payslips but don't
      const missing = await getDb().query(
        `SELECT e.id, e.name, e.employee_code, e.joining_date, e.designation, e.department
         FROM payroll_employees e
         WHERE e.tenant_id = $1 
         AND e.status = 'ACTIVE'
         AND e.joining_date <= $2
         AND (e.termination_date IS NULL OR e.termination_date >= $3)
         AND NOT EXISTS (
           SELECT 1 FROM payslips p 
           WHERE p.employee_id = e.id 
           AND p.payroll_run_id = $4
           AND p.tenant_id = $1
         )`,
        [tenantId, periodEnd, periodStart, run.id]
      );

      if (missing.length > 0) {
        missingPayslips.push({
          run_id: run.id,
          month: run.month,
          year: run.year,
          period_start: periodStart,
          period_end: periodEnd,
          missing_employees: missing
        });
      }
    }

    res.json({
      total_runs_checked: runs.length,
      runs_with_missing_payslips: missingPayslips.length,
      missing_payslips: missingPayslips
    });
  } catch (error) {
    console.error('Error detecting missing payslips:', error);
    res.status(500).json({ error: 'Failed to detect missing payslips' });
  }
});

// POST /payroll/generate-missing-payslips - Generate missing payslips for backdated employees
router.post('/generate-missing-payslips', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { employee_id, run_ids } = req.body;

    if (!employee_id && !run_ids) {
      return res.status(400).json({
        error: 'Either employee_id or run_ids must be provided'
      });
    }

    let generatedCount = 0;
    const results: any[] = [];

    // Get target runs
    let targetRuns;
    if (run_ids && run_ids.length > 0) {
      targetRuns = await getDb().query(
        `SELECT id, month, year, period_start, period_end, status FROM payroll_runs 
         WHERE tenant_id = $1 AND id = ANY($2) AND status != 'CANCELLED'`,
        [tenantId, run_ids]
      );
    } else {
      // Get all runs for the employee's tenure
      const employee = await getDb().query(
        `SELECT joining_date, termination_date FROM payroll_employees 
         WHERE id = $1 AND tenant_id = $2`,
        [employee_id, tenantId]
      );

      if (employee.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      targetRuns = await getDb().query(
        `SELECT id, month, year, period_start, period_end, status FROM payroll_runs 
         WHERE tenant_id = $1 AND status != 'CANCELLED'
         ORDER BY year, month`,
        [tenantId]
      );
    }

    // Process each run
    for (const run of targetRuns) {
      // Skip approved or paid runs unless explicitly requested
      if (run.status === 'APPROVED' || run.status === 'PAID') {
        results.push({
          run_id: run.id,
          month: run.month,
          year: run.year,
          status: 'skipped',
          reason: `Run is ${run.status} - cannot modify`
        });
        continue;
      }

      // Temporarily set status to PROCESSING
      await getDb().query(
        `UPDATE payroll_runs SET status = 'PROCESSING' WHERE id = $1 AND tenant_id = $2`,
        [run.id, tenantId]
      );

      try {
        // Use the existing process endpoint logic by calling it
        const processResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/payroll/runs/${run.id}/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
            'x-user-id': userId
          }
        });

        if (processResponse.ok) {
          const processResult = await processResponse.json() as any;
          generatedCount += processResult.processing_summary?.new_payslips_generated || 0;
          results.push({
            run_id: run.id,
            month: run.month,
            year: run.year,
            status: 'success',
            new_payslips: processResult.processing_summary?.new_payslips_generated || 0
          });
        } else {
          results.push({
            run_id: run.id,
            month: run.month,
            year: run.year,
            status: 'error',
            error: 'Failed to process run'
          });
        }
      } catch (error) {
        console.error(`Error processing run ${run.id}:`, error);
        results.push({
          run_id: run.id,
          month: run.month,
          year: run.year,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({
      success: true,
      total_runs_processed: targetRuns.length,
      total_payslips_generated: generatedCount,
      results
    });
  } catch (error) {
    console.error('Error generating missing payslips:', error);
    res.status(500).json({ error: 'Failed to generate missing payslips' });
  }
});

export default router;

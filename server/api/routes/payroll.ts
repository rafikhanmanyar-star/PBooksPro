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

const router = Router();

// =====================================================
// EMPLOYEE ROUTES
// =====================================================

// GET /payroll/employees - List all employees with department info
router.get('/employees', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const employees = await getDb().query(
      `SELECT e.*, 
              d.name as department_name,
              d.code as department_code
       FROM payroll_employees e
       LEFT JOIN payroll_departments d ON e.department_id = d.id
       WHERE e.tenant_id = $1 
       ORDER BY e.name ASC`,
      [tenantId]
    );

    res.json(employees);
  } catch (error) {
    console.error('Error fetching payroll employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /payroll/employees/:id - Get single employee with department info
router.get('/employees/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const employees = await getDb().query(
      `SELECT e.*, 
              d.name as department_name,
              d.code as department_code,
              d.description as department_description
       FROM payroll_employees e
       LEFT JOIN payroll_departments d ON e.department_id = d.id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [id, tenantId]
    );

    if (employees.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employees[0]);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
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

    const result = await getDb().query(
      `INSERT INTO payroll_employees 
       (tenant_id, name, email, phone, address, designation, department, department_id, grade, 
        joining_date, salary, projects, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE', $13)
       RETURNING *`,
      [tenantId, name, email, phone, address, designation, department, effectiveDepartmentId || null, grade,
       joining_date, JSON.stringify(salary || { basic: 0, allowances: [], deductions: [] }),
       JSON.stringify(projects || []), userId]
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
      grade, status, termination_date, salary, adjustments, projects
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

    const result = await getDb().query(
      `UPDATE payroll_employees SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        address = COALESCE($4, address),
        photo = COALESCE($5, photo),
        designation = COALESCE($6, designation),
        department = COALESCE($7, department),
        department_id = COALESCE($8, department_id),
        grade = COALESCE($9, grade),
        status = COALESCE($10, status),
        termination_date = COALESCE($11, termination_date),
        salary = COALESCE($12, salary),
        adjustments = COALESCE($13, adjustments),
        projects = COALESCE($14, projects),
        updated_by = $15
       WHERE id = $16 AND tenant_id = $17
       RETURNING *`,
      [name, email, phone, address, photo, designation, department, effectiveDepartmentId,
       grade, status, termination_date,
       salary ? JSON.stringify(salary) : null,
       adjustments ? JSON.stringify(adjustments) : null,
       projects ? JSON.stringify(projects) : null,
       userId, id, tenantId]
    );

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
      `DELETE FROM payroll_employees WHERE id = $1 AND tenant_id = $2 RETURNING id`,
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
       WHERE tenant_id = $1 
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
      `SELECT * FROM payroll_runs WHERE id = $1 AND tenant_id = $2`,
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

    // Get active employees count
    const empCount = await getDb().query(
      `SELECT COUNT(*) as count FROM payroll_employees 
       WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [tenantId]
    );

    const result = await getDb().query(
      `INSERT INTO payroll_runs 
       (tenant_id, month, year, status, employee_count, created_by)
       VALUES ($1, $2, $3, 'DRAFT', $4, $5)
       RETURNING *`,
      [tenantId, month, year, empCount[0].count, userId]
    );

    emitToTenant(tenantId, 'payroll_run_created', { id: result[0].id });

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating payroll run:', error);
    res.status(500).json({ error: 'Failed to create payroll run' });
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

    const result = await getDb().query(
      `UPDATE payroll_runs SET
        status = $1,
        updated_by = $2
        ${additionalFields}
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
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

    // Get employees who already have payslips for this run
    const existingPayslips = await getDb().query(
      `SELECT employee_id, net_pay FROM payslips 
       WHERE payroll_run_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    const existingEmployeeIds = new Set(existingPayslips.map((p: any) => p.employee_id));
    const existingTotalAmount = existingPayslips.reduce((sum: number, p: any) => sum + parseFloat(p.net_pay || 0), 0);

    // Get active employees who DON'T already have a payslip for this run
    const employees = await getDb().query(
      `SELECT * FROM payroll_employees 
       WHERE tenant_id = $1 AND status = 'ACTIVE'
       AND id NOT IN (
         SELECT employee_id FROM payslips 
         WHERE payroll_run_id = $2 AND tenant_id = $1
       )`,
      [tenantId, id]
    );

    let newTotalAmount = 0;
    let newPayslipsCount = 0;

    // Generate payslips only for new employees (those without existing payslips)
    for (const emp of employees) {
      const salary = emp.salary;
      const basic = salary.basic || 0;
      
      // Calculate allowances
      let totalAllowances = 0;
      (salary.allowances || []).forEach((a: any) => {
        totalAllowances += a.is_percentage ? (basic * a.amount) / 100 : a.amount;
      });

      // Calculate deductions
      const grossForDeductions = basic + totalAllowances;
      let totalDeductions = 0;
      (salary.deductions || []).forEach((d: any) => {
        totalDeductions += d.is_percentage ? (grossForDeductions * d.amount) / 100 : d.amount;
      });

      // Calculate adjustments
      const adjustments = emp.adjustments || [];
      const earningAdj = adjustments.filter((a: any) => a.type === 'EARNING')
        .reduce((sum: number, a: any) => sum + a.amount, 0);
      const deductionAdj = adjustments.filter((a: any) => a.type === 'DEDUCTION')
        .reduce((sum: number, a: any) => sum + a.amount, 0);

      const grossPay = basic + totalAllowances + earningAdj;
      const netPay = grossPay - totalDeductions - deductionAdj;
      
      newTotalAmount += netPay;
      newPayslipsCount++;

      // Insert payslip (no ON CONFLICT update - we only insert new ones)
      await getDb().query(
        `INSERT INTO payslips 
         (tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, 
          total_deductions, total_adjustments, gross_pay, net_pay,
          allowance_details, deduction_details, adjustment_details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [tenantId, id, emp.id, basic, totalAllowances, totalDeductions,
         earningAdj - deductionAdj, grossPay, netPay,
         JSON.stringify(salary.allowances || []),
         JSON.stringify(salary.deductions || []),
         JSON.stringify(adjustments)]
      );
    }

    // Calculate combined totals (existing + new)
    const combinedTotalAmount = existingTotalAmount + newTotalAmount;
    const totalEmployeeCount = existingEmployeeIds.size + newPayslipsCount;

    // Update payroll run with combined totals
    const result = await getDb().query(
      `UPDATE payroll_runs SET
        status = 'PROCESSING',
        total_amount = $1,
        employee_count = $2,
        updated_by = $3
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [combinedTotalAmount, totalEmployeeCount, userId, id, tenantId]
    );

    emitToTenant(tenantId, 'payroll_run_updated', { id });

    // Return detailed response with info about new vs existing payslips
    res.json({
      ...result[0],
      processing_summary: {
        new_payslips_generated: newPayslipsCount,
        existing_payslips_skipped: existingEmployeeIds.size,
        total_payslips: totalEmployeeCount,
        new_amount_added: newTotalAmount,
        previous_amount: existingTotalAmount,
        total_amount: combinedTotalAmount
      }
    });
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
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const { accountId, categoryId, projectId, description } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    // System category ID for Salary Expenses - used by default for salary payments
    const SALARY_EXPENSES_CATEGORY_ID = 'sys-cat-sal-exp';
    const effectiveCategoryId = categoryId || SALARY_EXPENSES_CATEGORY_ID;

    // Get payslip details with employee info
    const payslipResult = await getDb().query(
      `SELECT p.*, e.name as employee_name, e.projects as employee_projects, 
              r.month, r.year
       FROM payslips p
       JOIN payroll_employees e ON p.employee_id = e.id
       JOIN payroll_runs r ON p.payroll_run_id = r.id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenantId]
    );

    if (payslipResult.length === 0) {
      return res.status(404).json({ error: 'Payslip not found' });
    }

    const payslip = payslipResult[0];

    if (payslip.is_paid) {
      return res.status(400).json({ error: 'Payslip is already paid' });
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

    // Create expense transaction for salary payment
    const transactionResult = await getDb().query(
      `INSERT INTO transactions 
       (tenant_id, type, amount, date, description, account_id, category_id, project_id, user_id)
       VALUES ($1, 'Expense', $2, CURRENT_DATE, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, payslip.net_pay, txnDescription, accountId, effectiveCategoryId, effectiveProjectId || null, userId]
    );

    const transaction = transactionResult[0];

    // Update account balance
    await getDb().query(
      `UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND tenant_id = $3`,
      [payslip.net_pay, accountId, tenantId]
    );

    // Mark payslip as paid
    const updateResult = await getDb().query(
      `UPDATE payslips SET 
        is_paid = true,
        paid_at = CURRENT_TIMESTAMP,
        transaction_id = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [transaction.id, id, tenantId]
    );

    // Emit WebSocket event
    emitToTenant(tenantId, 'payslip_paid', { 
      payslipId: id, 
      transactionId: transaction.id,
      employeeId: payslip.employee_id 
    });

    res.json({
      success: true,
      payslip: updateResult[0],
      transaction: transaction
    });
  } catch (error) {
    console.error('Error paying payslip:', error);
    res.status(500).json({ error: 'Failed to pay payslip' });
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

export default router;

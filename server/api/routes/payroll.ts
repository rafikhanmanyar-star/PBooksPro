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

// GET /payroll/employees - List all employees
router.get('/employees', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const employees = await getDb().query(
      `SELECT * FROM payroll_employees 
       WHERE tenant_id = $1 
       ORDER BY name ASC`,
      [tenantId]
    );

    res.json(employees);
  } catch (error) {
    console.error('Error fetching payroll employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /payroll/employees/:id - Get single employee
router.get('/employees/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const employees = await getDb().query(
      `SELECT * FROM payroll_employees WHERE id = $1 AND tenant_id = $2`,
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

// POST /payroll/employees - Create new employee
router.post('/employees', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const {
      name, email, phone, address, designation, department,
      grade, joining_date, salary, projects
    } = req.body;

    const result = await getDb().query(
      `INSERT INTO payroll_employees 
       (tenant_id, name, email, phone, address, designation, department, grade, 
        joining_date, salary, projects, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE', $12)
       RETURNING *`,
      [tenantId, name, email, phone, address, designation, department, grade,
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

// PUT /payroll/employees/:id - Update employee
router.put('/employees/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const {
      name, email, phone, address, photo, designation, department,
      grade, status, termination_date, salary, adjustments, projects
    } = req.body;

    const result = await getDb().query(
      `UPDATE payroll_employees SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        address = COALESCE($4, address),
        photo = COALESCE($5, photo),
        designation = COALESCE($6, designation),
        department = COALESCE($7, department),
        grade = COALESCE($8, grade),
        status = COALESCE($9, status),
        termination_date = COALESCE($10, termination_date),
        salary = COALESCE($11, salary),
        adjustments = COALESCE($12, adjustments),
        projects = COALESCE($13, projects),
        updated_by = $14
       WHERE id = $15 AND tenant_id = $16
       RETURNING *`,
      [name, email, phone, address, photo, designation, department, grade,
       status, termination_date,
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
router.post('/runs/:id/process', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    // Get active employees
    const employees = await getDb().query(
      `SELECT * FROM payroll_employees 
       WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [tenantId]
    );

    let totalAmount = 0;

    // Generate payslips for each employee
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
      
      totalAmount += netPay;

      // Insert payslip
      await getDb().query(
        `INSERT INTO payslips 
         (tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, 
          total_deductions, total_adjustments, gross_pay, net_pay,
          allowance_details, deduction_details, adjustment_details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (payroll_run_id, employee_id) DO UPDATE SET
          basic_pay = EXCLUDED.basic_pay,
          total_allowances = EXCLUDED.total_allowances,
          total_deductions = EXCLUDED.total_deductions,
          total_adjustments = EXCLUDED.total_adjustments,
          gross_pay = EXCLUDED.gross_pay,
          net_pay = EXCLUDED.net_pay`,
        [tenantId, id, emp.id, basic, totalAllowances, totalDeductions,
         earningAdj - deductionAdj, grossPay, netPay,
         JSON.stringify(salary.allowances || []),
         JSON.stringify(salary.deductions || []),
         JSON.stringify(adjustments)]
      );
    }

    // Update payroll run with totals
    const result = await getDb().query(
      `UPDATE payroll_runs SET
        status = 'PROCESSING',
        total_amount = $1,
        employee_count = $2,
        updated_by = $3
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [totalAmount, employees.length, userId, id, tenantId]
    );

    emitToTenant(tenantId, 'payroll_run_updated', { id });

    res.json(result[0]);
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

export default router;

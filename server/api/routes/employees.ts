import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const employees = await db.query(
      'SELECT * FROM employees WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const employees = await db.query(
      'SELECT * FROM employees WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
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

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const employee = req.body;
    const employeeId = employee.id || `employee_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO employees (
        id, tenant_id, user_id, employee_id, personal_details, employment_details, status,
        basic_salary, salary_structure, project_assignments, bank_details, documents,
        lifecycle_history, termination_details, advance_balance, loan_balance, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                COALESCE((SELECT created_at FROM employees WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        employee_id = EXCLUDED.employee_id, personal_details = EXCLUDED.personal_details,
        employment_details = EXCLUDED.employment_details, status = EXCLUDED.status,
        basic_salary = EXCLUDED.basic_salary, salary_structure = EXCLUDED.salary_structure,
        project_assignments = EXCLUDED.project_assignments, bank_details = EXCLUDED.bank_details,
        documents = EXCLUDED.documents, lifecycle_history = EXCLUDED.lifecycle_history,
        termination_details = EXCLUDED.termination_details, advance_balance = EXCLUDED.advance_balance,
        loan_balance = EXCLUDED.loan_balance, user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        employeeId, req.tenantId, req.user?.userId || null, employee.employeeId || `EMP${Date.now()}`,
        typeof employee.personalDetails === 'object' ? JSON.stringify(employee.personalDetails) : (employee.personalDetails || '{}'),
        typeof employee.employmentDetails === 'object' ? JSON.stringify(employee.employmentDetails) : (employee.employmentDetails || '{}'),
        employee.status || 'Active', employee.basicSalary || 0,
        typeof employee.salaryStructure === 'object' ? JSON.stringify(employee.salaryStructure) : (employee.salaryStructure || '{}'),
        typeof employee.projectAssignments === 'object' ? JSON.stringify(employee.projectAssignments) : (employee.projectAssignments || '[]'),
        employee.bankDetails ? (typeof employee.bankDetails === 'object' ? JSON.stringify(employee.bankDetails) : employee.bankDetails) : null,
        typeof employee.documents === 'object' ? JSON.stringify(employee.documents) : (employee.documents || '[]'),
        typeof employee.lifecycleHistory === 'object' ? JSON.stringify(employee.lifecycleHistory) : (employee.lifecycleHistory || '[]'),
        employee.terminationDetails ? (typeof employee.terminationDetails === 'object' ? JSON.stringify(employee.terminationDetails) : employee.terminationDetails) : null,
        employee.advanceBalance || 0, employee.loanBalance || 0
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.EMPLOYEE_UPDATED : WS_EVENTS.EMPLOYEE_CREATED, {
      employee: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating employee:', error);
    res.status(500).json({ error: 'Failed to create/update employee', message: error.message });
  }
});

// POST /employees/:id/terminate - Terminate employee
router.post('/:id/terminate', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { terminationDetails } = req.body;
    const employeeId = req.params.id;

    // Get employee
    const employees = await db.query(
      'SELECT * FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, req.tenantId]
    );

    if (employees.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = employees[0];
    const currentLifecycle = typeof employee.lifecycle_history === 'string' 
      ? JSON.parse(employee.lifecycle_history) 
      : employee.lifecycle_history;

    // Add lifecycle event
    const event = {
      id: Date.now().toString(),
      date: terminationDetails.date,
      type: 'Exit',
      description: `${terminationDetails.type}: ${terminationDetails.reason}`,
      performedBy: req.user?.userId
    };

    const updatedLifecycle = [event, ...(currentLifecycle || [])];
    const newStatus = terminationDetails.type === 'Resignation' ? 'Resigned' : 'Terminated';

    // Update employee
    const result = await db.query(
      `UPDATE employees 
       SET status = $1, termination_details = $2, lifecycle_history = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [
        newStatus,
        typeof terminationDetails === 'object' ? JSON.stringify(terminationDetails) : terminationDetails,
        JSON.stringify(updatedLifecycle),
        employeeId,
        req.tenantId
      ]
    );

    emitToTenant(req.tenantId!, WS_EVENTS.EMPLOYEE_UPDATED, {
      employee: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error: any) {
    console.error('Error terminating employee:', error);
    res.status(500).json({ 
      error: 'Failed to terminate employee', 
      message: error.message 
    });
  }
});

// POST /employees/:id/promote - Promote employee
router.post('/:id/promote', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { newDesignation, newSalary, effectiveDate, newGrade, newDepartment } = req.body;
    const employeeId = req.params.id;

    // Get employee
    const employees = await db.query(
      'SELECT * FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, req.tenantId]
    );

    if (employees.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = employees[0];
    const currentEmployment = typeof employee.employment_details === 'string'
      ? JSON.parse(employee.employment_details)
      : employee.employment_details;
    
    const currentLifecycle = typeof employee.lifecycle_history === 'string' 
      ? JSON.parse(employee.lifecycle_history) 
      : employee.lifecycle_history;

    // Add lifecycle event
    const event = {
      id: Date.now().toString(),
      date: effectiveDate,
      type: 'Promotion',
      description: `Promoted to ${newDesignation}`,
      prevSalary: employee.basic_salary,
      newSalary,
      prevDesignation: currentEmployment.designation,
      newDesignation,
      prevGrade: currentEmployment.grade,
      newGrade,
      prevDepartment: currentEmployment.department,
      newDepartment,
      performedBy: req.user?.userId
    };

    const updatedLifecycle = [event, ...(currentLifecycle || [])];
    const updatedEmployment = {
      ...currentEmployment,
      designation: newDesignation,
      grade: newGrade || currentEmployment.grade,
      department: newDepartment || currentEmployment.department
    };

    // Update employee
    const result = await db.query(
      `UPDATE employees 
       SET basic_salary = $1, employment_details = $2, lifecycle_history = $3, status = $4, updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6
       RETURNING *`,
      [
        newSalary,
        JSON.stringify(updatedEmployment),
        JSON.stringify(updatedLifecycle),
        'Promoted',
        employeeId,
        req.tenantId
      ]
    );

    emitToTenant(req.tenantId!, WS_EVENTS.EMPLOYEE_UPDATED, {
      employee: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error: any) {
    console.error('Error promoting employee:', error);
    res.status(500).json({ 
      error: 'Failed to promote employee', 
      message: error.message 
    });
  }
});

// POST /employees/:id/transfer - Transfer employee
router.post('/:id/transfer', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { projectAssignments, effectiveDate } = req.body;
    const employeeId = req.params.id;

    // Validate project assignments
    if (!projectAssignments || !Array.isArray(projectAssignments) || projectAssignments.length === 0) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'At least one project assignment is required'
      });
    }

    const totalPercentage = projectAssignments.reduce((sum, a) => sum + (a.percentage || 0), 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Total percentage must equal 100%'
      });
    }

    // Get employee
    const employees = await db.query(
      'SELECT * FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, req.tenantId]
    );

    if (employees.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = employees[0];
    const currentLifecycle = typeof employee.lifecycle_history === 'string' 
      ? JSON.parse(employee.lifecycle_history) 
      : employee.lifecycle_history;

    // Add lifecycle event
    const event = {
      id: Date.now().toString(),
      date: effectiveDate,
      type: 'Transfer',
      description: `Transferred to ${projectAssignments.length} project(s)`,
      performedBy: req.user?.userId,
      metadata: { projectAssignments }
    };

    const updatedLifecycle = [event, ...(currentLifecycle || [])];

    // Update employee
    const result = await db.query(
      `UPDATE employees 
       SET project_assignments = $1, lifecycle_history = $2, status = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [
        JSON.stringify(projectAssignments),
        JSON.stringify(updatedLifecycle),
        'Transferred',
        employeeId,
        req.tenantId
      ]
    );

    emitToTenant(req.tenantId!, WS_EVENTS.EMPLOYEE_UPDATED, {
      employee: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error: any) {
    console.error('Error transferring employee:', error);
    res.status(500).json({ 
      error: 'Failed to transfer employee', 
      message: error.message 
    });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM employees WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.EMPLOYEE_DELETED, {
      employeeId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

export default router;

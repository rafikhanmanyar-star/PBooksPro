/**
 * Payroll Storage Service
 * 
 * This service provides data access for the payroll module.
 * It uses the API for cloud storage with localStorage fallback for offline mode.
 * In local-only mode, uses only localStorage (no API calls).
 */

import { isLocalOnlyMode } from '../../../config/apiUrl';
import { payrollApi } from '../../../services/api/payrollApi';
import { persistPayrollRunsToDb, persistPayrollToDbInOrder, deletePayslipFromDb, deletePayrollRunFromDb, persistPayrollDepartmentsToDb, persistPayrollGradesToDb, persistPayrollEmployeesToDb } from './payrollDb';
import {
  PayrollEmployee,
  PayrollRun,
  Payslip,
  GradeLevel,
  Department,
  PayrollProject,
  EarningType,
  DeductionType,
  EmploymentStatus,
  PayrollStatus,
  normalizeEmployee,
  normalizePayrollRun,
  normalizePayslip
} from '../types';

// Local storage keys for offline/demo mode
const STORAGE_KEYS = {
  EMPLOYEES: 'payroll_employees',
  PAYROLL_RUNS: 'payroll_runs',
  PAYSLIPS: 'payroll_payslips',
  EARNING_TYPES: 'payroll_earning_types',
  DEDUCTION_TYPES: 'payroll_deduction_types',
  GRADE_LEVELS: 'payroll_grade_levels',
  DEPARTMENTS: 'payroll_departments',
  PROJECTS: 'payroll_projects'
};

// Check if we're in online mode (API available)
const isOnline = (): boolean => {
  return navigator.onLine;
};

// Get tenant-specific storage key
const getKey = (tenantId: string, key: string): string => {
  return `${key}_${tenantId}`;
};

// Default earning types (allowances only - Basic Pay is a separate field)
const DEFAULT_EARNING_TYPES: EarningType[] = [
  { name: 'House Rent Allowance', amount: 40, is_percentage: true, type: 'Percentage' },
  { name: 'Transport Allowance', amount: 2500, is_percentage: false, type: 'Fixed' },
  { name: 'Medical Allowance', amount: 1500, is_percentage: false, type: 'Fixed' }
];

// Default deduction types
const DEFAULT_DEDUCTION_TYPES: DeductionType[] = [
  { name: 'Provident Fund', amount: 12, is_percentage: true, type: 'Percentage' },
  { name: 'Professional Tax', amount: 200, is_percentage: false, type: 'Fixed' },
  { name: 'Health Insurance', amount: 500, is_percentage: false, type: 'Fixed' }
];

// Default grade levels
const DEFAULT_GRADE_LEVELS: GradeLevel[] = [
  { id: 'grade-1', tenant_id: '', name: 'G1', description: 'Entry Level', min_salary: 25000, max_salary: 50000 },
  { id: 'grade-2', tenant_id: '', name: 'G2', description: 'Junior', min_salary: 50000, max_salary: 80000 },
  { id: 'grade-3', tenant_id: '', name: 'G3', description: 'Mid-Level', min_salary: 80000, max_salary: 120000 },
  { id: 'grade-4', tenant_id: '', name: 'G4', description: 'Senior', min_salary: 120000, max_salary: 180000 },
  { id: 'grade-5', tenant_id: '', name: 'G5', description: 'Lead', min_salary: 180000, max_salary: 300000 },
  { id: 'grade-6', tenant_id: '', name: 'G6', description: 'Manager', min_salary: 300000, max_salary: 500000 }
];

// Default departments with enhanced structure
const DEFAULT_DEPARTMENTS: Department[] = [
  { id: 'dept-1', tenant_id: '', name: 'Engineering', code: 'ENG', description: 'Software development and technical operations', is_active: true, budget_allocation: 0 },
  { id: 'dept-2', tenant_id: '', name: 'Product', code: 'PRD', description: 'Product management and design', is_active: true, budget_allocation: 0 },
  { id: 'dept-3', tenant_id: '', name: 'Sales', code: 'SLS', description: 'Sales and business development', is_active: true, budget_allocation: 0 },
  { id: 'dept-4', tenant_id: '', name: 'Human Resources', code: 'HR', description: 'HR and people operations', is_active: true, budget_allocation: 0 },
  { id: 'dept-5', tenant_id: '', name: 'Operations', code: 'OPS', description: 'Business operations and administration', is_active: true, budget_allocation: 0 },
  { id: 'dept-6', tenant_id: '', name: 'Finance', code: 'FIN', description: 'Finance and accounting', is_active: true, budget_allocation: 0 },
  { id: 'dept-7', tenant_id: '', name: 'Marketing', code: 'MKT', description: 'Marketing and communications', is_active: true, budget_allocation: 0 }
];

// Mock employees for demo
const DEMO_EMPLOYEES: PayrollEmployee[] = [
  {
    id: 'emp-demo-1',
    tenant_id: '',
    name: 'Ahmad Khan',
    email: 'ahmad.khan@company.com',
    phone: '+92 300 1234567',
    designation: 'Senior Developer',
    department: 'Engineering',
    grade: 'G4',
    status: EmploymentStatus.ACTIVE,
    joining_date: '2022-03-15',
    salary: {
      basic: 150000,
      allowances: [
        { name: 'House Rent Allowance', amount: 40, is_percentage: true },
        { name: 'Transport Allowance', amount: 2500, is_percentage: false }
      ],
      deductions: [
        { name: 'Provident Fund', amount: 12, is_percentage: true },
        { name: 'Health Insurance', amount: 500, is_percentage: false }
      ]
    },
    adjustments: [],
    projects: [],
    created_by: 'system'
  },
  {
    id: 'emp-demo-2',
    tenant_id: '',
    name: 'Sara Ahmed',
    email: 'sara.ahmed@company.com',
    phone: '+92 321 9876543',
    designation: 'Product Manager',
    department: 'Product',
    grade: 'G5',
    status: EmploymentStatus.ACTIVE,
    joining_date: '2021-08-20',
    salary: {
      basic: 200000,
      allowances: [
        { name: 'House Rent Allowance', amount: 40, is_percentage: true },
        { name: 'Transport Allowance', amount: 5000, is_percentage: false }
      ],
      deductions: [
        { name: 'Provident Fund', amount: 12, is_percentage: true }
      ]
    },
    adjustments: [],
    projects: [],
    created_by: 'system'
  }
];

// Demo payroll runs
const DEMO_PAYROLL_RUNS: PayrollRun[] = [
  {
    id: 'run-demo-1',
    tenant_id: '',
    month: 'December',
    year: 2025,
    status: PayrollStatus.PAID,
    total_amount: 450000,
    employee_count: 2,
    created_by: 'system'
  },
  {
    id: 'run-demo-2',
    tenant_id: '',
    month: 'January',
    year: 2026,
    status: PayrollStatus.DRAFT,
    total_amount: 0,
    employee_count: 2,
    created_by: 'system'
  }
];

/**
 * Payroll Storage Service
 * Provides CRUD operations for payroll data with API/localStorage fallback
 */
export const storageService = {
  // ==================== INITIALIZATION ====================

  /**
   * Initialize storage with default data if empty
   */
  init(tenantId: string): void {
    // NOTE: Demo data seeding has been removed - system now starts empty
    // Users should create their own employees and payroll runs
    // No longer seeding DEMO_EMPLOYEES or DEMO_PAYROLL_RUNS

    const earningsKey = getKey(tenantId, STORAGE_KEYS.EARNING_TYPES);
    if (!localStorage.getItem(earningsKey)) {
      localStorage.setItem(earningsKey, JSON.stringify(DEFAULT_EARNING_TYPES));
    }

    const deductionsKey = getKey(tenantId, STORAGE_KEYS.DEDUCTION_TYPES);
    if (!localStorage.getItem(deductionsKey)) {
      localStorage.setItem(deductionsKey, JSON.stringify(DEFAULT_DEDUCTION_TYPES));
    }

    const gradesKey = getKey(tenantId, STORAGE_KEYS.GRADE_LEVELS);
    if (!localStorage.getItem(gradesKey)) {
      const seededGrades = DEFAULT_GRADE_LEVELS.map(g => ({ ...g, tenant_id: tenantId }));
      localStorage.setItem(gradesKey, JSON.stringify(seededGrades));
    }

    const departmentsKey = getKey(tenantId, STORAGE_KEYS.DEPARTMENTS);
    if (!localStorage.getItem(departmentsKey)) {
      const seededDepartments = DEFAULT_DEPARTMENTS.map(d => ({ ...d, tenant_id: tenantId }));
      localStorage.setItem(departmentsKey, JSON.stringify(seededDepartments));
    }

    const projectsKey = getKey(tenantId, STORAGE_KEYS.PROJECTS);
    if (!localStorage.getItem(projectsKey)) {
      localStorage.setItem(projectsKey, JSON.stringify([]));
    }
  },

  // ==================== EMPLOYEES ====================

  // Cache for API employees
  _employeesCache: new Map<string, { data: PayrollEmployee[], timestamp: number }>(),
  _employeesCacheTimeout: 60000, // 1 minute cache

  getEmployees(tenantId: string): PayrollEmployee[] {
    this.init(tenantId);
    const data = localStorage.getItem(getKey(tenantId, STORAGE_KEYS.EMPLOYEES));
    const raw = JSON.parse(data || '[]');
    const employees = raw.map(normalizeEmployee);
    // Deduplicate by id (keep last occurrence) so one row per employee
    const byId = new Map<string, PayrollEmployee>();
    employees.forEach(emp => byId.set(emp.id, emp));
    return Array.from(byId.values());
  },

  // Async method to fetch employees from API with localStorage fallback
  async getEmployeesFromApi(tenantId: string): Promise<PayrollEmployee[]> {
    if (isLocalOnlyMode()) {
      return this.getEmployees(tenantId);
    }
    const cached = this._employeesCache.get(tenantId);
    if (cached && (Date.now() - cached.timestamp) < this._employeesCacheTimeout) {
      return cached.data;
    }

    try {
      const employees = await payrollApi.getEmployees();
      if (employees.length > 0) {
        // Update cache
        this._employeesCache.set(tenantId, { data: employees, timestamp: Date.now() });
        // Also update localStorage for offline access
        localStorage.setItem(getKey(tenantId, STORAGE_KEYS.EMPLOYEES), JSON.stringify(employees));
        return employees;
      }
    } catch (error) {
      console.warn('Failed to fetch employees from API, using localStorage:', error);
    }
    
    // Fallback to localStorage
    return this.getEmployees(tenantId);
  },

  addEmployee(tenantId: string, employee: PayrollEmployee, userId: string): void {
    const employees = this.getEmployees(tenantId);
    const newEmployee = {
      ...employee,
      tenant_id: tenantId,
      created_by: userId,
      created_at: new Date().toISOString()
    };
    const existingIndex = employees.findIndex(e => e.id === newEmployee.id);
    if (existingIndex >= 0) {
      employees[existingIndex] = newEmployee;
    } else {
      employees.push(newEmployee);
    }
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.EMPLOYEES), JSON.stringify(employees));
    this._employeesCache.delete(tenantId);
    persistPayrollDepartmentsToDb(tenantId, this.getDepartments(tenantId)).catch(() => {});
    persistPayrollGradesToDb(tenantId, this.getGradeLevels(tenantId)).catch(() => {});
    persistPayrollEmployeesToDb(tenantId, this.getEmployees(tenantId)).catch(() => {});
  },

  updateEmployee(tenantId: string, employee: PayrollEmployee, userId: string): void {
    const employees = this.getEmployees(tenantId);
    const index = employees.findIndex(e => e.id === employee.id);
    if (index !== -1) {
      employees[index] = {
        ...employee,
        updated_by: userId,
        updated_at: new Date().toISOString()
      };
      localStorage.setItem(getKey(tenantId, STORAGE_KEYS.EMPLOYEES), JSON.stringify(employees));
      this._employeesCache.delete(tenantId);
      persistPayrollDepartmentsToDb(tenantId, this.getDepartments(tenantId)).catch(() => {});
      persistPayrollGradesToDb(tenantId, this.getGradeLevels(tenantId)).catch(() => {});
      persistPayrollEmployeesToDb(tenantId, this.getEmployees(tenantId)).catch(() => {});
    }
  },

  deleteEmployee(tenantId: string, employeeId: string): void {
    const employees = this.getEmployees(tenantId);
    const filtered = employees.filter(e => e.id !== employeeId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.EMPLOYEES), JSON.stringify(filtered));

    // Invalidate cache and persist updated list to DB
    this._employeesCache.delete(tenantId);
    persistPayrollEmployeesToDb(tenantId, filtered).catch(() => {});
  },

  // ==================== PAYROLL RUNS ====================

  getPayrollRuns(tenantId: string): PayrollRun[] {
    this.init(tenantId);
    const data = localStorage.getItem(getKey(tenantId, STORAGE_KEYS.PAYROLL_RUNS));
    const runs = JSON.parse(data || '[]');
    return runs.map(normalizePayrollRun);
  },

  addPayrollRun(tenantId: string, run: PayrollRun, userId: string): void {
    const runs = this.getPayrollRuns(tenantId);
    const newRun = {
      ...run,
      tenant_id: tenantId,
      created_by: userId,
      created_at: new Date().toISOString()
    };
    runs.unshift(newRun); // Add to beginning
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PAYROLL_RUNS), JSON.stringify(runs));
    persistPayrollRunsToDb(tenantId, runs).catch(() => {});
  },

  updatePayrollRun(tenantId: string, run: PayrollRun, userId: string): void {
    const runs = this.getPayrollRuns(tenantId);
    const index = runs.findIndex(r => r.id === run.id);
    if (index !== -1) {
      runs[index] = {
        ...run,
        updated_by: userId,
        updated_at: new Date().toISOString()
      };
      localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PAYROLL_RUNS), JSON.stringify(runs));
      persistPayrollRunsToDb(tenantId, runs).catch(() => {});
    }
  },

  /** Delete a payroll run from storage and DB. Use for empty/phantom runs (e.g. 0 employees). */
  deletePayrollRun(tenantId: string, runId: string): boolean {
    const runs = this.getPayrollRuns(tenantId);
    const index = runs.findIndex(r => r.id === runId);
    if (index === -1) return false;
    const next = runs.filter(r => r.id !== runId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PAYROLL_RUNS), JSON.stringify(next));
    persistPayrollRunsToDb(tenantId, next).catch(() => {});
    deletePayrollRunFromDb(tenantId, runId).catch(() => {});
    return true;
  },

  // ==================== PAYSLIPS ====================

  getPayslips(tenantId: string): Payslip[] {
    this.init(tenantId);
    const data = localStorage.getItem(getKey(tenantId, STORAGE_KEYS.PAYSLIPS));
    const list = JSON.parse(data || '[]');
    return list.map((ps: any) => normalizePayslip(ps));
  },

  /** Hydration from DB: overwrite localStorage with runs and payslips (used after loading from SQLite). */
  setPayrollRuns(tenantId: string, runs: PayrollRun[]): void {
    this.init(tenantId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PAYROLL_RUNS), JSON.stringify(runs));
  },

  setPayslips(tenantId: string, payslips: Payslip[]): void {
    this.init(tenantId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PAYSLIPS), JSON.stringify(payslips));
  },

  setEmployees(tenantId: string, employees: PayrollEmployee[]): void {
    this.init(tenantId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.EMPLOYEES), JSON.stringify(employees));
    this._employeesCache.delete(tenantId);
  },

  setDepartments(tenantId: string, departments: Department[]): void {
    this.init(tenantId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.DEPARTMENTS), JSON.stringify(departments));
  },

  setGradeLevels(tenantId: string, grades: GradeLevel[]): void {
    this.init(tenantId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.GRADE_LEVELS), JSON.stringify(grades));
  },

  getPayslipsByRunId(tenantId: string, payrollRunId: string): Payslip[] {
    return this.getPayslips(tenantId).filter(ps => ps.payroll_run_id === payrollRunId);
  },

  getPayslipByRunAndEmployee(tenantId: string, payrollRunId: string, employeeId: string): Payslip | null {
    const list = this.getPayslips(tenantId);
    return list.find(ps => ps.payroll_run_id === payrollRunId && ps.employee_id === employeeId) || null;
  },

  addPayslip(tenantId: string, payslip: Payslip): void {
    const list = this.getPayslips(tenantId);
    const next = [...list, { ...payslip, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PAYSLIPS), JSON.stringify(next));
    persistPayrollToDbInOrder(tenantId, this.getPayrollRuns(tenantId), this.getEmployees(tenantId), next, this.getDepartments(tenantId), this.getGradeLevels(tenantId)).catch(() => {});
  },

  updatePayslip(tenantId: string, payslip: Payslip, userId?: string): void {
    const list = this.getPayslips(tenantId);
    const index = list.findIndex(ps => ps.id === payslip.id);
    if (index !== -1) {
      const next = list.slice();
      next[index] = { ...payslip, updated_at: new Date().toISOString() };
      localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PAYSLIPS), JSON.stringify(next));
      persistPayrollToDbInOrder(tenantId, this.getPayrollRuns(tenantId), this.getEmployees(tenantId), next, this.getDepartments(tenantId), this.getGradeLevels(tenantId)).catch(() => {});

      const runId = payslip.payroll_run_id;
      const runs = this.getPayrollRuns(tenantId);
      const run = runs.find(r => r.id === runId);
      if (run) {
        const runPayslips = next.filter(p => p.payroll_run_id === runId);
        const total_amount = runPayslips.reduce((s, p) => s + p.net_pay, 0);
        this.updatePayrollRun(tenantId, {
          ...run,
          total_amount,
          employee_count: runPayslips.length,
          updated_at: new Date().toISOString()
        }, userId || 'system');
      }
    }
  },

  /** Delete a payslip (paid or unpaid). Recalculates run total and employee_count. If run has no payslips left, sets run to DRAFT so it no longer appears in Payment History. */
  deletePayslip(tenantId: string, payslipId: string, userId: string): boolean {
    const list = this.getPayslips(tenantId);
    const ps = list.find(p => p.id === payslipId);
    if (!ps) return false;
    const next = list.filter(p => p.id !== payslipId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PAYSLIPS), JSON.stringify(next));
    persistPayrollToDbInOrder(tenantId, this.getPayrollRuns(tenantId), this.getEmployees(tenantId), next, this.getDepartments(tenantId), this.getGradeLevels(tenantId)).catch(() => {});

    deletePayslipFromDb(tenantId, payslipId).catch(() => {});

    const runId = ps.payroll_run_id;
    const runs = this.getPayrollRuns(tenantId);
    const run = runs.find(r => r.id === runId);
    if (run) {
      const runPayslips = next.filter(p => p.payroll_run_id === runId);
      const total_amount = runPayslips.reduce((s, p) => s + p.net_pay, 0);
      const allRemainingPaid = runPayslips.length > 0 && runPayslips.every(p => p.is_paid);
      const newStatus = runPayslips.length === 0 ? PayrollStatus.DRAFT : (allRemainingPaid ? PayrollStatus.PAID : PayrollStatus.DRAFT);
      this.updatePayrollRun(tenantId, {
        ...run,
        total_amount,
        employee_count: runPayslips.length,
        status: newStatus,
        paid_at: newStatus === PayrollStatus.PAID ? run.paid_at : undefined,
        updated_at: new Date().toISOString()
      }, userId);
    }
    return true;
  },

  // ==================== EARNING TYPES ====================

  getEarningTypes(tenantId: string): EarningType[] {
    this.init(tenantId);
    const data = localStorage.getItem(getKey(tenantId, STORAGE_KEYS.EARNING_TYPES));
    return JSON.parse(data || '[]');
  },

  updateEarningType(tenantId: string, type: EarningType, _userId: string): void {
    const types = this.getEarningTypes(tenantId);
    const index = types.findIndex(t => t.name === type.name);
    if (index !== -1) {
      types[index] = type;
    } else {
      types.push(type);
    }
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.EARNING_TYPES), JSON.stringify(types));
  },

  setEarningTypes(tenantId: string, types: EarningType[]): void {
    this.init(tenantId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.EARNING_TYPES), JSON.stringify(types));
  },

  setDeductionTypes(tenantId: string, types: DeductionType[]): void {
    this.init(tenantId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.DEDUCTION_TYPES), JSON.stringify(types));
  },

  // ==================== DEDUCTION TYPES ====================

  getDeductionTypes(tenantId: string): DeductionType[] {
    this.init(tenantId);
    const data = localStorage.getItem(getKey(tenantId, STORAGE_KEYS.DEDUCTION_TYPES));
    return JSON.parse(data || '[]');
  },

  updateDeductionType(tenantId: string, type: DeductionType, _userId: string): void {
    const types = this.getDeductionTypes(tenantId);
    const index = types.findIndex(t => t.name === type.name);
    if (index !== -1) {
      types[index] = type;
    } else {
      types.push(type);
    }
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.DEDUCTION_TYPES), JSON.stringify(types));
  },

  // ==================== GRADE LEVELS ====================

  getGradeLevels(tenantId: string): GradeLevel[] {
    this.init(tenantId);
    const data = localStorage.getItem(getKey(tenantId, STORAGE_KEYS.GRADE_LEVELS));
    return JSON.parse(data || '[]');
  },

  updateGradeLevel(tenantId: string, grade: GradeLevel, userId: string): void {
    const grades = this.getGradeLevels(tenantId);
    const index = grades.findIndex(g => g.id === grade.id);
    if (index !== -1) {
      grades[index] = { ...grade, updated_by: userId };
    } else {
      grades.push({ ...grade, tenant_id: tenantId, created_by: userId });
    }
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.GRADE_LEVELS), JSON.stringify(grades));
    persistPayrollGradesToDb(tenantId, this.getGradeLevels(tenantId)).catch(() => {});
  },

  // ==================== DEPARTMENTS ====================

  getDepartments(tenantId: string): Department[] {
    this.init(tenantId);
    const data = localStorage.getItem(getKey(tenantId, STORAGE_KEYS.DEPARTMENTS));
    return JSON.parse(data || '[]');
  },

  updateDepartment(tenantId: string, department: Department, userId: string): void {
    const departments = this.getDepartments(tenantId);
    const index = departments.findIndex(d => d.id === department.id);
    if (index !== -1) {
      departments[index] = { ...department, updated_by: userId };
    } else {
      departments.push({ ...department, tenant_id: tenantId, created_by: userId });
    }
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.DEPARTMENTS), JSON.stringify(departments));
    persistPayrollDepartmentsToDb(tenantId, this.getDepartments(tenantId)).catch(() => {});
  },

  deleteDepartment(tenantId: string, departmentId: string): void {
    const departments = this.getDepartments(tenantId);
    const filtered = departments.filter(d => d.id !== departmentId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.DEPARTMENTS), JSON.stringify(filtered));
  },

  // ==================== PROJECTS ====================
  // Projects are fetched from main application's projects module (Settings page)
  // This provides a cached/fallback version using localStorage

  _mainAppProjectsCache: null as PayrollProject[] | null,
  _mainAppProjectsCacheTime: 0,

  getProjects(tenantId: string): PayrollProject[] {
    this.init(tenantId);
    // Return cached main app projects if available and recent (within 5 minutes)
    if (this._mainAppProjectsCache && (Date.now() - this._mainAppProjectsCacheTime) < 300000) {
      return this._mainAppProjectsCache;
    }
    // Fallback to localStorage
    const data = localStorage.getItem(getKey(tenantId, STORAGE_KEYS.PROJECTS));
    return JSON.parse(data || '[]');
  },

  // Update cache with projects from main app
  setProjectsCache(projects: PayrollProject[]): void {
    this._mainAppProjectsCache = projects;
    this._mainAppProjectsCacheTime = Date.now();
  },

  addProject(tenantId: string, project: PayrollProject, userId: string): void {
    const projects = this.getProjects(tenantId);
    projects.push({
      ...project,
      tenant_id: tenantId,
      created_by: userId,
      created_at: new Date().toISOString()
    });
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PROJECTS), JSON.stringify(projects));
  },

  updateProject(tenantId: string, project: PayrollProject, userId: string): void {
    const projects = this.getProjects(tenantId);
    const index = projects.findIndex(p => p.id === project.id);
    if (index !== -1) {
      projects[index] = { ...project, updated_by: userId };
      localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PROJECTS), JSON.stringify(projects));
    }
  },

  /**
   * After GET /api/state/changes includes payroll_* entities, merge into localStorage (API mode).
   */
  applyPayrollIncrementalEntities(tenantId: string, entities: Record<string, unknown[]>): void {
    if (!tenantId || typeof localStorage === 'undefined') return;
    this.init(tenantId);

    const mergeById = <T>(
      storageKey: string,
      rows: unknown[] | undefined,
      normalize: (x: Record<string, unknown>) => T,
      idOf: (x: T) => string
    ) => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const key = getKey(tenantId, storageKey);
      const existing = JSON.parse(localStorage.getItem(key) || '[]') as T[];
      const map = new Map<string, T>();
      for (const item of existing) {
        map.set(idOf(item), item);
      }
      for (const raw of rows) {
        const r = raw as Record<string, unknown>;
        const id = String(r.id ?? '');
        if (!id) continue;
        const del = r.deleted_at ?? r.deletedAt;
        if (del) {
          map.delete(id);
        } else {
          map.set(id, normalize(r));
        }
      }
      localStorage.setItem(key, JSON.stringify(Array.from(map.values())));
    };

    const normGrade = (g: Record<string, unknown>): GradeLevel => ({
      id: String(g.id),
      tenant_id: String(g.tenant_id ?? g.tenantId ?? tenantId),
      name: String(g.name ?? ''),
      description: String(g.description ?? ''),
      min_salary: Number(g.min_salary ?? g.minSalary ?? 0),
      max_salary: Number(g.max_salary ?? g.maxSalary ?? 0),
      created_by: (g.created_by ?? g.createdBy) as string | undefined,
      updated_by: (g.updated_by ?? g.updatedBy) as string | undefined,
      created_at: (g.created_at ?? g.createdAt) as string | undefined,
      updated_at: (g.updated_at ?? g.updatedAt) as string | undefined
    });

    mergeById(STORAGE_KEYS.DEPARTMENTS, entities.payroll_departments as unknown[] | undefined, (r) => normalizeDepartment(r), (d) => d.id);
    mergeById(STORAGE_KEYS.GRADE_LEVELS, entities.payroll_grades as unknown[] | undefined, normGrade, (g) => g.id);
    mergeById(STORAGE_KEYS.EMPLOYEES, entities.payroll_employees as unknown[] | undefined, (r) => normalizeEmployee(r), (e) => e.id);
    mergeById(STORAGE_KEYS.PAYROLL_RUNS, entities.payroll_runs as unknown[] | undefined, (r) => normalizePayrollRun(r), (x) => x.id);
    mergeById(STORAGE_KEYS.PAYSLIPS, entities.payslips as unknown[] | undefined, (r) => normalizePayslip(r), (p) => p.id);

    const cfgRows = entities.payroll_tenant_config as unknown[] | undefined;
    if (Array.isArray(cfgRows) && cfgRows[0] && typeof cfgRows[0] === 'object') {
      const c = cfgRows[0] as Record<string, unknown>;
      if (Array.isArray(c.earning_types)) this.setEarningTypes(tenantId, c.earning_types as EarningType[]);
      if (Array.isArray(c.deduction_types)) this.setDeductionTypes(tenantId, c.deduction_types as DeductionType[]);
    }

    this._employeesCache.delete(tenantId);
    notifyPayrollStorageUpdated(tenantId);
  },

  /** Full list refresh from REST (used after incremental sync / realtime debounce). */
  async syncPayrollListsFromApi(tenantId: string): Promise<void> {
    if (isLocalOnlyMode()) return;
    this.init(tenantId);
    try {
      const [employees, runs, departments, grades, et, dt] = await Promise.all([
        payrollApi.getEmployees(),
        payrollApi.getPayrollRuns(),
        payrollApi.getDepartments(),
        payrollApi.getGradeLevels(),
        payrollApi.getEarningTypes(),
        payrollApi.getDeductionTypes()
      ]);
      this.setEmployees(tenantId, employees);
      localStorage.setItem(getKey(tenantId, STORAGE_KEYS.PAYROLL_RUNS), JSON.stringify(runs));
      this.setDepartments(tenantId, departments);
      this.setGradeLevels(tenantId, grades);
      this.setEarningTypes(tenantId, et);
      this.setDeductionTypes(tenantId, dt);

      const serverRunIds = new Set(runs.map((r) => r.id));
      const payslipLists = await Promise.all(runs.map((r) => payrollApi.getPayslipsByRun(r.id)));
      const serverPayslips = payslipLists.flat().map((p) => normalizePayslip(p));
      const existing = this.getPayslips(tenantId);
      const keepLocal = existing.filter((p) => !serverRunIds.has(p.payroll_run_id));
      const byId = new Map<string, Payslip>();
      for (const p of [...keepLocal, ...serverPayslips]) {
        byId.set(p.id, p);
      }
      this.setPayslips(tenantId, Array.from(byId.values()));
    } catch (e) {
      console.warn('[payroll] syncPayrollListsFromApi failed', e);
    }
    notifyPayrollStorageUpdated(tenantId);
  }
};

function notifyPayrollStorageUpdated(tenantId: string): void {
  if (typeof window === 'undefined' || !tenantId) return;
  try {
    window.dispatchEvent(new CustomEvent('pbooks-payroll-storage-updated', { detail: { tenantId } }));
  } catch {
    /* ignore */
  }
}

export default storageService;

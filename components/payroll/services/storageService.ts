/**
 * Payroll Storage Service
 * 
 * This service provides data access for the payroll module.
 * It uses the API for cloud storage with localStorage fallback for offline mode.
 * 
 * For proper multi-tenant support, use the tenant_id from AuthContext.
 */

import { payrollApi } from '../../../services/api/payrollApi';
import {
  PayrollEmployee,
  PayrollRun,
  GradeLevel,
  Department,
  PayrollProject,
  EarningType,
  DeductionType,
  EmploymentStatus,
  PayrollStatus,
  normalizeEmployee,
  normalizePayrollRun
} from '../types';

// Local storage keys for offline/demo mode
const STORAGE_KEYS = {
  EMPLOYEES: 'payroll_employees',
  PAYROLL_RUNS: 'payroll_runs',
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

// Default earning types
const DEFAULT_EARNING_TYPES: EarningType[] = [
  { name: 'Basic Pay', amount: 0, is_percentage: false, type: 'Fixed' },
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

// Default departments
const DEFAULT_DEPARTMENTS: Department[] = [
  { id: 'dept-1', tenant_id: '', name: 'Engineering', description: 'Software development and technical operations', is_active: true },
  { id: 'dept-2', tenant_id: '', name: 'Product', description: 'Product management and design', is_active: true },
  { id: 'dept-3', tenant_id: '', name: 'Sales', description: 'Sales and business development', is_active: true },
  { id: 'dept-4', tenant_id: '', name: 'Human Resources', description: 'HR and people operations', is_active: true },
  { id: 'dept-5', tenant_id: '', name: 'Operations', description: 'Business operations and administration', is_active: true },
  { id: 'dept-6', tenant_id: '', name: 'Finance', description: 'Finance and accounting', is_active: true },
  { id: 'dept-7', tenant_id: '', name: 'Marketing', description: 'Marketing and communications', is_active: true }
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
    projects: [
      { project_id: 'proj-1', project_name: 'Cloud Migration', percentage: 60, start_date: '2024-01-01' },
      { project_id: 'proj-2', project_name: 'Mobile App', percentage: 40, start_date: '2024-01-01' }
    ],
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
    projects: [
      { project_id: 'proj-1', project_name: 'Cloud Migration', percentage: 100, start_date: '2024-01-01' }
    ],
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
    // Seed default data if not present
    const empKey = getKey(tenantId, STORAGE_KEYS.EMPLOYEES);
    if (!localStorage.getItem(empKey)) {
      const seededEmployees = DEMO_EMPLOYEES.map(e => ({ ...e, tenant_id: tenantId }));
      localStorage.setItem(empKey, JSON.stringify(seededEmployees));
    }

    const runsKey = getKey(tenantId, STORAGE_KEYS.PAYROLL_RUNS);
    if (!localStorage.getItem(runsKey)) {
      const seededRuns = DEMO_PAYROLL_RUNS.map(r => ({ ...r, tenant_id: tenantId }));
      localStorage.setItem(runsKey, JSON.stringify(seededRuns));
    }

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
      localStorage.setItem(projectsKey, JSON.stringify([
        { id: 'proj-1', tenant_id: tenantId, name: 'Cloud Migration', code: 'CLM', status: 'ACTIVE', created_by: 'system' },
        { id: 'proj-2', tenant_id: tenantId, name: 'Mobile App', code: 'MOB', status: 'ACTIVE', created_by: 'system' }
      ]));
    }
  },

  // ==================== EMPLOYEES ====================

  // Cache for API employees
  _employeesCache: new Map<string, { data: PayrollEmployee[], timestamp: number }>(),
  _employeesCacheTimeout: 60000, // 1 minute cache

  getEmployees(tenantId: string): PayrollEmployee[] {
    this.init(tenantId);
    const data = localStorage.getItem(getKey(tenantId, STORAGE_KEYS.EMPLOYEES));
    const employees = JSON.parse(data || '[]');
    return employees.map(normalizeEmployee);
  },

  // Async method to fetch employees from API with localStorage fallback
  async getEmployeesFromApi(tenantId: string): Promise<PayrollEmployee[]> {
    // Check cache first
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
    employees.push(newEmployee);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.EMPLOYEES), JSON.stringify(employees));
    
    // Invalidate cache
    this._employeesCache.delete(tenantId);
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
    }
    
    // Invalidate cache
    this._employeesCache.delete(tenantId);
  },

  deleteEmployee(tenantId: string, employeeId: string): void {
    const employees = this.getEmployees(tenantId);
    const filtered = employees.filter(e => e.id !== employeeId);
    localStorage.setItem(getKey(tenantId, STORAGE_KEYS.EMPLOYEES), JSON.stringify(filtered));
    
    // Invalidate cache
    this._employeesCache.delete(tenantId);
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
    }
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
  }
};

export default storageService;

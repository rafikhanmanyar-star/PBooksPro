/**
 * Payroll Module Types
 * 
 * These types are aligned with the main application's patterns,
 * using snake_case for database fields and proper tenant/user isolation.
 */

import { coercePayslipAmounts } from './utils/payslipPaymentState';

// ==================== ENUMS ====================

export enum EmploymentStatus {
  ACTIVE = 'ACTIVE',
  RESIGNED = 'RESIGNED',
  TERMINATED = 'TERMINATED',
  ON_LEAVE = 'ON_LEAVE'
}

export enum PayrollStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED'
}

export enum AdjustmentType {
  EARNING = 'EARNING',
  DEDUCTION = 'DEDUCTION'
}

export enum SalaryComponentType {
  ALLOWANCE = 'ALLOWANCE',
  DEDUCTION = 'DEDUCTION'
}

// ==================== SALARY STRUCTURE ====================

export interface SalaryComponent {
  id: string;
  tenant_id: string;
  name: string;
  type: SalaryComponentType;
  is_percentage: boolean;
  default_value: number;
  is_taxable: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeSalaryComponent {
  name: string;
  amount: number;
  is_percentage: boolean;
}

export interface SalaryStructure {
  basic: number;
  allowances: EmployeeSalaryComponent[];
  deductions: EmployeeSalaryComponent[];
}

// ==================== DEPARTMENTS ====================

export interface Department {
  id: string;
  tenant_id: string;
  name: string;
  code?: string;                      // Short code for department (e.g., 'ENG', 'HR', 'FIN')
  description?: string;
  parent_department_id?: string;      // For hierarchical organization structure
  parent_department_name?: string;    // Populated from join
  head_employee_id?: string;          // Department head reference
  cost_center_code?: string;          // For accounting integration
  budget_allocation?: number;         // Department budget
  is_active: boolean;
  employee_count?: number;            // Computed field from API
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Department with employees (for detail view)
export interface DepartmentWithEmployees extends Department {
  employees: {
    id: string;
    name: string;
    email?: string;
    designation: string;
    grade?: string;
    status: EmploymentStatus;
    photo?: string;
  }[];
}

// Department statistics for reporting
export interface DepartmentStats {
  id: string;
  name: string;
  code?: string;
  total_employees: number;
  active_employees: number;
  total_basic_salary: number;
  budget_allocation: number;
}

// ==================== GRADE LEVELS ====================

export interface GradeLevel {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  min_salary: number;
  max_salary: number;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

// ==================== PROJECTS ====================

export interface PayrollProject {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD';
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectAllocation {
  project_id: string;
  project_name: string;
  percentage: number;
  start_date: string;
  end_date?: string;
}

export interface BuildingAllocation {
  building_id: string;
  building_name: string;
  percentage: number;
  start_date?: string;
  end_date?: string;
}

/** Project/building shares copied from the employee at payslip generation (immutable for that row). */
export interface PayslipAssignmentSnapshot {
  projects?: ProjectAllocation[];
  buildings?: BuildingAllocation[];
}

// ==================== ADJUSTMENTS ====================

export interface SalaryAdjustment {
  id: string;
  name: string;
  amount: number;
  type: AdjustmentType;
  date_added: string;
  created_by: string;
}

// ==================== EMPLOYEE ====================

export interface PayrollEmployee {
  id: string;
  tenant_id: string;
  user_id?: string;
  
  // Personal Info
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  photo?: string;
  
  // Employment Info
  employee_code?: string;
  designation: string;
  department: string;             // Department name (for backward compatibility)
  department_id?: string;         // Foreign key to payroll_departments table
  department_name?: string;       // Populated from join (convenience field)
  department_code?: string;       // Populated from join (convenience field)
  grade: string;
  status: EmploymentStatus;
  joining_date: string;
  termination_date?: string;
  
  // Salary & Assignments (stored as JSONB in DB)
  salary: SalaryStructure;
  adjustments: SalaryAdjustment[];
  projects: ProjectAllocation[];
  buildings?: BuildingAllocation[];
  
  // Audit
  created_by: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

// ==================== PAYROLL RUN ====================

export interface PayrollRun {
  id: string;
  tenant_id: string;
  
  // Period Info
  month: string;
  year: number;
  period_start?: string;
  period_end?: string;
  
  // Totals
  status: PayrollStatus;
  total_amount: number;
  employee_count: number;
  
  // Audit
  created_by: string;
  updated_by?: string;
  approved_by?: string;
  approved_at?: string;
  paid_at?: string;
  created_at?: string;
  updated_at?: string;
}

// ==================== PAYSLIP ====================

export interface Payslip {
  id: string;
  tenant_id: string;
  payroll_run_id: string;
  employee_id: string;
  
  // Amounts
  basic_pay: number;
  total_allowances: number;
  total_deductions: number;
  total_adjustments: number;
  gross_pay: number;
  net_pay: number;
  
  // Details (JSONB)
  allowance_details: EmployeeSalaryComponent[];
  deduction_details: EmployeeSalaryComponent[];
  adjustment_details: SalaryAdjustment[];
  /** Captured when the payslip was generated; used for display and payment splits instead of the employee's current assignments. */
  assignment_snapshot?: PayslipAssignmentSnapshot;
  
  // Status and partial payment
  is_paid: boolean;
  /** Total amount paid so far (for partial payments). Fully paid when paid_amount >= net_pay. */
  paid_amount?: number;
  paid_at?: string;
  transaction_id?: string;
  
  created_at?: string;
  updated_at?: string;
}

// ==================== EARNING/DEDUCTION TYPES ====================

export interface EarningType {
  name: string;
  amount: number;
  is_percentage: boolean;
  type: 'Fixed' | 'Percentage';
}

export interface DeductionType {
  name: string;
  amount: number;
  is_percentage: boolean;
  type: 'Fixed' | 'Percentage';
}

// ==================== API REQUEST/RESPONSE TYPES ====================

export interface PayrollEmployeeCreateRequest {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  designation: string;
  department: string;              // Department name (backward compatibility)
  department_id?: string;          // Department ID (for normalized structure)
  grade: string;
  joining_date: string;
  salary: SalaryStructure;
  projects?: ProjectAllocation[];
}

export interface PayrollEmployeeUpdateRequest extends Partial<PayrollEmployeeCreateRequest> {
  status?: EmploymentStatus;
  adjustments?: SalaryAdjustment[];
  termination_date?: string;
  photo?: string;
  buildings?: BuildingAllocation[];
}

export interface PayrollRunCreateRequest {
  month: string;
  year: number;
}

export interface PayrollRunUpdateRequest {
  status?: PayrollStatus;
}

// Processing summary returned when running payroll
export interface PayrollProcessingSummary {
  new_payslips_generated: number;
  existing_payslips_skipped: number;
  total_payslips: number;
  new_amount_added: number;
  previous_amount: number;
  total_amount: number;
}

export interface PayrollRunWithSummary extends PayrollRun {
  processing_summary?: PayrollProcessingSummary;
}

// ==================== COMPONENT PROPS ====================

export interface EmployeeListProps {
  onSelect: (employee: PayrollEmployee) => void;
  onAdd: () => void;
}

export interface EmployeeFormProps {
  onBack: () => void;
  onSave: () => void;
  employee?: PayrollEmployee; // For editing
}

export interface EmployeeProfileProps {
  employee: PayrollEmployee;
  onBack: () => void;
  onUpdate?: (employee: PayrollEmployee) => void;
  /** Increment when payroll data in storage changes (e.g. SQLite hydrate or API sync) so payslip lists recompute. */
  payrollStorageRevision?: number;
}

// ==================== LEGACY COMPATIBILITY ====================
// These aliases maintain backward compatibility with existing code

export type Employee = PayrollEmployee;

// Helper to convert legacy format to new format
/** Safely parse a value that may be a JSON string or already-parsed object/array */
function safeJsonParse<T>(value: any, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value as T;
}

export function normalizeEmployee(emp: any): PayrollEmployee {
  const salary = safeJsonParse(emp.salary, { basic: 0, allowances: [], deductions: [] });
  const rawAdjustments = safeJsonParse(emp.adjustments, []);
  const rawProjects = safeJsonParse(emp.projects, []);
  const rawBuildings = safeJsonParse(emp.buildings, []);

  return {
    id: emp.id,
    tenant_id: emp.tenant_id || emp.tenantId || '',
    user_id: emp.user_id || emp.userId,
    name: emp.name,
    email: emp.email,
    phone: emp.phone,
    address: emp.address,
    photo: emp.photo,
    employee_code: emp.employee_code || emp.employeeCode,
    designation: emp.designation,
    department: emp.department || emp.department_name || '',
    department_id: emp.department_id || emp.departmentId,
    department_name: emp.department_name || emp.departmentName,
    department_code: emp.department_code || emp.departmentCode,
    grade: emp.grade,
    status: emp.status,
    joining_date: emp.joining_date || emp.joiningDate,
    termination_date: emp.termination_date || emp.terminationDate,
    salary: {
      basic: salary.basic ?? 0,
      allowances: Array.isArray(salary.allowances) ? salary.allowances : [],
      deductions: Array.isArray(salary.deductions) ? salary.deductions : [],
    },
    adjustments: (Array.isArray(rawAdjustments) ? rawAdjustments : []).map((adj: any) => ({
      id: adj.id,
      name: adj.name,
      amount: adj.amount,
      type: adj.type,
      date_added: adj.date_added || adj.dateAdded,
      created_by: adj.created_by || adj.createdBy
    })),
    projects: (Array.isArray(rawProjects) ? rawProjects : []).map((p: any) => ({
      project_id: p.project_id || p.projectId,
      project_name: p.project_name || p.projectName,
      percentage: p.percentage,
      start_date: p.start_date || p.startDate,
      end_date: p.end_date || p.endDate
    })),
    buildings: (Array.isArray(rawBuildings) ? rawBuildings : []).map((b: any) => ({
      building_id: b.building_id || b.buildingId,
      building_name: b.building_name || b.buildingName,
      percentage: b.percentage,
      start_date: b.start_date || b.startDate,
      end_date: b.end_date || b.endDate
    })),
    created_by: emp.created_by || emp.createdBy || '',
    updated_by: emp.updated_by || emp.updatedBy,
    created_at: emp.created_at || emp.createdAt,
    updated_at: emp.updated_at || emp.updatedAt
  };
}

// Helper to normalize department data
export function normalizeDepartment(dept: any): Department {
  return {
    id: dept.id,
    tenant_id: dept.tenant_id || dept.tenantId || '',
    name: dept.name,
    code: dept.code,
    description: dept.description,
    parent_department_id: dept.parent_department_id || dept.parentDepartmentId,
    parent_department_name: dept.parent_department_name || dept.parentDepartmentName,
    head_employee_id: dept.head_employee_id || dept.headEmployeeId,
    cost_center_code: dept.cost_center_code || dept.costCenterCode,
    budget_allocation: dept.budget_allocation ?? dept.budgetAllocation ?? 0,
    is_active: dept.is_active ?? dept.isActive ?? true,
    employee_count: dept.employee_count ?? dept.employeeCount ?? 0,
    created_by: dept.created_by || dept.createdBy,
    updated_by: dept.updated_by || dept.updatedBy,
    created_at: dept.created_at || dept.createdAt,
    updated_at: dept.updated_at || dept.updatedAt
  };
}

export function normalizePayrollRun(run: any): PayrollRun {
  return {
    id: run.id,
    tenant_id: run.tenant_id || run.tenantId || '',
    month: run.month,
    year: run.year,
    period_start: run.period_start || run.periodStart,
    period_end: run.period_end || run.periodEnd,
    status: run.status,
    total_amount: run.total_amount ?? run.totalAmount ?? 0,
    employee_count: run.employee_count ?? run.employeeCount ?? 0,
    created_by: run.created_by || run.createdBy || '',
    updated_by: run.updated_by || run.updatedBy,
    approved_by: run.approved_by || run.approvedBy,
    approved_at: run.approved_at || run.approvedAt,
    paid_at: run.paid_at || run.paidAt,
    created_at: run.created_at || run.createdAt,
    updated_at: run.updated_at || run.updatedAt
  };
}

/** Used when hydrating payslips from SQLite/API JSON. */
export function parseAssignmentSnapshotFromApi(raw: unknown): PayslipAssignmentSnapshot | undefined {
  if (raw == null) return undefined;
  let o: unknown = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return undefined;
    try {
      o = JSON.parse(t);
    } catch {
      return undefined;
    }
  }
  if (typeof o !== 'object' || o === null) return undefined;
  const obj = o as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(obj, k);
  let projects: ProjectAllocation[] | undefined;
  let buildings: BuildingAllocation[] | undefined;
  if (has('projects')) {
    projects = Array.isArray(obj.projects)
      ? (obj.projects as any[]).map((p) => ({
          project_id: p.project_id || p.projectId,
          project_name: p.project_name || p.projectName,
          percentage: Number(p.percentage) || 0,
          start_date: p.start_date || p.startDate || '',
          end_date: p.end_date || p.endDate,
        }))
      : [];
  }
  if (has('buildings')) {
    buildings = Array.isArray(obj.buildings)
      ? (obj.buildings as any[]).map((b) => ({
          building_id: b.building_id || b.buildingId,
          building_name: b.building_name || b.buildingName,
          percentage: Number(b.percentage) || 0,
          start_date: b.start_date || b.startDate,
          end_date: b.end_date || b.endDate,
        }))
      : [];
  }
  if (projects === undefined && buildings === undefined) return undefined;
  const snap: PayslipAssignmentSnapshot = {};
  if (projects !== undefined) snap.projects = projects;
  if (buildings !== undefined) snap.buildings = buildings;
  return snap;
}

export function normalizePayslip(ps: any): Payslip {
  const allowanceDetails = safeJsonParse(ps.allowance_details, []);
  const deductionDetails = safeJsonParse(ps.deduction_details, []);
  const adjustmentDetails = safeJsonParse(ps.adjustment_details, []);
  const rawNet = ps.net_pay ?? ps.netPay ?? 0;
  const rawPaid = ps.paid_amount ?? ps.paidAmount ?? 0;
  const rawIsPaid = ps.is_paid ?? ps.isPaid ?? false;
  const payment = coercePayslipAmounts(rawNet, rawPaid, rawIsPaid);
  const assignment_snapshot = parseAssignmentSnapshotFromApi(
    ps.assignment_snapshot ?? ps.assignmentSnapshot
  );
  return {
    id: ps.id,
    tenant_id: ps.tenant_id || ps.tenantId || '',
    payroll_run_id: ps.payroll_run_id || ps.payrollRunId || '',
    employee_id: ps.employee_id || ps.employeeId || '',
    basic_pay: ps.basic_pay ?? ps.basicPay ?? 0,
    total_allowances: ps.total_allowances ?? ps.totalAllowances ?? 0,
    total_deductions: ps.total_deductions ?? ps.totalDeductions ?? 0,
    total_adjustments: ps.total_adjustments ?? ps.totalAdjustments ?? 0,
    gross_pay: ps.gross_pay ?? ps.grossPay ?? 0,
    net_pay: payment.net_pay,
    allowance_details: Array.isArray(allowanceDetails) ? allowanceDetails : [],
    deduction_details: Array.isArray(deductionDetails) ? deductionDetails : [],
    adjustment_details: Array.isArray(adjustmentDetails) ? adjustmentDetails : [],
    ...(assignment_snapshot !== undefined ? { assignment_snapshot } : {}),
    is_paid: payment.is_paid,
    paid_amount: payment.paid_amount,
    paid_at: ps.paid_at || ps.paidAt,
    transaction_id: ps.transaction_id || ps.transactionId,
    created_at: ps.created_at || ps.createdAt,
    updated_at: ps.updated_at || ps.updatedAt
  };
}

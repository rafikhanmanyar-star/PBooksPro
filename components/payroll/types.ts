/**
 * Payroll Module Types
 * 
 * These types are aligned with the main application's patterns,
 * using snake_case for database fields and proper tenant/user isolation.
 */

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
  department: string;
  grade: string;
  status: EmploymentStatus;
  joining_date: string;
  termination_date?: string;
  
  // Salary & Projects (stored as JSONB in DB)
  salary: SalaryStructure;
  adjustments: SalaryAdjustment[];
  projects: ProjectAllocation[];
  
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
  
  // Status
  is_paid: boolean;
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
  department: string;
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
}

export interface PayrollRunCreateRequest {
  month: string;
  year: number;
}

export interface PayrollRunUpdateRequest {
  status?: PayrollStatus;
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
}

// ==================== LEGACY COMPATIBILITY ====================
// These aliases maintain backward compatibility with existing code

export type Employee = PayrollEmployee;

// Helper to convert legacy format to new format
export function normalizeEmployee(emp: any): PayrollEmployee {
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
    department: emp.department,
    grade: emp.grade,
    status: emp.status,
    joining_date: emp.joining_date || emp.joiningDate,
    termination_date: emp.termination_date || emp.terminationDate,
    salary: emp.salary,
    adjustments: (emp.adjustments || []).map((adj: any) => ({
      id: adj.id,
      name: adj.name,
      amount: adj.amount,
      type: adj.type,
      date_added: adj.date_added || adj.dateAdded,
      created_by: adj.created_by || adj.createdBy
    })),
    projects: (emp.projects || []).map((p: any) => ({
      project_id: p.project_id || p.projectId,
      project_name: p.project_name || p.projectName,
      percentage: p.percentage,
      start_date: p.start_date || p.startDate,
      end_date: p.end_date || p.endDate
    })),
    created_by: emp.created_by || emp.createdBy || '',
    updated_by: emp.updated_by || emp.updatedBy,
    created_at: emp.created_at || emp.createdAt,
    updated_at: emp.updated_at || emp.updatedAt
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

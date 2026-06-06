export type PayrollDepartmentRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  description: string | null;
  parent_department_id: string | null;
  head_employee_id: string | null;
  cost_center_code: string | null;
  budget_allocation: string;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollGradeRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  min_salary: string;
  max_salary: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollEmployeeRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  photo: string | null;
  employee_code: string | null;
  designation: string;
  department: string;
  department_id: string | null;
  grade: string | null;
  status: string;
  joining_date: Date;
  termination_date: Date | null;
  salary: unknown;
  adjustments: unknown;
  projects: unknown;
  buildings: unknown;
  created_by: string;
  updated_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollRunRow = {
  id: string;
  tenant_id: string;
  month: string;
  year: number;
  period_start: Date | null;
  period_end: Date | null;
  status: string;
  total_amount: string;
  employee_count: number;
  created_by: string | null;
  updated_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  paid_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayslipRow = {
  id: string;
  tenant_id: string;
  payroll_run_id: string;
  employee_id: string;
  basic_pay: string;
  total_allowances: string;
  total_deductions: string;
  total_adjustments: string;
  gross_pay: string;
  net_pay: string;
  allowance_details: unknown;
  deduction_details: unknown;
  adjustment_details: unknown;
  assignment_snapshot: unknown;
  is_paid: boolean;
  paid_amount: string;
  paid_at: Date | null;
  transaction_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollSalaryComponentRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  is_percentage: boolean;
  default_value: string;
  is_taxable: boolean;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollProjectRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description: string | null;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollTenantConfigRow = {
  tenant_id: string;
  earning_types: unknown;
  deduction_types: unknown;
  default_account_id: string | null;
  default_category_id: string | null;
  default_project_id: string | null;
  updated_at: Date;
};

export type BulkPayPayslipLine = {
  payslipId: string;
  amount?: number;
  accountId: string;
  categoryId?: string;
  projectId?: string;
  buildingId?: string;
  description?: string;
  date?: string;
};

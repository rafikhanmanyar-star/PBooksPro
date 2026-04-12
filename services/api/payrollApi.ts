/**
 * Payroll API Service
 * 
 * Provides API methods for payroll module operations.
 * In local-only mode, uses storageService (localStorage) instead of API.
 */

import { isLocalOnlyMode } from '../../config/apiUrl';
import { getCurrentTenantId } from '../database/tenantUtils';
import { getCurrentUserId } from '../database/userUtils';
import { apiClient } from './client';
import { todayLocalYyyyMmDd } from '../../utils/dateUtils';
import {
  PayrollEmployee,
  PayrollRun,
  GradeLevel,
  Department,
  DepartmentWithEmployees,
  DepartmentStats,
  PayrollProject,
  EarningType,
  DeductionType,
  PayrollEmployeeCreateRequest,
  PayrollEmployeeUpdateRequest,
  PayrollRunCreateRequest,
  PayrollRunUpdateRequest,
  PayrollRunWithSummary,
  PayrollProcessingSummary,
  normalizeEmployee,
  normalizePayrollRun,
  normalizeDepartment,
  EmploymentStatus,
  PayrollStatus
} from '../../components/payroll/types';

function getTenantAndUser(): { tenantId: string; userId: string } {
  const tenantId = getCurrentTenantId() || 'local';
  const userId = getCurrentUserId() || 'local-user';
  return { tenantId, userId };
}

// ==================== EMPLOYEES ====================

export const payrollApi = {
  // Get all employees for current tenant
  async getEmployees(): Promise<PayrollEmployee[]> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getEmployees(tenantId);
    }
    try {
      const response = await apiClient.get<any[]>('/payroll/employees');
      return (response || []).map(normalizeEmployee);
    } catch (error) {
      console.error('Error fetching employees:', error);
      return [];
    }
  },

  // Get single employee by ID
  async getEmployee(id: string): Promise<PayrollEmployee | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getEmployees(tenantId).find((e) => e.id === id) ?? null;
    }
    try {
      const response = await apiClient.get<any>(`/payroll/employees/${id}`);
      return response ? normalizeEmployee(response) : null;
    } catch (error) {
      console.error('Error fetching employee:', error);
      return null;
    }
  },

  // Create new employee
  async createEmployee(data: PayrollEmployeeCreateRequest): Promise<PayrollEmployee | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId, userId } = getTenantAndUser();
      storageService.init(tenantId);
      const id = `emp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const employee = normalizeEmployee({ ...data, id, tenant_id: tenantId } as any);
      storageService.addEmployee(tenantId, employee, userId);
      return employee;
    }
    try {
      const response = await apiClient.post<any>('/payroll/employees', data);
      return response ? normalizeEmployee(response) : null;
    } catch (error) {
      console.error('Error creating employee:', error);
      throw error;
    }
  },

  // Update employee
  async updateEmployee(id: string, data: PayrollEmployeeUpdateRequest): Promise<PayrollEmployee | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId, userId } = getTenantAndUser();
      storageService.init(tenantId);
      const employees = storageService.getEmployees(tenantId);
      const existing = employees.find(e => e.id === id);
      if (!existing) return null;
      const updated = normalizeEmployee({ ...existing, ...data, id } as any);
      storageService.updateEmployee(tenantId, updated, userId);
      return updated;
    }
    try {
      const response = await apiClient.put<any>(`/payroll/employees/${id}`, data);
      return response ? normalizeEmployee(response) : null;
    } catch (error: any) {
      // 404 = employee exists only locally (e.g. create failed earlier) - sync to server by creating
      if (error?.status === 404) {
        try {
          const createPayload = {
            id,
            name: data.name ?? 'Unknown',
            email: data.email,
            phone: data.phone,
            address: data.address,
            designation: data.designation ?? 'Staff',
            department: data.department ?? 'General',
            department_id: data.department_id,
            grade: data.grade ?? '',
            joining_date: data.joining_date ?? todayLocalYyyyMmDd(),
            salary: data.salary ?? { basic: 0, allowances: [], deductions: [] },
            projects: data.projects ?? [],
          };
          const createResponse = await apiClient.post<any>('/payroll/employees', createPayload);
          if (createResponse) {
            return normalizeEmployee(createResponse);
          }
        } catch (createErr) {
          console.warn('Could not sync local employee to server:', createErr);
        }
      }
      console.error('Error updating employee:', error);
      throw error;
    }
  },

  // Delete employee
  async deleteEmployee(id: string): Promise<boolean> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.deleteEmployee(tenantId, id);
      return true;
    }
    try {
      await apiClient.delete(`/payroll/employees/${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting employee:', error);
      return false;
    }
  },

  // ==================== PAYROLL RUNS ====================

  // Get all payroll runs
  async getPayrollRuns(): Promise<PayrollRun[]> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getPayrollRuns(tenantId);
    }
    try {
      const response = await apiClient.get<any[]>('/payroll/runs');
      return (response || []).map(normalizePayrollRun);
    } catch (error) {
      console.error('Error fetching payroll runs:', error);
      return [];
    }
  },

  // Get single payroll run
  async getPayrollRun(id: string): Promise<PayrollRun | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getPayrollRuns(tenantId).find((r) => r.id === id) ?? null;
    }
    try {
      const response = await apiClient.get<any>(`/payroll/runs/${id}`);
      return response ? normalizePayrollRun(response) : null;
    } catch (error) {
      console.error('Error fetching payroll run:', error);
      return null;
    }
  },

  // Create new payroll run (server generates payslips and auto-approves in one step)
  async createPayrollRun(data: PayrollRunCreateRequest): Promise<PayrollRunWithSummary | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId, userId } = getTenantAndUser();
      storageService.init(tenantId);
      const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const run: PayrollRun = {
        id,
        tenant_id: tenantId,
        month: data.month,
        year: data.year,
        status: PayrollStatus.DRAFT,
        total_amount: 0,
        employee_count: 0,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      storageService.addPayrollRun(tenantId, run, userId);
      return { ...normalizePayrollRun(run), processing_summary: {} as PayrollProcessingSummary };
    }
    try {
      const response = await apiClient.post<any>('/payroll/runs', data);
      if (!response) return null;
      return {
        ...normalizePayrollRun(response),
        processing_summary: response.processing_summary
      };
    } catch (error) {
      console.error('Error creating payroll run:', error);
      throw error;
    }
  },

  // Update payroll run (status changes)
  async updatePayrollRun(id: string, data: PayrollRunUpdateRequest): Promise<PayrollRun | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId, userId } = getTenantAndUser();
      storageService.init(tenantId);
      const existing = storageService.getPayrollRuns(tenantId).find((r) => r.id === id);
      if (!existing) return null;
      const merged = normalizePayrollRun({ ...existing, ...data, id });
      storageService.updatePayrollRun(tenantId, merged, userId);
      return merged;
    }
    try {
      const response = await apiClient.put<any>(`/payroll/runs/${id}`, data);
      return response ? normalizePayrollRun(response) : null;
    } catch (error) {
      console.error('Error updating payroll run:', error);
      throw error;
    }
  },

  // Process payroll run (calculate payslips for new employees only)
  // Returns processing summary with info about new vs skipped payslips
  /** Optional `employeeId` limits generation to that employee only (e.g. back-dated manual payslip). */
  async processPayrollRun(
    id: string,
    options?: { employeeId?: string }
  ): Promise<PayrollRunWithSummary | null> {
    try {
      const body =
        options?.employeeId && String(options.employeeId).trim()
          ? { employeeId: String(options.employeeId).trim() }
          : {};
      const response = await apiClient.post<any>(`/payroll/runs/${id}/process`, body);
      if (!response) return null;
      
      const normalizedRun = normalizePayrollRun(response);
      return {
        ...normalizedRun,
        processing_summary: response.processing_summary
      };
    } catch (error) {
      console.error('Error processing payroll run:', error);
      throw error;
    }
  },

  // Delete payroll run and its unpaid payslips
  async deletePayrollRun(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      const ok = storageService.deletePayrollRun(tenantId, id);
      return ok ? { success: true, message: 'Deleted' } : { success: false, error: 'Not found' };
    }
    try {
      const response = await apiClient.delete<{ success: boolean; message: string }>(`/payroll/runs/${id}`);
      return response;
    } catch (error: any) {
      console.error('Error deleting payroll run:', error);
      return {
        success: false,
        error: error?.error || error?.message || 'Failed to delete payroll run'
      };
    }
  },

  // ==================== GRADE LEVELS ====================

  async getGradeLevels(): Promise<GradeLevel[]> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getGradeLevels(tenantId);
    }
    try {
      const response = await apiClient.get<GradeLevel[]>('/payroll/grades');
      return response || [];
    } catch (error) {
      console.error('Error fetching grade levels:', error);
      return [];
    }
  },

  async createGradeLevel(data: Omit<GradeLevel, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>): Promise<GradeLevel | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId, userId } = getTenantAndUser();
      storageService.init(tenantId);
      const id = `pg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const g: GradeLevel = {
        id,
        tenant_id: tenantId,
        name: data.name,
        description: data.description ?? '',
        min_salary: data.min_salary,
        max_salary: data.max_salary,
      };
      storageService.updateGradeLevel(tenantId, g, userId);
      return g;
    }
    try {
      return await apiClient.post<GradeLevel>('/payroll/grades', data);
    } catch (error) {
      console.error('Error creating grade level:', error);
      throw error;
    }
  },

  async updateGradeLevel(id: string, data: Partial<GradeLevel>): Promise<GradeLevel | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId, userId } = getTenantAndUser();
      storageService.init(tenantId);
      const existing = storageService.getGradeLevels(tenantId).find((g) => g.id === id);
      if (!existing) return null;
      const merged = { ...existing, ...data, id };
      storageService.updateGradeLevel(tenantId, merged, userId);
      return merged;
    }
    try {
      return await apiClient.put<GradeLevel>(`/payroll/grades/${id}`, data);
    } catch (error) {
      console.error('Error updating grade level:', error);
      throw error;
    }
  },

  // ==================== DEPARTMENTS ====================

  async getDepartments(): Promise<Department[]> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getDepartments(tenantId);
    }
    try {
      const response = await apiClient.get<any[]>('/payroll/departments');
      return (response || []).map(normalizeDepartment);
    } catch (error) {
      console.error('Error fetching departments:', error);
      return [];
    }
  },

  async getDepartment(id: string): Promise<DepartmentWithEmployees | null> {
    try {
      const response = await apiClient.get<any>(`/payroll/departments/${id}`);
      if (!response) return null;
      return {
        ...normalizeDepartment(response),
        employees: response.employees || []
      };
    } catch (error) {
      console.error('Error fetching department:', error);
      return null;
    }
  },

  async createDepartment(data: Omit<Department, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>): Promise<Department | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId, userId } = getTenantAndUser();
      storageService.init(tenantId);
      const id = `pd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const d = normalizeDepartment({
        ...data,
        id,
        tenant_id: tenantId,
      } as any);
      storageService.updateDepartment(tenantId, d, userId);
      return d;
    }
    try {
      const response = await apiClient.post<any>('/payroll/departments', data);
      return response ? normalizeDepartment(response) : null;
    } catch (error) {
      console.error('Error creating department:', error);
      throw error;
    }
  },

  async updateDepartment(id: string, data: Partial<Department>): Promise<Department | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId, userId } = getTenantAndUser();
      storageService.init(tenantId);
      const existing = storageService.getDepartments(tenantId).find((d) => d.id === id);
      if (!existing) return null;
      const merged = normalizeDepartment({ ...existing, ...data, id });
      storageService.updateDepartment(tenantId, merged, userId);
      return merged;
    }
    try {
      const response = await apiClient.put<any>(`/payroll/departments/${id}`, data);
      return response ? normalizeDepartment(response) : null;
    } catch (error) {
      console.error('Error updating department:', error);
      throw error;
    }
  },

  async deleteDepartment(id: string): Promise<boolean> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.deleteDepartment(tenantId, id);
      return true;
    }
    try {
      await apiClient.delete(`/payroll/departments/${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting department:', error);
      return false;
    }
  },

  async getDepartmentEmployees(departmentId: string): Promise<PayrollEmployee[]> {
    try {
      const response = await apiClient.get<any[]>(`/payroll/departments/${departmentId}/employees`);
      return (response || []).map(normalizeEmployee);
    } catch (error) {
      console.error('Error fetching department employees:', error);
      return [];
    }
  },

  async getDepartmentStats(): Promise<DepartmentStats[]> {
    try {
      const response = await apiClient.get<DepartmentStats[]>('/payroll/departments/stats');
      return response || [];
    } catch (error) {
      console.error('Error fetching department stats:', error);
      return [];
    }
  },

  async migrateDepartments(): Promise<{ success: boolean; migrated_count: number }> {
    try {
      const response = await apiClient.post<{ success: boolean; migrated_count: number }>('/payroll/departments/migrate');
      return response || { success: false, migrated_count: 0 };
    } catch (error) {
      console.error('Error migrating departments:', error);
      return { success: false, migrated_count: 0 };
    }
  },

  // ==================== PROJECTS (from main app settings) ====================

  /**
   * Get projects from the main application's projects module.
   * In local-only mode, uses payroll storageService projects.
   */
  async getMainAppProjects(): Promise<PayrollProject[]> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getProjects(tenantId);
    }
    try {
      const response = await apiClient.get<any[]>('/projects');
      // Map main app project structure to payroll project structure
      // Projects table status can be NULL or various values
      // Default to ACTIVE if status is null/undefined or doesn't match known values
      return (response || []).map(p => {
        let status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' = 'ACTIVE';
        const projectStatus = (p.status || '').toLowerCase();
        
        if (projectStatus === 'completed' || projectStatus === 'done' || projectStatus === 'finished') {
          status = 'COMPLETED';
        } else if (projectStatus === 'on hold' || projectStatus === 'hold' || projectStatus === 'paused') {
          status = 'ON_HOLD';
        } else {
          // Default to ACTIVE for null, undefined, or any other status
          status = 'ACTIVE';
        }
        
        return {
          id: p.id,
          tenant_id: p.tenant_id || '',
          name: p.name,
          code: p.id.substring(0, 8).toUpperCase(), // Use first 8 chars of ID as code
          description: p.description || '',
          status: status
        };
      });
    } catch (error) {
      console.error('Error fetching main app projects:', error);
      return [];
    }
  },

  // Get payroll-specific projects (fallback if main app projects not available)
  async getProjects(): Promise<PayrollProject[]> {
    try {
      // First try to get from main app projects
      const mainProjects = await this.getMainAppProjects();
      if (mainProjects.length > 0) {
        return mainProjects;
      }
      // Fallback to payroll-specific projects
      const response = await apiClient.get<PayrollProject[]>('/payroll/projects');
      return response || [];
    } catch (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
  },

  async createProject(data: Omit<PayrollProject, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>): Promise<PayrollProject | null> {
    try {
      return await apiClient.post<PayrollProject>('/payroll/projects', data);
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  },

  async updateProject(id: string, data: Partial<PayrollProject>): Promise<PayrollProject | null> {
    try {
      return await apiClient.put<PayrollProject>(`/payroll/projects/${id}`, data);
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  },

  // ==================== SALARY COMPONENT TYPES ====================

  async getEarningTypes(): Promise<EarningType[]> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getEarningTypes(tenantId);
    }
    try {
      const response = await apiClient.get<EarningType[]>('/payroll/earning-types');
      return response || [];
    } catch (error) {
      console.error('Error fetching earning types:', error);
      return [];
    }
  },

  async getDeductionTypes(): Promise<DeductionType[]> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getDeductionTypes(tenantId);
    }
    try {
      const response = await apiClient.get<DeductionType[]>('/payroll/deduction-types');
      return response || [];
    } catch (error) {
      console.error('Error fetching deduction types:', error);
      return [];
    }
  },

  async saveEarningTypes(types: EarningType[]): Promise<boolean> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.setEarningTypes(tenantId, types);
      return true;
    }
    try {
      await apiClient.put('/payroll/earning-types', { types });
      return true;
    } catch (error) {
      console.error('Error saving earning types:', error);
      return false;
    }
  },

  async saveDeductionTypes(types: DeductionType[]): Promise<boolean> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.setDeductionTypes(tenantId, types);
      return true;
    }
    try {
      await apiClient.put('/payroll/deduction-types', { types });
      return true;
    } catch (error) {
      console.error('Error saving deduction types:', error);
      return false;
    }
  },

  // ==================== PAYSLIPS ====================

  async getPayslipsByRun(runId: string): Promise<any[]> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getPayslipsByRunId(tenantId, runId);
    }
    try {
      const response = await apiClient.get<any[]>(`/payroll/runs/${runId}/payslips`);
      return response || [];
    } catch (error) {
      console.error('Error fetching payslips:', error);
      return [];
    }
  },

  async getEmployeePayslips(employeeId: string): Promise<any[]> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getPayslips(tenantId).filter((p) => p.employee_id === employeeId);
    }
    try {
      const response = await apiClient.get<any[]>(`/payroll/employees/${employeeId}/payslips`);
      return response || [];
    } catch (error) {
      console.error('Error fetching employee payslips:', error);
      return [];
    }
  },

  async getPayslip(id: string): Promise<any | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      storageService.init(tenantId);
      return storageService.getPayslips(tenantId).find((p) => p.id === id) ?? null;
    }
    try {
      return await apiClient.get<any>(`/payroll/payslips/${id}`);
    } catch (error) {
      console.error('Error fetching payslip:', error);
      return null;
    }
  },

  async updatePayslip(
    payslipId: string,
    data: Record<string, unknown>
  ): Promise<any | null> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      const { tenantId } = getTenantAndUser();
      const { normalizePayslip } = await import('../../components/payroll/types');
      storageService.init(tenantId);
      const existing = storageService.getPayslips(tenantId).find((p) => p.id === payslipId);
      if (!existing) return null;
      const updated = normalizePayslip({ ...existing, ...data, id: payslipId });
      storageService.updatePayslip(tenantId, updated);
      return updated;
    }
    try {
      return await apiClient.put<any>(`/payroll/payslips/${payslipId}`, data);
    } catch (error) {
      console.error('Error updating payslip:', error);
      return null;
    }
  },

  async deletePayslip(payslipId: string, tenantId: string, userId: string): Promise<boolean> {
    if (isLocalOnlyMode()) {
      const { storageService } = await import('../../components/payroll/services/storageService');
      storageService.init(tenantId);
      return storageService.deletePayslip(tenantId, payslipId, userId);
    }
    try {
      await apiClient.delete(`/payroll/payslips/${payslipId}`);
      return true;
    } catch (error) {
      console.error('Error deleting payslip:', error);
      return false;
    }
  },

  /** LAN/API: pay many payslip lines in one request (single DB transaction on server). */
  async payPayslipsBulk(
    payments: Array<{
      payslipId: string;
      accountId: string;
      categoryId?: string;
      projectId?: string;
      buildingId?: string;
      amount?: number;
      description?: string;
      date?: string;
    }>
  ): Promise<{
    success: boolean;
    results?: Array<{ payslip: any; transaction: any }>;
    error?: string;
  }> {
    if (isLocalOnlyMode()) {
      return { success: false, error: 'Bulk pay uses API mode.' };
    }
    if (!payments.length) {
      return { success: false, error: 'No payments' };
    }
    try {
      const response = await apiClient.post<{ results: Array<{ payslip: any; transaction: any }> }>(
        '/payroll/payslips/bulk-pay',
        { payments }
      );
      return { success: true, results: response?.results ?? [] };
    } catch (error: any) {
      let errorMessage = 'Bulk pay failed';
      if (error?.error) errorMessage = error.error;
      else if (error?.message) errorMessage = error.message;
      else if (error?.response?.data?.error) errorMessage = error.response.data.error;
      return { success: false, error: errorMessage };
    }
  },

  async payPayslip(
    payslipId: string,
    paymentData: {
      accountId: string;
      categoryId?: string;
      projectId?: string;
      buildingId?: string;
      amount?: number;
      description?: string;
      date?: string;
    }
  ): Promise<{ success: boolean; payslip?: any; transaction?: any; error?: string }> {
    if (isLocalOnlyMode()) {
      return { success: false, error: 'Use local payroll payment flow.' };
    }
    try {
      const response = await apiClient.post<{ payslip: any; transaction: any }>(
        `/payroll/payslips/${payslipId}/pay`,
        paymentData
      );
      return { success: true, payslip: response?.payslip, transaction: response?.transaction };
    } catch (error: any) {
      console.error('❌ Error paying payslip:', error);
      console.error('Error details:', {
        message: error.message,
        error: error.error,
        status: error.status,
        response: error.response
      });
      
      // Extract more detailed error message
      let errorMessage = 'Failed to pay payslip';
      if (error.error) {
        errorMessage = error.error;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      return { success: false, error: errorMessage };
    }
  },

  // ==================== PAYROLL SETTINGS ====================

  async getPayrollSettings(): Promise<{
    defaultAccountId: string | null;
    defaultCategoryId: string | null;
    defaultProjectId: string | null;
  }> {
    try {
      const response = await apiClient.get<any>('/payroll/settings');
      return response || {
        defaultAccountId: null,
        defaultCategoryId: null,
        defaultProjectId: null
      };
    } catch (error) {
      console.error('Error fetching payroll settings:', error);
      return {
        defaultAccountId: null,
        defaultCategoryId: null,
        defaultProjectId: null
      };
    }
  },

  async updatePayrollSettings(settings: {
    defaultAccountId?: string | null;
    defaultCategoryId?: string | null;
    defaultProjectId?: string | null;
  }): Promise<boolean> {
    try {
      await apiClient.put('/payroll/settings', settings);
      return true;
    } catch (error) {
      console.error('Error updating payroll settings:', error);
      return false;
    }
  }
};

export default payrollApi;

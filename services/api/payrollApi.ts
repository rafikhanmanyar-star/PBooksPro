/**
 * Payroll API Service
 * 
 * Provides API methods for payroll module operations.
 * Uses the main application's apiClient for authentication and tenant handling.
 */

import { apiClient } from './client';
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

// ==================== EMPLOYEES ====================

export const payrollApi = {
  // Get all employees for current tenant
  async getEmployees(): Promise<PayrollEmployee[]> {
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
    try {
      const response = await apiClient.put<any>(`/payroll/employees/${id}`, data);
      return response ? normalizeEmployee(response) : null;
    } catch (error) {
      console.error('Error updating employee:', error);
      throw error;
    }
  },

  // Delete employee
  async deleteEmployee(id: string): Promise<boolean> {
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
    try {
      const response = await apiClient.get<any>(`/payroll/runs/${id}`);
      return response ? normalizePayrollRun(response) : null;
    } catch (error) {
      console.error('Error fetching payroll run:', error);
      return null;
    }
  },

  // Create new payroll run
  async createPayrollRun(data: PayrollRunCreateRequest): Promise<PayrollRun | null> {
    try {
      const response = await apiClient.post<any>('/payroll/runs', data);
      return response ? normalizePayrollRun(response) : null;
    } catch (error) {
      console.error('Error creating payroll run:', error);
      throw error;
    }
  },

  // Update payroll run (status changes)
  async updatePayrollRun(id: string, data: PayrollRunUpdateRequest): Promise<PayrollRun | null> {
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
  async processPayrollRun(id: string): Promise<PayrollRunWithSummary | null> {
    try {
      const response = await apiClient.post<any>(`/payroll/runs/${id}/process`);
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

  // ==================== GRADE LEVELS ====================

  async getGradeLevels(): Promise<GradeLevel[]> {
    try {
      const response = await apiClient.get<GradeLevel[]>('/payroll/grades');
      return response || [];
    } catch (error) {
      console.error('Error fetching grade levels:', error);
      return [];
    }
  },

  async createGradeLevel(data: Omit<GradeLevel, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>): Promise<GradeLevel | null> {
    try {
      return await apiClient.post<GradeLevel>('/payroll/grades', data);
    } catch (error) {
      console.error('Error creating grade level:', error);
      throw error;
    }
  },

  async updateGradeLevel(id: string, data: Partial<GradeLevel>): Promise<GradeLevel | null> {
    try {
      return await apiClient.put<GradeLevel>(`/payroll/grades/${id}`, data);
    } catch (error) {
      console.error('Error updating grade level:', error);
      throw error;
    }
  },

  // ==================== DEPARTMENTS ====================

  async getDepartments(): Promise<Department[]> {
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
    try {
      const response = await apiClient.post<any>('/payroll/departments', data);
      return response ? normalizeDepartment(response) : null;
    } catch (error) {
      console.error('Error creating department:', error);
      throw error;
    }
  },

  async updateDepartment(id: string, data: Partial<Department>): Promise<Department | null> {
    try {
      const response = await apiClient.put<any>(`/payroll/departments/${id}`, data);
      return response ? normalizeDepartment(response) : null;
    } catch (error) {
      console.error('Error updating department:', error);
      throw error;
    }
  },

  async deleteDepartment(id: string): Promise<boolean> {
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
   * These are the projects defined in the Settings page.
   */
  async getMainAppProjects(): Promise<PayrollProject[]> {
    try {
      const response = await apiClient.get<any[]>('/projects');
      // Map main app project structure to payroll project structure
      return (response || []).map(p => ({
        id: p.id,
        tenant_id: p.tenant_id || '',
        name: p.name,
        code: p.id.substring(0, 8).toUpperCase(), // Use first 8 chars of ID as code
        description: p.description || '',
        status: p.status === 'Completed' ? 'COMPLETED' : p.status === 'On Hold' ? 'ON_HOLD' : 'ACTIVE'
      }));
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
    try {
      const response = await apiClient.get<EarningType[]>('/payroll/earning-types');
      return response || [];
    } catch (error) {
      console.error('Error fetching earning types:', error);
      return [];
    }
  },

  async getDeductionTypes(): Promise<DeductionType[]> {
    try {
      const response = await apiClient.get<DeductionType[]>('/payroll/deduction-types');
      return response || [];
    } catch (error) {
      console.error('Error fetching deduction types:', error);
      return [];
    }
  },

  async saveEarningTypes(types: EarningType[]): Promise<boolean> {
    try {
      await apiClient.put('/payroll/earning-types', { types });
      return true;
    } catch (error) {
      console.error('Error saving earning types:', error);
      return false;
    }
  },

  async saveDeductionTypes(types: DeductionType[]): Promise<boolean> {
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
    try {
      const response = await apiClient.get<any[]>(`/payroll/runs/${runId}/payslips`);
      return response || [];
    } catch (error) {
      console.error('Error fetching payslips:', error);
      return [];
    }
  },

  async getEmployeePayslips(employeeId: string): Promise<any[]> {
    try {
      const response = await apiClient.get<any[]>(`/payroll/employees/${employeeId}/payslips`);
      return response || [];
    } catch (error) {
      console.error('Error fetching employee payslips:', error);
      return [];
    }
  },

  async getPayslip(id: string): Promise<any | null> {
    try {
      return await apiClient.get<any>(`/payroll/payslips/${id}`);
    } catch (error) {
      console.error('Error fetching payslip:', error);
      return null;
    }
  },

  async payPayslip(payslipId: string, paymentData: {
    accountId: string;
    categoryId?: string;
    projectId?: string;
    description?: string;
  }): Promise<{ success: boolean; payslip?: any; transaction?: any; error?: string }> {
    try {
      console.log('💰 payPayslip API call:', { payslipId, paymentData });
      const response = await apiClient.post<{ success: boolean; payslip: any; transaction: any }>(
        `/payroll/payslips/${payslipId}/pay`,
        paymentData
      );
      console.log('✅ payPayslip API response:', response);
      return response;
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

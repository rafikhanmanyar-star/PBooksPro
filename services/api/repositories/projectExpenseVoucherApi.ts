/**
 * Project Expense Voucher API Repository
 */

import { apiClient } from '../client';
import type { ProjectExpenseCategory, ProjectExpenseVoucher, PeVStatus } from '../../../types';

export class ProjectExpenseCategoryApiRepository {
  async findAll(activeOnly = false): Promise<ProjectExpenseCategory[]> {
    const q = activeOnly ? '?activeOnly=true' : '';
    return apiClient.get<ProjectExpenseCategory[]>(`/project-expense-categories${q}`);
  }

  async create(category: Partial<ProjectExpenseCategory>): Promise<ProjectExpenseCategory> {
    return apiClient.post<ProjectExpenseCategory>('/project-expense-categories', category);
  }

  async update(id: string, category: Partial<ProjectExpenseCategory>): Promise<ProjectExpenseCategory> {
    return apiClient.put<ProjectExpenseCategory>(`/project-expense-categories/${id}`, category);
  }

  async delete(id: string, version?: number): Promise<void> {
    const q = version != null ? `?version=${version}` : '';
    await apiClient.delete(`/project-expense-categories/${id}${q}`);
  }
}

export class ProjectExpenseVoucherApiRepository {
  async findAll(filters?: {
    status?: PeVStatus;
    projectId?: string;
    expenseCategoryId?: string;
    vendorId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ProjectExpenseVoucher[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.expenseCategoryId) params.append('expenseCategoryId', filters.expenseCategoryId);
    if (filters?.vendorId) params.append('vendorId', filters.vendorId);
    if (filters?.fromDate) params.append('fromDate', filters.fromDate);
    if (filters?.toDate) params.append('toDate', filters.toDate);
    const q = params.toString();
    return apiClient.get<ProjectExpenseVoucher[]>(`/project-expense-vouchers${q ? `?${q}` : ''}`);
  }

  async findById(id: string): Promise<ProjectExpenseVoucher | null> {
    try {
      return await apiClient.get<ProjectExpenseVoucher>(`/project-expense-vouchers/${id}`);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(voucher: Partial<ProjectExpenseVoucher>): Promise<ProjectExpenseVoucher> {
    return apiClient.post<ProjectExpenseVoucher>('/project-expense-vouchers', voucher);
  }

  async update(id: string, voucher: Partial<ProjectExpenseVoucher>): Promise<ProjectExpenseVoucher> {
    return apiClient.put<ProjectExpenseVoucher>(`/project-expense-vouchers/${id}`, voucher);
  }

  async delete(id: string, version?: number): Promise<void> {
    const q = version != null ? `?version=${version}` : '';
    await apiClient.delete(`/project-expense-vouchers/${id}${q}`);
  }

  async submit(id: string): Promise<ProjectExpenseVoucher> {
    return apiClient.post<ProjectExpenseVoucher>(`/project-expense-vouchers/${id}/submit`, {});
  }

  async approve(id: string): Promise<ProjectExpenseVoucher> {
    return apiClient.post<ProjectExpenseVoucher>(`/project-expense-vouchers/${id}/approve`, {});
  }

  async reject(id: string, reason?: string): Promise<ProjectExpenseVoucher> {
    return apiClient.post<ProjectExpenseVoucher>(`/project-expense-vouchers/${id}/reject`, { reason });
  }

  async post(id: string): Promise<{ voucher: ProjectExpenseVoucher; journalEntryId: string }> {
    return apiClient.post<{ voucher: ProjectExpenseVoucher; journalEntryId: string }>(
      `/project-expense-vouchers/${id}/post`,
      {}
    );
  }

  async unpost(id: string): Promise<ProjectExpenseVoucher> {
    return apiClient.post<ProjectExpenseVoucher>(`/project-expense-vouchers/${id}/unpost`, {});
  }
}

export type PeVRegisterRow = {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  projectId: string;
  projectName: string;
  categoryName: string;
  vendorName: string | null;
  amount: number;
  status: string;
  description: string | null;
};

export type PeVAggregateRow = { key: string; label: string; count: number; amount: number };
export type PeVTrendRow = { period: string; count: number; amount: number };

export class ProjectExpenseVoucherReportApiRepository {
  private qs(filters?: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.append(k, v);
      }
    }
    const s = params.toString();
    return s ? `?${s}` : '';
  }

  async register(filters?: Record<string, string | undefined>): Promise<PeVRegisterRow[]> {
    return apiClient.get<PeVRegisterRow[]>(`/project-expense-vouchers/reports/register${this.qs(filters)}`);
  }

  async byCategory(filters?: Record<string, string | undefined>): Promise<PeVAggregateRow[]> {
    return apiClient.get<PeVAggregateRow[]>(`/project-expense-vouchers/reports/by-category${this.qs(filters)}`);
  }

  async byProject(filters?: Record<string, string | undefined>): Promise<PeVAggregateRow[]> {
    return apiClient.get<PeVAggregateRow[]>(`/project-expense-vouchers/reports/by-project${this.qs(filters)}`);
  }

  async byVendor(filters?: Record<string, string | undefined>): Promise<PeVAggregateRow[]> {
    return apiClient.get<PeVAggregateRow[]>(`/project-expense-vouchers/reports/by-vendor${this.qs(filters)}`);
  }

  async trend(filters?: Record<string, string | undefined>): Promise<PeVTrendRow[]> {
    return apiClient.get<PeVTrendRow[]>(`/project-expense-vouchers/reports/trend${this.qs(filters)}`);
  }
}

/**
 * Rental Accounts Receivable API – tree summary and lazy children.
 */

import { apiClient } from './client';

export type ViewBy = 'tenant' | 'property' | 'owner' | 'unit';
export type AgingFilter = 'all' | 'overdue' | '0-30' | '31-60' | '61-90' | '90+';

export interface AgingBuckets {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days90plus: number;
}

export interface ARTreeNode {
  id: string;
  type: 'tenant' | 'property' | 'owner' | 'unit' | 'invoice';
  name: string;
  outstanding: number;
  overdue: number;
  invoiceCount?: number;
  lastPaymentDate?: string | null;
  hasChildren: boolean;
  agingBuckets?: AgingBuckets;
  dueDate?: string;
  status?: string;
  amount?: number;
  paidAmount?: number;
}

export interface ARSummaryResponse {
  nodes: ARTreeNode[];
}

export interface ARChildrenResponse {
  nodes: ARTreeNode[];
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') search.append(k, v);
  });
  const q = search.toString();
  return q ? `?${q}` : '';
}

export const rentalArApi = {
  async getSummary(options: {
    groupBy: ViewBy;
    aging?: AgingFilter;
    search?: string;
  }): Promise<ARSummaryResponse> {
    const query = buildQuery({
      groupBy: options.groupBy,
      aging: options.aging || 'all',
      search: options.search,
    });
    return apiClient.get<ARSummaryResponse>(`/rental/ar-summary${query}`);
  },

  async getChildren(options: {
    parentType: ViewBy;
    parentId: string;
    viewBy: ViewBy;
  }): Promise<ARChildrenResponse> {
    const query = buildQuery({
      parentType: options.parentType,
      parentId: options.parentId,
      viewBy: options.viewBy,
    });
    return apiClient.get<ARChildrenResponse>(`/rental/ar-children${query}`);
  },
};


import { apiClient } from './client';

export interface ShopBranch {
    id: string;
    name: string;
    code: string;
    type: string;
    status: string;
    location: string;
    region: string;
}

export interface ShopProduct {
    id: string;
    name: string;
    sku: string;
    barcode: string;
    retail_price: number;
    tax_rate: number;
}

export const shopApi = {
    getBranches: () => apiClient.get<ShopBranch[]>('/shop/branches'),
    getWarehouses: () => apiClient.get<any[]>('/shop/warehouses'),
    getProducts: () => apiClient.get<ShopProduct[]>('/shop/products'),
    getInventory: () => apiClient.get<any[]>('/shop/inventory'),
    adjustInventory: (data: any) => apiClient.post('/shop/inventory/adjust', data),
    getMovements: (productId?: string) => apiClient.get<any[]>(`/shop/inventory/movements${productId ? `?productId=${productId}` : ''}`),
    getSales: () => apiClient.get<any[]>('/shop/sales'),
    createSale: (saleData: any) => apiClient.post('/shop/sales', saleData),
    getLoyaltyMembers: () => apiClient.get<any[]>('/shop/loyalty/members'),
    createProduct: (productData: any) => apiClient.post('/shop/products', productData),
    createLoyaltyMember: (memberData: any) => apiClient.post('/shop/loyalty/members', memberData),
    updateLoyaltyMember: (id: string, memberData: any) => apiClient.put(`/shop/loyalty/members/${id}`, memberData),
    deleteLoyaltyMember: (id: string) => apiClient.delete(`/shop/loyalty/members/${id}`),
    createBranch: (branchData: any) => apiClient.post('/shop/branches', branchData),
    updateBranch: (id: string, branchData: any) => apiClient.put(`/shop/branches/${id}`, branchData),
    getTerminals: () => apiClient.get<any[]>('/shop/terminals'),
    createTerminal: (terminalData: any) => apiClient.post('/shop/terminals', terminalData),
    updateTerminal: (id: string, terminalData: any) => apiClient.put(`/shop/terminals/${id}`, terminalData),
    deleteTerminal: (id: string) => apiClient.delete(`/shop/terminals/${id}`),
    getPolicies: () => apiClient.get('/shop/policies'),
    updatePolicies: (policyData: any) => apiClient.post('/shop/policies', policyData),
};

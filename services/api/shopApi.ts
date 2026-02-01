
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
    getProducts: () => apiClient.get<ShopProduct[]>('/shop/products'),
    getInventory: () => apiClient.get<any[]>('/shop/inventory'),
    adjustInventory: (data: any) => apiClient.post('/shop/inventory/adjust', data),
    getSales: () => apiClient.get<any[]>('/shop/sales'),
    createSale: (saleData: any) => apiClient.post('/shop/sales', saleData),
    getLoyaltyMembers: () => apiClient.get<any[]>('/shop/loyalty/members'),
    createProduct: (productData: any) => apiClient.post('/shop/products', productData),
    createLoyaltyMember: (memberData: any) => apiClient.post('/shop/loyalty/members', memberData),
    createBranch: (branchData: any) => apiClient.post('/shop/branches', branchData),
    updateBranch: (id: string, branchData: any) => apiClient.put(`/shop/branches/${id}`, branchData),
};

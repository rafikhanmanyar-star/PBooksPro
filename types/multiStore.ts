
export type StoreType = 'Flagship' | 'Express' | 'Warehouse' | 'Virtual' | 'Franchise';
export type StoreStatus = 'Active' | 'Suspended' | 'Closed' | 'Maintenance';
export type TerminalStatus = 'Online' | 'Offline' | 'Locked' | 'Warning';

export interface StoreBranch {
    id: string;
    name: string;
    code: string;
    type: StoreType;
    status: StoreStatus;
    location: string;
    region: string;
    manager: string;
    contact: string;
    timezone: string;
    openTime: string;
    closeTime: string;
}

export interface POSTerminal {
    id: string;
    storeId: string;
    name: string;
    code: string;
    status: TerminalStatus;
    version: string;
    lastSync: string;
    ipAddress: string;
    healthScore: number; // 0-100
}

export interface StorePerformance {
    storeId: string;
    salesToday: number;
    salesMTD: number;
    customerCount: number;
    inventoryValue: number;
    profitMargin: number;
    variance: number;
}

export interface OrganizationHeader {
    name: string;
    hqAddress: string;
    totalStores: number;
    centralCurrency: string;
    lastConsolidated: string;
}

export interface GlobalPolicies {
    allowNegativeStock: boolean;
    universalPricing: boolean;
    taxInclusive: boolean;
    defaultTaxRate: number;
    requireManagerApproval: boolean;
    loyaltyRedemptionRatio: number; // e.g. 0.05 (5%)
}

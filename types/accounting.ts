
export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'COGS' | 'Expense';

export interface ChartAccount {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    balance: number;
    parentId?: string;
    isControlAccount?: boolean;
    isActive: boolean;
}

export interface JournalEntry {
    id: string;
    date: string;
    reference: string;
    description: string;
    lines: JournalLine[];
    status: 'Draft' | 'Posted' | 'Reversed';
    sourceModule: 'POS' | 'Inventory' | 'Purchases' | 'Manual';
    sourceId?: string;
}

export interface JournalLine {
    accountId: string;
    accountName: string;
    debit: number;
    credit: number;
    memo?: string;
    storeId?: string;
}

export interface LedgerTransaction {
    id: string;
    date: string;
    accountId: string;
    debit: number;
    credit: number;
    balance: number;
    reference: string;
    description: string;
}

export interface CustomerAging {
    customerId: string;
    customerName: string;
    current: number;
    days30: number;
    days60: number;
    days90Plus: number;
    total: number;
}

export interface FinancialMetric {
    label: string;
    value: number;
    trend: number; // percentage
    status: 'up' | 'down' | 'neutral';
}

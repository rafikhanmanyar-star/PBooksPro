
import { TransactionType } from '../types';

export interface POSProduct {
    id: string;
    sku: string;
    barcode: string;
    name: string;
    price: number;
    cost: number;
    categoryId: string;
    imageUrl?: string;
    taxRate: number;
    isTaxInclusive: boolean;
    variants?: POSProductVariant[];
    isWeightBased?: boolean;
    unit: string;
    stockLevel: number;
}

export interface POSProductVariant {
    id: string;
    name: string; // e.g. "Red / Large"
    sku: string;
    barcode: string;
    priceAdjustment: number;
    stockLevel: number;
}

export interface POSCartItem {
    id: string; // Unique ID for this cart line
    productId: string;
    variantId?: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    discountPercentage: number;
    taxAmount: number;
    taxRate: number;
    notes?: string;
    isFree?: boolean;
    priceOverridden?: boolean;
}

export interface POSPayment {
    id: string;
    method: POSPaymentMethod;
    amount: number;
    reference?: string; // e.g. Card last 4, Transaction ID
}

export enum POSPaymentMethod {
    CASH = 'Cash',
    CARD = 'Card',
    WALLET = 'Wallet',
    QR = 'QR',
    STORE_CREDIT = 'Store Credit',
    LOYALTY_POINTS = 'Loyalty Points',
    GIFT_CARD = 'Gift Card'
}

export interface POSHeldSale {
    id: string;
    reference: string;
    cart: POSCartItem[];
    customerId?: string;
    heldAt: string;
    cashierId: string;
    total: number;
}

export interface POSShift {
    id: string;
    cashierId: string;
    terminalId: string;
    openedAt: string;
    closedAt?: string;
    openingBalance: number;
    closingBalance?: number;
    actualCash?: number;
    expectedCash?: number;
}

export interface POSCustomer {
    id: string;
    name: string;
    phone: string;
    email?: string;
    points: number;
    creditLimit: number;
    balance: number;
    tier: 'Standard' | 'Silver' | 'Gold' | 'Platinum' | 'VIP';
}

export interface POSSessionState {
    currentCart: POSCartItem[];
    currentCustomer: POSCustomer | null;
    currentShift: POSShift | null;
    heldSales: POSHeldSale[];
    activeTerminalId: string;
}

export interface POSSale {
    id?: string;
    saleNumber: string;
    branchId: string;
    terminalId: string;
    userId: string;
    customerId?: string;
    customerName?: string;
    loyaltyMemberId?: string | null;
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    grandTotal: number;
    totalPaid: number;
    changeDue: number;
    paymentMethod: string;
    paymentDetails: POSPayment[];
    items: {
        productId: string;
        name: string;
        quantity: number;
        unitPrice: number;
        taxAmount: number;
        discountAmount: number;
        subtotal: number;
    }[];
    createdAt: string;
}

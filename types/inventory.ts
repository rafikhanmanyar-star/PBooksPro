
export interface Warehouse {
    id: string;
    name: string;
    code: string;
    location: string;
    isVirtual?: boolean;
}

export interface InventoryItem {
    id: string;
    sku: string;
    barcode?: string; // Barcode for scanning in POS
    name: string;
    category: string;
    unit: string;
    onHand: number;
    available: number;
    reserved: number;
    inTransit: number;
    damaged: number;
    costPrice: number;
    retailPrice: number;
    reorderPoint: number;
    warehouseStock: Record<string, number>; // warehouseId -> quantity
}

export type MovementType = 'Sale' | 'Purchase' | 'Transfer' | 'Adjustment' | 'Return' | 'Damage' | 'Shrinkage';

export interface StockMovement {
    id: string;
    itemId: string;
    itemName: string;
    type: MovementType;
    quantity: number; // Positive for increase, negative for decrease
    beforeQty: number;
    afterQty: number;
    warehouseId: string;
    referenceId: string; // Sale ID, Transfer ID, etc.
    timestamp: string;
    userId: string;
    notes?: string;
}

export interface StockAdjustment {
    id: string;
    itemId: string;
    warehouseId: string;
    type: 'Increase' | 'Decrease';
    quantity: number;
    reasonCode: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    requestedBy: string;
    approvedBy?: string;
    timestamp: string;
}

export interface StockTransfer {
    id: string;
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    items: {
        itemId: string;
        quantity: number;
        sku: string;
        name: string;
    }[];
    status: 'Draft' | 'In-Transit' | 'Received' | 'Cancelled';
    requestedBy: string;
    receivedBy?: string;
    timestamp: string;
    receivedAt?: string;
    notes?: string;
}

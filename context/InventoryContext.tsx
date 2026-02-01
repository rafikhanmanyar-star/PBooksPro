
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
    InventoryItem,
    Warehouse,
    StockMovement,
    StockAdjustment,
    StockTransfer
} from '../types/inventory';
import { shopApi } from '../services/api/shopApi';

interface InventoryContextType {
    items: InventoryItem[];
    warehouses: Warehouse[];
    movements: StockMovement[];
    adjustments: StockAdjustment[];
    transfers: StockTransfer[];

    addItem: (item: InventoryItem) => void;
    updateStock: (itemId: string, warehouseId: string, delta: number, type: any, referenceId: string, notes?: string) => void;
    requestTransfer: (transfer: Omit<StockTransfer, 'id' | 'timestamp' | 'status'>) => void;
    approveAdjustment: (adjustmentId: string) => void;

    // Filters & Dashboard Data
    lowStockItems: InventoryItem[];
    totalInventoryValue: number;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
    const [transfers, setTransfers] = useState<StockTransfer[]>([]);

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const [branches, products, inventory] = await Promise.all([
                    shopApi.getBranches(),
                    shopApi.getProducts(),
                    shopApi.getInventory()
                ]);

                // Map Branches/Warehouses
                const whs: Warehouse[] = branches.map((b: any) => ({
                    id: b.id,
                    name: b.name,
                    code: b.code,
                    location: b.location || 'Main' // Use branch ID as warehouse ID for simplicity in this POS context
                }));
                // Also add logic to fetch actual warehouses if separate from branches, 
                // but currently we use branches/warehouses interchangeably in simple setup or need separate API.
                // For now, assuming branches act as locations.
                setWarehouses(whs);

                // Aggregate Stock
                const stockMap: Record<string, { total: number, reserved: number, byWh: Record<string, number> }> = {};

                inventory.forEach((inv: any) => {
                    if (!stockMap[inv.product_id]) {
                        stockMap[inv.product_id] = { total: 0, reserved: 0, byWh: {} };
                    }
                    const qty = parseFloat(inv.quantity_on_hand || '0');
                    const reserved = parseFloat(inv.quantity_reserved || '0');
                    stockMap[inv.product_id].total += qty;
                    stockMap[inv.product_id].reserved += reserved;
                    stockMap[inv.product_id].byWh[inv.warehouse_id] = qty;
                });

                // Map Products to InventoryItems
                const mappedItems: InventoryItem[] = products.map((p: any) => ({
                    id: p.id,
                    sku: p.sku,
                    name: p.name,
                    category: p.category_id || 'General', // TODO: Fetch category name
                    unit: p.unit || 'pcs',
                    onHand: stockMap[p.id]?.total || 0,
                    available: (stockMap[p.id]?.total || 0) - (stockMap[p.id]?.reserved || 0),
                    reserved: stockMap[p.id]?.reserved || 0,
                    inTransit: 0, // Not tracked in basic schema yet
                    damaged: 0,
                    costPrice: parseFloat(p.cost_price || '0'),
                    retailPrice: parseFloat(p.retail_price || '0'),
                    reorderPoint: p.reorder_point || 10,
                    warehouseStock: stockMap[p.id]?.byWh || {}
                }));

                setItems(mappedItems);

            } catch (error) {
                console.error('Failed to fetch inventory data:', error);
            }
        };
        fetchData();
    }, []);

    const updateStock = useCallback(async (
        itemId: string,
        warehouseId: string,
        delta: number,
        type: any,
        referenceId: string,
        notes?: string
    ) => {
        try {
            await shopApi.adjustInventory({
                productId: itemId,
                warehouseId,
                quantity: delta,
                type,
                referenceId,
                reason: notes
            });

            // Update local state optmistically or fetch again
            setItems(prev => prev.map(item => {
                if (item.id === itemId) {
                    const beforeQty = item.onHand;
                    const afterQty = beforeQty + delta;

                    // Add movement log
                    const movement: StockMovement = {
                        id: crypto.randomUUID(),
                        itemId,
                        itemName: item.name,
                        type,
                        quantity: delta,
                        beforeQty,
                        afterQty,
                        warehouseId,
                        referenceId,
                        timestamp: new Date().toISOString(),
                        userId: 'admin-1',
                        notes
                    };
                    setMovements(m => [movement, ...m]);

                    return {
                        ...item,
                        onHand: afterQty,
                        available: item.available + delta,
                        warehouseStock: {
                            ...item.warehouseStock,
                            [warehouseId]: (item.warehouseStock[warehouseId] || 0) + delta
                        }
                    };
                }
                return item;
            }));
        } catch (error) {
            console.error('Failed to update stock:', error);
            // Optionally revert or show error
        }
    }, []);

    const addItem = useCallback(async (item: InventoryItem) => {
        try {
            const payload = {
                sku: item.sku,
                name: item.name,
                category_id: item.category, // simplified
                retail_price: item.retailPrice,
                cost_price: item.costPrice,
                unit: item.unit,
                reorder_point: item.reorderPoint
            };

            const response = await shopApi.createProduct(payload) as any;

            if (response && response.id) {
                const newItem = { ...item, id: response.id };
                setItems(prev => [...prev, newItem]);
            } else {
                // Fallback for mock/local
                setItems(prev => [...prev, { ...item, id: crypto.randomUUID() }]);
            }
        } catch (error) {
            console.error("Failed to create product:", error);
            // Fallback for mock/offline
            setItems(prev => [...prev, { ...item, id: crypto.randomUUID() }]);
        }
    }, []);

    const requestTransfer = useCallback((transfer: Omit<StockTransfer, 'id' | 'timestamp' | 'status'>) => {
        const newTransfer: StockTransfer = {
            ...transfer,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            status: 'In-Transit'
        };
        setTransfers(prev => [newTransfer, ...prev]);

        // Update stock for in-transit
        transfer.items.forEach(item => {
            updateStock(item.itemId, transfer.sourceWarehouseId, -item.quantity, 'Transfer', newTransfer.id, `Transfer to ${transfer.destinationWarehouseId}`);
        });
    }, [updateStock]);

    const approveAdjustment = useCallback((adjustmentId: string) => {
        setAdjustments(prev => prev.map(adj => {
            if (adj.id === adjustmentId) {
                updateStock(adj.itemId, adj.warehouseId, adj.type === 'Increase' ? adj.quantity : -adj.quantity, 'Adjustment', adj.id, adj.reasonCode);
                return { ...adj, status: 'Approved', approvedBy: 'supervisor-1' };
            }
            return adj;
        }));
    }, [updateStock]);

    const lowStockItems = useMemo(() =>
        items.filter(item => item.onHand <= item.reorderPoint),
        [items]);

    const totalInventoryValue = useMemo(() =>
        items.reduce((sum, item) => sum + (item.onHand * item.costPrice), 0),
        [items]);

    const value = {
        items,
        warehouses,
        movements,
        adjustments,
        transfers,
        addItem,
        updateStock,
        requestTransfer,
        approveAdjustment,
        lowStockItems,
        totalInventoryValue
    };

    return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

export const useInventory = () => {
    const context = useContext(InventoryContext);
    if (!context) throw new Error('useInventory must be used within an InventoryProvider');
    return context;
};

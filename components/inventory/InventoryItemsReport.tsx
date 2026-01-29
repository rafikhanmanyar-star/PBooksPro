import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { PurchaseBillItem, InventoryItem, InventoryStock } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { apiClient } from '../../services/api/client';
import { useNotification } from '../../context/NotificationContext';

type SortKey = 'itemName' | 'orderedQuantity' | 'receivedQuantity' | 'remainingQuantity' | 'lastReceivedDate' | 'status';

interface InventoryItemReportRow {
    inventoryItemId: string;
    itemName: string;
    orderedQuantity: number;
    receivedQuantity: number;
    remainingQuantity: number;
    lastReceivedDate?: string;
    status: 'Fully Received' | 'Partially Received' | 'Not Received';
    billNumbers: string[];
}

const InventoryItemsReport: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'itemName',
        direction: 'asc'
    });
    const [isLoading, setIsLoading] = useState(true);

    // Load purchase bill items
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load purchase bills and items
            const bills = await apiClient.get<any[]>('/purchase-bills');
            dispatch({ type: 'SET_PURCHASE_BILLS', payload: bills });

            // Load items for each bill
            const allItems: PurchaseBillItem[] = [];
            for (const bill of bills) {
                try {
                    const items = await apiClient.get<PurchaseBillItem[]>(`/purchase-bills/${bill.id}/items`);
                    allItems.push(...items);
                } catch (error) {
                    console.error(`Error loading items for bill ${bill.id}:`, error);
                }
            }
            dispatch({ type: 'SET_PURCHASE_BILL_ITEMS', payload: allItems });

            // Load inventory stock
            try {
                const stock = await apiClient.get<InventoryStock[]>('/purchase-bills/inventory-stock/all');
                // Store in state if needed
            } catch (error) {
                console.error('Error loading inventory stock:', error);
            }
        } catch (error) {
            console.error('Error loading data:', error);
            showAlert('Failed to load inventory data');
        } finally {
            setIsLoading(false);
        }
    };

    // Generate report data
    const reportData = useMemo(() => {
        const itemsMap = new Map<string, InventoryItemReportRow>();

        // Process all purchase bill items
        (state.purchaseBillItems || []).forEach((item) => {
            // Get bill to check warehouse filter
            const bill = state.purchaseBills?.find(b => b.id === item.purchaseBillId);
            
            // Filter by warehouse if selected
            if (selectedWarehouseId && (bill as any)?.warehouseId !== selectedWarehouseId) {
                return; // Skip this item if it doesn't match the selected warehouse
            }

            const key = item.inventoryItemId;
            const existing = itemsMap.get(key);

            const orderedQty = item.quantity || 0;
            const receivedQty = item.receivedQuantity || 0;
            const remainingQty = orderedQty - receivedQty;

            // Get bill number
            const billNumber = bill?.billNumber || 'Unknown';

            if (existing) {
                existing.orderedQuantity += orderedQty;
                existing.receivedQuantity += receivedQty;
                existing.remainingQuantity += remainingQty;
                if (!existing.billNumbers.includes(billNumber)) {
                    existing.billNumbers.push(billNumber);
                }
                // Update last received date if this item has a more recent date
                if (receivedQty > 0 && bill?.itemsReceivedDate) {
                    if (!existing.lastReceivedDate || 
                        new Date(bill.itemsReceivedDate) > new Date(existing.lastReceivedDate)) {
                        existing.lastReceivedDate = bill.itemsReceivedDate;
                    }
                }
            } else {
                const inventoryItem = state.inventoryItems?.find(i => i.id === item.inventoryItemId);
                itemsMap.set(key, {
                    inventoryItemId: key,
                    itemName: item.itemName || inventoryItem?.name || 'Unknown Item',
                    orderedQuantity: orderedQty,
                    receivedQuantity: receivedQty,
                    remainingQuantity: remainingQty,
                    lastReceivedDate: receivedQty > 0 && bill?.itemsReceivedDate ? bill.itemsReceivedDate : undefined,
                    status: receivedQty === 0 
                        ? 'Not Received' 
                        : remainingQty <= 0.01 
                            ? 'Fully Received' 
                            : 'Partially Received',
                    billNumbers: [billNumber]
                });
            }
        });

        let result = Array.from(itemsMap.values());

        // Apply search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(row => 
                row.itemName.toLowerCase().includes(q) ||
                row.billNumbers.some(bn => bn.toLowerCase().includes(q))
            );
        }

        // Apply sorting
        result.sort((a, b) => {
            let aVal: any, bVal: any;

            switch (sortConfig.key) {
                case 'itemName':
                    aVal = a.itemName;
                    bVal = b.itemName;
                    break;
                case 'orderedQuantity':
                    aVal = a.orderedQuantity;
                    bVal = b.orderedQuantity;
                    break;
                case 'receivedQuantity':
                    aVal = a.receivedQuantity;
                    bVal = b.receivedQuantity;
                    break;
                case 'remainingQuantity':
                    aVal = a.remainingQuantity;
                    bVal = b.remainingQuantity;
                    break;
                case 'lastReceivedDate':
                    aVal = a.lastReceivedDate || '';
                    bVal = b.lastReceivedDate || '';
                    break;
                case 'status':
                    aVal = a.status;
                    bVal = b.status;
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [state.purchaseBillItems, state.purchaseBills, state.inventoryItems, searchQuery, sortConfig, selectedWarehouseId]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Fully Received':
                return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'Partially Received':
                return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'Not Received':
                return 'bg-rose-100 text-rose-700 border-rose-200';
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const totals = useMemo(() => {
        return reportData.reduce((acc, row) => {
            acc.ordered += row.orderedQuantity;
            acc.received += row.receivedQuantity;
            acc.remaining += row.remainingQuantity;
            return acc;
        }, { ordered: 0, received: 0, remaining: 0 });
    }, [reportData]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-slate-500">Loading inventory report...</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">Inventory Items Report</h2>
                    <p className="text-sm text-slate-500">Track received status of inventory items from purchase bills</p>
                </div>
                <Button variant="secondary" onClick={loadData}>
                    <span className="w-4 h-4 mr-2">{ICONS.refresh}</span>
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Search</label>
                        <Input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by item name or bill number..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Warehouse</label>
                        <Select
                            value={selectedWarehouseId}
                            onChange={(e) => setSelectedWarehouseId(e.target.value)}
                        >
                            <option value="">All Warehouses</option>
                            {(state.warehouses || []).map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </Select>
                    </div>
                </div>
            </div>

            {/* Report Table */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th 
                                    onClick={() => handleSort('itemName')}
                                    className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                >
                                    Item Name {sortConfig.key === 'itemName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    onClick={() => handleSort('orderedQuantity')}
                                    className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                >
                                    Ordered {sortConfig.key === 'orderedQuantity' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    onClick={() => handleSort('receivedQuantity')}
                                    className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                >
                                    Received {sortConfig.key === 'receivedQuantity' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    onClick={() => handleSort('remainingQuantity')}
                                    className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                >
                                    Remaining {sortConfig.key === 'remainingQuantity' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    onClick={() => handleSort('status')}
                                    className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                >
                                    Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    onClick={() => handleSort('lastReceivedDate')}
                                    className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                >
                                    Date Received {sortConfig.key === 'lastReceivedDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Bill Numbers
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {reportData.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                                        {searchQuery 
                                            ? 'No items match your search criteria.'
                                            : 'No inventory items found. Create purchase bills to track inventory.'
                                        }
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {reportData.map((row) => (
                                        <tr key={row.inventoryItemId} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-800">{row.itemName}</td>
                                            <td className="px-4 py-3 text-right text-slate-700">{row.orderedQuantity.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-medium text-emerald-600">{row.receivedQuantity.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-medium text-rose-600">{row.remainingQuantity.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full border ${getStatusBadge(row.status)}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 text-sm font-medium">
                                                {row.lastReceivedDate 
                                                    ? new Date(row.lastReceivedDate).toLocaleDateString('en-US', { 
                                                        year: 'numeric', 
                                                        month: 'short', 
                                                        day: 'numeric' 
                                                    })
                                                    : <span className="text-slate-400">-</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 text-sm">
                                                <div className="flex flex-wrap gap-1">
                                                    {row.billNumbers.map((bn, idx) => (
                                                        <span key={idx} className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                                                            {bn}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Totals Row */}
                                    <tr className="bg-slate-100 font-semibold border-t-2 border-slate-300">
                                        <td className="px-4 py-3 text-slate-800">Total</td>
                                        <td className="px-4 py-3 text-right text-slate-800">{totals.ordered.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right text-emerald-700">{totals.received.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right text-rose-700">{totals.remaining.toFixed(2)}</td>
                                        <td colSpan={3}></td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default InventoryItemsReport;

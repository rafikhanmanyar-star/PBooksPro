import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { 
    PurchaseBill, 
    PurchaseBillItem, 
    PurchaseBillStatus, 
    ContactType, 
    InventoryItem,
    InventoryUnitType 
} from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { apiClient } from '../../services/api/client';
import { useNotification } from '../../context/NotificationContext';
import ContactForm from '../settings/ContactForm';

type SortKey = 'billNumber' | 'billDate' | 'vendorName' | 'totalAmount' | 'paidAmount' | 'status';
type SortDirection = 'asc' | 'desc';

const PurchasesTab: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    // List state
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
        key: 'billDate',
        direction: 'desc'
    });

    // Bill creation/edit state
    const [isCreatingBill, setIsCreatingBill] = useState(false);
    const [editingBill, setEditingBill] = useState<PurchaseBill | null>(null);
    const [selectedVendorId, setSelectedVendorId] = useState('');
    const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [billDescription, setBillDescription] = useState('');
    const [billItems, setBillItems] = useState<PurchaseBillItem[]>([]);

    // Vendor quick-add modal
    const [isAddingVendor, setIsAddingVendor] = useState(false);

    // Inventory item quick-add modal
    const [isAddingInventoryItem, setIsAddingInventoryItem] = useState(false);

    // Payment modal state
    const [paymentBillId, setPaymentBillId] = useState<string | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentAccountId, setPaymentAccountId] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

    // Receive items modal state
    const [receiveBillId, setReceiveBillId] = useState<string | null>(null);
    const [receiveItems, setReceiveItems] = useState<{ itemId: string; receivedQuantity: number; totalQuantity: number }[]>([]);

    // Get vendors from contacts
    const vendors = useMemo(() => 
        state.contacts.filter(c => c.type === ContactType.VENDOR).sort((a, b) => a.name.localeCompare(b.name)),
        [state.contacts]
    );

    // Get bank/cash accounts for payment
    const paymentAccounts = useMemo(() => 
        state.accounts.filter(a => a.type === 'Bank' || a.type === 'Cash').sort((a, b) => a.name.localeCompare(b.name)),
        [state.accounts]
    );

    // Load purchase bills on mount
    useEffect(() => {
        loadPurchaseBills();
        loadInventoryItems();
    }, []);

    const loadPurchaseBills = async () => {
        try {
            const bills = await apiClient.get<PurchaseBill[]>('/purchase-bills');
            dispatch({ type: 'SET_PURCHASE_BILLS', payload: bills });
        } catch (error) {
            console.error('Error loading purchase bills:', error);
        }
    };

    const loadInventoryItems = async () => {
        try {
            const items = await apiClient.get<InventoryItem[]>('/inventory-items');
            console.log('Loaded inventory items:', items.length, items);
            dispatch({ type: 'SET_INVENTORY_ITEMS', payload: items });
        } catch (error) {
            console.error('Error loading inventory items:', error);
            showAlert('Failed to load inventory items. Please refresh the page.');
        }
    };

    // Filtered and sorted bills
    const filteredBills = useMemo(() => {
        let result = state.purchaseBills || [];

        // Status filter
        if (statusFilter !== 'All') {
            result = result.filter(b => b.status === statusFilter);
        }

        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(b => {
                const vendor = state.contacts.find(c => c.id === b.vendorId);
                return (
                    b.billNumber.toLowerCase().includes(q) ||
                    (b.description && b.description.toLowerCase().includes(q)) ||
                    (vendor && vendor.name.toLowerCase().includes(q))
                );
            });
        }

        // Sort
        result.sort((a, b) => {
            let aVal: any, bVal: any;

            switch (sortConfig.key) {
                case 'vendorName':
                    const vendorA = state.contacts.find(c => c.id === a.vendorId);
                    const vendorB = state.contacts.find(c => c.id === b.vendorId);
                    aVal = vendorA?.name || '';
                    bVal = vendorB?.name || '';
                    break;
                default:
                    aVal = a[sortConfig.key];
                    bVal = b[sortConfig.key];
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [state.purchaseBills, state.contacts, searchQuery, statusFilter, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Add new item row to bill
    const addBillItem = () => {
        const newItem: PurchaseBillItem = {
            id: `temp_${Date.now()}`,
            purchaseBillId: '',
            inventoryItemId: '',
            itemName: '',
            quantity: 1,
            pricePerUnit: 0,
            totalAmount: 0,
        };
        setBillItems([...billItems, newItem]);
    };

    // Update bill item
    const updateBillItem = (itemId: string, updates: Partial<PurchaseBillItem>) => {
        setBillItems(prev => prev.map(item => {
            if (item.id !== itemId) return item;
            const updated = { ...item, ...updates };
            
            // If inventory item changed, get its name
            if (updates.inventoryItemId) {
                const invItem = state.inventoryItems.find(i => i.id === updates.inventoryItemId);
                if (invItem) {
                    updated.itemName = invItem.name;
                }
            }
            
            // Auto-calculate total
            updated.totalAmount = updated.quantity * updated.pricePerUnit;
            return updated;
        }));
    };

    // Remove bill item
    const removeBillItem = (itemId: string) => {
        setBillItems(prev => prev.filter(item => item.id !== itemId));
    };

    // Calculate bill total
    const billTotal = useMemo(() => 
        billItems.reduce((sum, item) => sum + item.totalAmount, 0),
        [billItems]
    );

    // Save bill
    const saveBill = async () => {
        if (!selectedVendorId || billItems.length === 0) {
            showAlert('Please select a vendor and add at least one item.');
            return;
        }

        // Validate items
        const invalidItems = billItems.filter(item => !item.inventoryItemId || item.quantity <= 0 || item.pricePerUnit <= 0);
        if (invalidItems.length > 0) {
            showAlert('Please fill in all item details (inventory item, quantity, price).');
            return;
        }

        try {
            // Generate bill number if creating new
            const billNumber = editingBill?.billNumber || 
                `PB-${String((state.purchaseBills?.length || 0) + 1).padStart(4, '0')}`;

            const billData: Partial<PurchaseBill> = {
                id: editingBill?.id,
                billNumber,
                vendorId: selectedVendorId,
                billDate,
                dueDate: dueDate || undefined,
                description: billDescription,
                totalAmount: billTotal,
                paidAmount: editingBill?.paidAmount || 0,
                status: editingBill?.status || PurchaseBillStatus.UNPAID,
                itemsReceived: false, // Always false on creation - items will be received after payment
            };

            const savedBill = await apiClient.post<PurchaseBill>('/purchase-bills', billData);
            
            // Save items one by one and report which ones fail
            const itemErrors: string[] = [];
            for (let i = 0; i < billItems.length; i++) {
                const item = billItems[i];
                try {
                    const itemData = {
                        ...item,
                        purchaseBillId: savedBill.id,
                    };
                    await apiClient.post(`/purchase-bills/${savedBill.id}/items`, itemData);
                } catch (itemError: any) {
                    console.error(`Error saving item ${i + 1}:`, itemError);
                    const invItem = state.inventoryItems.find(inv => inv.id === item.inventoryItemId);
                    itemErrors.push(`Item ${i + 1} (${invItem?.name || item.itemName}): ${itemError.response?.data?.message || 'Failed to save'}`);
                }
            }

            if (itemErrors.length > 0) {
                showAlert(`Bill created but some items failed:\n${itemErrors.join('\n')}\n\nPlease edit the bill to add missing items.`);
            } else {
                showToast(editingBill ? 'Purchase bill updated successfully' : 'Purchase bill created successfully');
            }
            
            // Refresh list
            await loadPurchaseBills();
            
            // Reset form only if all items saved successfully
            if (itemErrors.length === 0) {
                cancelBillCreation();
            }
        } catch (error: any) {
            console.error('Error saving bill:', error);
            showAlert(error.response?.data?.message || 'Failed to save purchase bill');
        }
    };

    // Cancel bill creation
    const cancelBillCreation = () => {
        setIsCreatingBill(false);
        setEditingBill(null);
        setSelectedVendorId('');
        setBillDate(new Date().toISOString().split('T')[0]);
        setDueDate('');
        setBillDescription('');
        setBillItems([]);
    };

    // Start editing a bill
    const startEditBill = async (bill: PurchaseBill) => {
        setEditingBill(bill);
        setSelectedVendorId(bill.vendorId);
        setBillDate(bill.billDate);
        setDueDate(bill.dueDate || '');
        setBillDescription(bill.description || '');
        
        // Load items
        try {
            const items = await apiClient.get<PurchaseBillItem[]>(`/purchase-bills/${bill.id}/items`);
            setBillItems(items);
            setIsCreatingBill(true);
            // Also update global state
            dispatch({ type: 'SET_PURCHASE_BILL_ITEMS', payload: items });
        } catch (error) {
            showAlert('Failed to load bill items');
        }
    };

    // Delete bill
    const deleteBill = async (billId: string) => {
        if (!confirm('Are you sure you want to delete this purchase bill?')) return;

        try {
            await apiClient.delete(`/purchase-bills/${billId}`);
            showToast('Purchase bill deleted successfully');
            await loadPurchaseBills();
        } catch (error: any) {
            showAlert(error.response?.data?.message || 'Failed to delete purchase bill');
        }
    };

    // Record payment
    const recordPayment = async () => {
        if (!paymentBillId || !paymentAccountId || !paymentAmount) {
            showAlert('Please fill in all payment details');
            return;
        }

        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) {
            showAlert('Invalid payment amount');
            return;
        }

        try {
            await apiClient.post(`/purchase-bills/${paymentBillId}/pay`, {
                amount,
                paymentAccountId,
                paymentDate,
            });

            showToast('Payment recorded successfully');
            
            // Refresh list
            await loadPurchaseBills();
            
            // Reset payment form
            setPaymentBillId(null);
            setPaymentAmount('');
            setPaymentAccountId('');
            setPaymentDate(new Date().toISOString().split('T')[0]);
        } catch (error: any) {
            showAlert(error.response?.data?.message || 'Failed to record payment');
        }
    };

    // Receive items
    const handleReceiveItems = async () => {
        if (!receiveBillId) return;

        // Validate received quantities
        const invalidItems = receiveItems.filter(ri => ri.receivedQuantity < 0 || ri.receivedQuantity > ri.totalQuantity);
        if (invalidItems.length > 0) {
            showAlert('Invalid received quantities. Please check all values.');
            return;
        }

        try {
            await apiClient.post(`/purchase-bills/${receiveBillId}/receive`, {
                items: receiveItems.map(ri => ({
                    itemId: ri.itemId,
                    receivedQuantity: ri.receivedQuantity
                }))
            });

            showToast('Items received successfully. Inventory updated.');
            
            // Refresh list and items
            await loadPurchaseBills();
            if (receiveBillId) {
                const items = await apiClient.get<PurchaseBillItem[]>(`/purchase-bills/${receiveBillId}/items`);
                dispatch({ type: 'SET_PURCHASE_BILL_ITEMS', payload: items });
            }
            
            // Reset receive form
            setReceiveBillId(null);
            setReceiveItems([]);
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to receive items';
            console.error('Error receiving items:', error);
            console.error('Error response:', error.response?.data);
            showAlert(errorMessage);
        }
    };

    // Update received quantity for an item
    const updateReceivedQuantity = (itemId: string, quantity: number) => {
        setReceiveItems(prev => prev.map(ri => 
            ri.itemId === itemId 
                ? { ...ri, receivedQuantity: Math.max(0, Math.min(quantity, ri.totalQuantity)) }
                : ri
        ));
    };

    // Get vendor name
    const getVendorName = (vendorId: string) => {
        const vendor = state.contacts.find(c => c.id === vendorId);
        return vendor?.name || 'Unknown Vendor';
    };

    // Status badge colors
    const getStatusBadge = (status: PurchaseBillStatus) => {
        switch (status) {
            case PurchaseBillStatus.PAID:
                return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case PurchaseBillStatus.PARTIALLY_PAID:
                return 'bg-amber-100 text-amber-700 border-amber-200';
            case PurchaseBillStatus.UNPAID:
                return 'bg-rose-100 text-rose-700 border-rose-200';
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    // Bill being paid
    const billToPay = paymentBillId ? filteredBills.find(b => b.id === paymentBillId) : null;

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Header & Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">Purchase Bills</h2>
                    <p className="text-sm text-slate-500">Manage purchase bills and inventory</p>
                </div>
                {!isCreatingBill && (
                    <Button onClick={() => setIsCreatingBill(true)}>
                        <span className="w-4 h-4 mr-2">{ICONS.plus}</span>
                        New Bill
                    </Button>
                )}
            </div>

            {/* Bill Creation/Edit Form (Inline) */}
            {isCreatingBill && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <h3 className="text-lg font-semibold text-slate-800">
                            {editingBill ? 'Edit Purchase Bill' : 'Create New Purchase Bill'}
                        </h3>
                        <button 
                            onClick={cancelBillCreation}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <span className="w-5 h-5 text-slate-400">{ICONS.x}</span>
                        </button>
                    </div>

                    {/* Bill Header Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Vendor *
                                <button
                                    type="button"
                                    onClick={() => setIsAddingVendor(true)}
                                    className="ml-2 text-xs text-indigo-600 hover:text-indigo-700"
                                >
                                    + Add New
                                </button>
                            </label>
                            <select
                                value={selectedVendorId}
                                onChange={(e) => setSelectedVendorId(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="">Select Vendor</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Bill Date *</label>
                            <Input
                                type="date"
                                value={billDate}
                                onChange={(e) => setBillDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                            <Input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                        <Input
                            type="text"
                            value={billDescription}
                            onChange={(e) => setBillDescription(e.target.value)}
                            placeholder="Optional description"
                        />
                    </div>

                    {/* Bill Items */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-slate-700">Bill Items</h4>
                            <Button variant="secondary" size="sm" onClick={addBillItem}>
                                <span className="w-4 h-4 mr-1">{ICONS.plus}</span>
                                Add Item
                            </Button>
                        </div>

                        {billItems.length === 0 ? (
                            <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                <p className="text-slate-500 text-sm">No items added yet. Click "Add Item" to start.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                                Inventory Item
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAddingInventoryItem(true)}
                                                    className="ml-2 text-xs text-indigo-600 hover:text-indigo-700 normal-case"
                                                >
                                                    + New
                                                </button>
                                            </th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-24">Quantity</th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-32">Price/Unit</th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-32">Total</th>
                                            <th className="px-3 py-2 w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {billItems.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-50">
                                                <td className="px-3 py-2">
                                                    <select
                                                        value={item.inventoryItemId}
                                                        onChange={(e) => updateBillItem(item.id, { inventoryItemId: e.target.value })}
                                                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="">Select Item</option>
                                                        {state.inventoryItems.map(i => (
                                                            <option key={i.id} value={i.id}>{i.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateBillItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                                        min="0"
                                                        step="0.1"
                                                        className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.pricePerUnit}
                                                        onChange={(e) => updateBillItem(item.id, { pricePerUnit: parseFloat(e.target.value) || 0 })}
                                                        min="0"
                                                        step="0.01"
                                                        className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-right font-medium text-slate-700">
                                                    {CURRENCY} {(item.totalAmount || 0).toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <button
                                                        onClick={() => removeBillItem(item.id)}
                                                        className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                                                    >
                                                        <span className="w-4 h-4">{ICONS.trash}</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-100 font-semibold">
                                            <td colSpan={3} className="px-3 py-3 text-right text-slate-700">Total:</td>
                                            <td className="px-3 py-3 text-right text-indigo-600">{CURRENCY} {(billTotal || 0).toLocaleString()}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                        <Button variant="secondary" onClick={cancelBillCreation}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={saveBill}
                            disabled={!selectedVendorId || billItems.length === 0 || billTotal === 0}
                        >
                            {editingBill ? 'Update Bill' : 'Save Bill'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Filters & Search */}
            {!isCreatingBill && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <Input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search bills by number, vendor, or description..."
                            />
                        </div>
                        <div className="w-full sm:w-48">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="All">All Statuses</option>
                                <option value="Unpaid">Unpaid</option>
                                <option value="Partially Paid">Partially Paid</option>
                                <option value="Paid">Paid</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Bills Data Grid */}
            {!isCreatingBill && (
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th 
                                        onClick={() => handleSort('billNumber')}
                                        className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    >
                                        Bill # {sortConfig.key === 'billNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th 
                                        onClick={() => handleSort('billDate')}
                                        className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    >
                                        Date {sortConfig.key === 'billDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th 
                                        onClick={() => handleSort('vendorName')}
                                        className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    >
                                        Vendor {sortConfig.key === 'vendorName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th 
                                        onClick={() => handleSort('totalAmount')}
                                        className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    >
                                        Total {sortConfig.key === 'totalAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th 
                                        onClick={() => handleSort('paidAmount')}
                                        className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    >
                                        Paid {sortConfig.key === 'paidAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                                        Balance
                                    </th>
                                    <th 
                                        onClick={() => handleSort('status')}
                                        className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    >
                                        Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredBills.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                                            {searchQuery || statusFilter !== 'All' 
                                                ? 'No purchase bills match your search criteria.'
                                                : 'No purchase bills yet. Create your first bill to get started.'
                                            }
                                        </td>
                                    </tr>
                                ) : (
                                    filteredBills.map((bill) => (
                                        <tr key={bill.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-800">{bill.billNumber}</td>
                                            <td className="px-4 py-3 text-slate-600">{new Date(bill.billDate).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 text-slate-700">{getVendorName(bill.vendorId)}</td>
                                            <td className="px-4 py-3 text-right font-medium text-slate-800">
                                                {CURRENCY} {(bill.totalAmount || 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-emerald-600">
                                                {CURRENCY} {(bill.paidAmount || 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium text-rose-600">
                                                {CURRENCY} {((bill.totalAmount || 0) - (bill.paidAmount || 0)).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full border ${getStatusBadge(bill.status)}`}>
                                                    {bill.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {bill.status !== PurchaseBillStatus.PAID && (
                                                        <Button 
                                                            variant="secondary" 
                                                            size="sm"
                                                            onClick={() => {
                                                                setPaymentBillId(bill.id);
                                                                setPaymentAmount(((bill.totalAmount || 0) - (bill.paidAmount || 0)).toString());
                                                            }}
                                                        >
                                                            Pay
                                                        </Button>
                                                    )}
                                                    {bill.status === PurchaseBillStatus.PAID && (
                                                        <Button 
                                                            variant="secondary" 
                                                            size="sm"
                                                            onClick={async () => {
                                                                try {
                                                                    const items = await apiClient.get<PurchaseBillItem[]>(`/purchase-bills/${bill.id}/items`);
                                                                    // Update global state
                                                                    dispatch({ type: 'SET_PURCHASE_BILL_ITEMS', payload: items });
                                                                    setReceiveItems(items.map(item => ({
                                                                        itemId: item.id,
                                                                        receivedQuantity: item.receivedQuantity || 0,
                                                                        totalQuantity: item.quantity
                                                                    })));
                                                                    setReceiveBillId(bill.id);
                                                                } catch (error) {
                                                                    showAlert('Failed to load bill items');
                                                                }
                                                            }}
                                                        >
                                                            {bill.itemsReceived ? 'Update Receive' : 'Receive'}
                                                        </Button>
                                                    )}
                                                    <button
                                                        onClick={() => startEditBill(bill)}
                                                        className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                        title="Edit"
                                                    >
                                                        <span className="w-4 h-4">{ICONS.edit}</span>
                                                    </button>
                                                    <button
                                                        onClick={() => deleteBill(bill.id)}
                                                        className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <span className="w-4 h-4">{ICONS.trash}</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {paymentBillId && billToPay && (
                <Modal
                    isOpen={true}
                    onClose={() => setPaymentBillId(null)}
                    title="Record Payment"
                >
                    <div className="space-y-4">
                        <div className="bg-slate-50 rounded-lg p-4 space-y-1">
                            <p className="text-sm text-slate-600">Bill: <span className="font-medium text-slate-800">{billToPay.billNumber}</span></p>
                            <p className="text-sm text-slate-600">Vendor: <span className="font-medium text-slate-800">{getVendorName(billToPay.vendorId)}</span></p>
                            <p className="text-sm text-slate-600">Balance Due: <span className="font-semibold text-rose-600">{CURRENCY} {((billToPay.totalAmount || 0) - (billToPay.paidAmount || 0)).toLocaleString()}</span></p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Account *</label>
                            <select
                                value={paymentAccountId}
                                onChange={(e) => setPaymentAccountId(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="">Select Account</option>
                                {paymentAccounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name} ({CURRENCY} {(a.balance || 0).toLocaleString()})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Amount *</label>
                            <Input
                                type="number"
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                min="0"
                                max={(billToPay.totalAmount || 0) - (billToPay.paidAmount || 0)}
                                step="0.01"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
                            <Input
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                            <Button variant="secondary" onClick={() => setPaymentBillId(null)}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={recordPayment}
                                disabled={!paymentAccountId || !paymentAmount || parseFloat(paymentAmount) <= 0}
                            >
                                Record Payment
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Vendor Quick-Add Modal */}
            {isAddingVendor && (
                <Modal
                    isOpen={true}
                    onClose={() => setIsAddingVendor(false)}
                    title="Add New Vendor"
                >
                    <ContactForm
                        onSave={(contact) => {
                            setSelectedVendorId(contact.id);
                            setIsAddingVendor(false);
                        }}
                        onCancel={() => setIsAddingVendor(false)}
                        initialType={ContactType.VENDOR}
                    />
                </Modal>
            )}

            {/* Inventory Item Quick-Add Modal - Placeholder for now */}
            {isAddingInventoryItem && (
                <Modal
                    isOpen={true}
                    onClose={() => setIsAddingInventoryItem(false)}
                    title="Add New Inventory Item"
                >
                    <div className="text-center py-8">
                        <p className="text-slate-600">
                            Inventory item creation will be added from Settings → Inventory Items
                        </p>
                        <Button 
                            onClick={() => setIsAddingInventoryItem(false)}
                            className="mt-4"
                        >
                            Close
                        </Button>
                    </div>
                </Modal>
            )}

            {/* Receive Items Modal */}
            {receiveBillId && (
                <Modal
                    isOpen={true}
                    onClose={() => {
                        setReceiveBillId(null);
                        setReceiveItems([]);
                    }}
                    title="Receive Items"
                >
                    <div className="space-y-4">
                        <div className="bg-slate-50 rounded-lg p-4 space-y-1">
                            <p className="text-sm text-slate-600">
                                Bill: <span className="font-medium text-slate-800">
                                    {filteredBills.find(b => b.id === receiveBillId)?.billNumber}
                                </span>
                            </p>
                            <p className="text-sm text-slate-500">
                                Enter the quantity received for each item. You can receive items partially.
                            </p>
                        </div>

                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Item</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Ordered</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Received</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Remaining</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {receiveItems.map((ri) => {
                                        // Find item in loaded bill items
                                        const billItem = state.purchaseBillItems?.find(item => item.id === ri.itemId);
                                        const remaining = ri.totalQuantity - ri.receivedQuantity;
                                        
                                        return (
                                            <tr key={ri.itemId} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 text-sm text-slate-700">
                                                    {billItem?.itemName || 'Unknown Item'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm text-slate-600">
                                                    {ri.totalQuantity}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={ri.totalQuantity}
                                                        step="0.01"
                                                        value={ri.receivedQuantity}
                                                        onChange={(e) => updateReceivedQuantity(ri.itemId, parseFloat(e.target.value) || 0)}
                                                        className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm font-medium text-slate-600">
                                                    {remaining.toFixed(2)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                            <Button 
                                variant="secondary" 
                                onClick={() => {
                                    setReceiveBillId(null);
                                    setReceiveItems([]);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleReceiveItems}
                                disabled={receiveItems.every(ri => ri.receivedQuantity === 0)}
                            >
                                Receive Items
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default PurchasesTab;

import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ShopPurchaseBill, ShopBillItem, ShopBillStatus, ShopInventoryItem, ShopPayment, ContactType, TransactionType, Account, AccountType } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';

// Local storage key for shop data
const SHOP_BILLS_KEY = 'shop_purchase_bills';
const SHOP_INVENTORY_KEY = 'shop_inventory';
const SHOP_PAYMENTS_KEY = 'shop_payments';

// Helper to generate bill number
const generateBillNumber = (bills: ShopPurchaseBill[]): string => {
    const count = bills.length + 1;
    return `PB-${String(count).padStart(4, '0')}`;
};

const PurchasesTab: React.FC = () => {
    const { state, dispatch } = useAppContext();

    // Local state for shop data (persisted to localStorage)
    const [bills, setBills] = useState<ShopPurchaseBill[]>(() => {
        const stored = localStorage.getItem(SHOP_BILLS_KEY);
        return stored ? JSON.parse(stored) : [];
    });

    const [inventory, setInventory] = useState<ShopInventoryItem[]>(() => {
        const stored = localStorage.getItem(SHOP_INVENTORY_KEY);
        return stored ? JSON.parse(stored) : [];
    });

    const [payments, setPayments] = useState<ShopPayment[]>(() => {
        const stored = localStorage.getItem(SHOP_PAYMENTS_KEY);
        return stored ? JSON.parse(stored) : [];
    });

    // Form state for new bill
    const [isCreatingBill, setIsCreatingBill] = useState(false);
    const [selectedVendorId, setSelectedVendorId] = useState('');
    const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
    const [billDescription, setBillDescription] = useState('');
    const [billItems, setBillItems] = useState<ShopBillItem[]>([]);

    // Payment modal state
    const [paymentBillId, setPaymentBillId] = useState<string | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentAccountId, setPaymentAccountId] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

    // Get vendors from contacts
    const vendors = useMemo(() => 
        state.contacts.filter(c => c.type === ContactType.VENDOR).sort((a, b) => a.name.localeCompare(b.name)),
        [state.contacts]
    );

    // Get expense categories for inventory items
    const expenseCategories = useMemo(() => 
        state.categories.filter(c => c.type === TransactionType.EXPENSE).sort((a, b) => a.name.localeCompare(b.name)),
        [state.categories]
    );

    // Get bank/cash accounts for payment
    const paymentAccounts = useMemo(() => 
        state.accounts.filter(a => a.type === AccountType.BANK || a.type === AccountType.CASH).sort((a, b) => a.name.localeCompare(b.name)),
        [state.accounts]
    );

    // Save to localStorage when data changes
    const saveBills = (newBills: ShopPurchaseBill[]) => {
        setBills(newBills);
        localStorage.setItem(SHOP_BILLS_KEY, JSON.stringify(newBills));
    };

    const saveInventory = (newInventory: ShopInventoryItem[]) => {
        setInventory(newInventory);
        localStorage.setItem(SHOP_INVENTORY_KEY, JSON.stringify(newInventory));
    };

    const savePayments = (newPayments: ShopPayment[]) => {
        setPayments(newPayments);
        localStorage.setItem(SHOP_PAYMENTS_KEY, JSON.stringify(newPayments));
    };

    // Add new item row to bill
    const addBillItem = () => {
        const newItem: ShopBillItem = {
            id: Date.now().toString(),
            categoryId: '',
            itemName: '',
            quantity: 1,
            pricePerItem: 0,
            totalCost: 0,
        };
        setBillItems([...billItems, newItem]);
    };

    // Update bill item
    const updateBillItem = (itemId: string, updates: Partial<ShopBillItem>) => {
        setBillItems(prev => prev.map(item => {
            if (item.id !== itemId) return item;
            const updated = { ...item, ...updates };
            // Auto-calculate total
            updated.totalCost = updated.quantity * updated.pricePerItem;
            return updated;
        }));
    };

    // Remove bill item
    const removeBillItem = (itemId: string) => {
        setBillItems(prev => prev.filter(item => item.id !== itemId));
    };

    // Calculate bill total
    const billTotal = useMemo(() => 
        billItems.reduce((sum, item) => sum + item.totalCost, 0),
        [billItems]
    );

    // Update inventory when bill is created
    const updateInventoryFromBill = (items: ShopBillItem[], date: string) => {
        const newInventory = [...inventory];

        items.forEach(item => {
            const existingIdx = newInventory.findIndex(inv => inv.categoryId === item.categoryId);
            
            if (existingIdx >= 0) {
                // Update existing inventory item with weighted average cost
                const existing = newInventory[existingIdx];
                const totalQty = existing.currentStock + item.quantity;
                const totalValue = (existing.currentStock * existing.averageCost) + (item.quantity * item.pricePerItem);
                const newAvgCost = totalQty > 0 ? totalValue / totalQty : item.pricePerItem;

                newInventory[existingIdx] = {
                    ...existing,
                    currentStock: totalQty,
                    averageCost: newAvgCost,
                    lastPurchaseDate: date,
                    lastPurchasePrice: item.pricePerItem,
                };
            } else {
                // Create new inventory item
                newInventory.push({
                    id: Date.now().toString() + item.categoryId,
                    categoryId: item.categoryId,
                    itemName: item.itemName,
                    currentStock: item.quantity,
                    averageCost: item.pricePerItem,
                    lastPurchaseDate: date,
                    lastPurchasePrice: item.pricePerItem,
                });
            }
        });

        saveInventory(newInventory);
    };

    // Save bill
    const saveBill = () => {
        if (!selectedVendorId || billItems.length === 0) return;

        // Validate items
        const invalidItems = billItems.filter(item => !item.categoryId || item.quantity <= 0 || item.pricePerItem <= 0);
        if (invalidItems.length > 0) {
            alert('Please fill in all item details (category, quantity, price)');
            return;
        }

        const newBill: ShopPurchaseBill = {
            id: Date.now().toString(),
            billNumber: generateBillNumber(bills),
            vendorId: selectedVendorId,
            billDate,
            items: billItems,
            totalAmount: billTotal,
            paidAmount: 0,
            status: ShopBillStatus.UNPAID,
            description: billDescription,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // Update inventory
        updateInventoryFromBill(billItems, billDate);

        // Save bill
        saveBills([newBill, ...bills]);

        // Reset form
        setIsCreatingBill(false);
        setSelectedVendorId('');
        setBillDate(new Date().toISOString().split('T')[0]);
        setBillDescription('');
        setBillItems([]);
    };

    // Cancel bill creation
    const cancelBillCreation = () => {
        setIsCreatingBill(false);
        setSelectedVendorId('');
        setBillDate(new Date().toISOString().split('T')[0]);
        setBillDescription('');
        setBillItems([]);
    };

    // Record payment
    const recordPayment = () => {
        if (!paymentBillId || !paymentAccountId || !paymentAmount) return;

        const bill = bills.find(b => b.id === paymentBillId);
        if (!bill) return;

        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) return;

        const remainingAmount = bill.totalAmount - bill.paidAmount;
        const actualPayment = Math.min(amount, remainingAmount);

        // Create payment record
        const newPayment: ShopPayment = {
            id: Date.now().toString(),
            billId: paymentBillId,
            accountId: paymentAccountId,
            amount: actualPayment,
            paymentDate,
            description: `Payment for ${bill.billNumber}`,
        };

        // Update bill
        const newPaidAmount = bill.paidAmount + actualPayment;
        const newStatus = newPaidAmount >= bill.totalAmount 
            ? ShopBillStatus.PAID 
            : ShopBillStatus.PARTIALLY_PAID;

        const updatedBills = bills.map(b => 
            b.id === paymentBillId 
                ? { ...b, paidAmount: newPaidAmount, status: newStatus, updatedAt: new Date().toISOString() }
                : b
        );

        // Create expense transaction in the main ledger
        const vendor = state.contacts.find(c => c.id === bill.vendorId);
        const account = state.accounts.find(a => a.id === paymentAccountId);
        
        if (account) {
            const transaction = {
                id: `shop-pay-${Date.now()}`,
                type: TransactionType.EXPENSE,
                amount: actualPayment,
                date: paymentDate,
                description: `Shop Purchase Payment: ${bill.billNumber}${vendor ? ` to ${vendor.name}` : ''}`,
                accountId: paymentAccountId,
                contactId: bill.vendorId,
            };
            dispatch({ type: 'ADD_TRANSACTION', payload: transaction as any });
            
            // Link transaction to payment
            newPayment.transactionId = transaction.id;
        }

        savePayments([...payments, newPayment]);
        saveBills(updatedBills);

        // Reset payment form
        setPaymentBillId(null);
        setPaymentAmount('');
        setPaymentAccountId('');
        setPaymentDate(new Date().toISOString().split('T')[0]);
    };

    // Get vendor name
    const getVendorName = (vendorId: string) => {
        const vendor = state.contacts.find(c => c.id === vendorId);
        return vendor?.name || 'Unknown Vendor';
    };

    // Get category name
    const getCategoryName = (categoryId: string) => {
        const category = state.categories.find(c => c.id === categoryId);
        return category?.name || 'Unknown Category';
    };

    // Status badge colors
    const getStatusBadge = (status: ShopBillStatus) => {
        switch (status) {
            case ShopBillStatus.PAID:
                return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case ShopBillStatus.PARTIALLY_PAID:
                return 'bg-amber-100 text-amber-700 border-amber-200';
            case ShopBillStatus.UNPAID:
                return 'bg-rose-100 text-rose-700 border-rose-200';
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    // Bill being paid
    const billToPay = paymentBillId ? bills.find(b => b.id === paymentBillId) : null;

    return (
        <div className="space-y-6">
            {/* Header with Add Button */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">Purchase Bills</h2>
                    <p className="text-sm text-slate-500">Create and manage purchase bills from vendors</p>
                </div>
                {!isCreatingBill && (
                    <Button onClick={() => setIsCreatingBill(true)}>
                        <span className="w-4 h-4 mr-2">{ICONS.plus}</span>
                        New Bill
                    </Button>
                )}
            </div>

            {/* Bill Creation Form (Inline) */}
            {isCreatingBill && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <h3 className="text-lg font-semibold text-slate-800">Create New Purchase Bill</h3>
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
                            <label className="block text-sm font-medium text-slate-700 mb-1">Vendor *</label>
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
                            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                            <Input
                                type="text"
                                value={billDescription}
                                onChange={(e) => setBillDescription(e.target.value)}
                                placeholder="Optional description"
                            />
                        </div>
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
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Category</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Item Name</th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-24">Quantity</th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-32">Price/Item</th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-32">Total</th>
                                            <th className="px-3 py-2 w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {billItems.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-50">
                                                <td className="px-3 py-2">
                                                    <select
                                                        value={item.categoryId}
                                                        onChange={(e) => {
                                                            const cat = expenseCategories.find(c => c.id === e.target.value);
                                                            updateBillItem(item.id, { 
                                                                categoryId: e.target.value,
                                                                itemName: cat?.name || ''
                                                            });
                                                        }}
                                                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="">Select Category</option>
                                                        {expenseCategories.map(c => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="text"
                                                        value={item.itemName}
                                                        onChange={(e) => updateBillItem(item.id, { itemName: e.target.value })}
                                                        placeholder="Item name"
                                                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateBillItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                                        min="0"
                                                        step="1"
                                                        className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.pricePerItem}
                                                        onChange={(e) => updateBillItem(item.id, { pricePerItem: parseFloat(e.target.value) || 0 })}
                                                        min="0"
                                                        step="0.01"
                                                        className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-right font-medium text-slate-700">
                                                    {CURRENCY} {item.totalCost.toLocaleString()}
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
                                            <td colSpan={4} className="px-3 py-3 text-right text-slate-700">Total:</td>
                                            <td className="px-3 py-3 text-right text-indigo-600">{CURRENCY} {billTotal.toLocaleString()}</td>
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
                            Save Bill
                        </Button>
                    </div>
                </div>
            )}

            {/* Bills Data Grid */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Bill #</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Vendor</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Items</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Total</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Paid</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Balance</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Status</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {bills.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                                        No purchase bills yet. Create your first bill to get started.
                                    </td>
                                </tr>
                            ) : (
                                bills.map((bill) => (
                                    <tr key={bill.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-800">{bill.billNumber}</td>
                                        <td className="px-4 py-3 text-slate-600">{new Date(bill.billDate).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 text-slate-700">{getVendorName(bill.vendorId)}</td>
                                        <td className="px-4 py-3 text-slate-600">
                                            <span className="text-sm">{bill.items.length} item(s)</span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                                            {CURRENCY} {bill.totalAmount.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right text-emerald-600">
                                            {CURRENCY} {bill.paidAmount.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-rose-600">
                                            {CURRENCY} {(bill.totalAmount - bill.paidAmount).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full border ${getStatusBadge(bill.status)}`}>
                                                {bill.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {bill.status !== ShopBillStatus.PAID && (
                                                <Button 
                                                    variant="secondary" 
                                                    size="sm"
                                                    onClick={() => {
                                                        setPaymentBillId(bill.id);
                                                        setPaymentAmount((bill.totalAmount - bill.paidAmount).toString());
                                                    }}
                                                >
                                                    Pay
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Payment Modal */}
            {paymentBillId && billToPay && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-800">Record Payment</h3>
                            <button 
                                onClick={() => setPaymentBillId(null)}
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <span className="w-5 h-5 text-slate-400">{ICONS.x}</span>
                            </button>
                        </div>

                        <div className="bg-slate-50 rounded-lg p-4 space-y-1">
                            <p className="text-sm text-slate-600">Bill: <span className="font-medium text-slate-800">{billToPay.billNumber}</span></p>
                            <p className="text-sm text-slate-600">Vendor: <span className="font-medium text-slate-800">{getVendorName(billToPay.vendorId)}</span></p>
                            <p className="text-sm text-slate-600">Balance Due: <span className="font-semibold text-rose-600">{CURRENCY} {(billToPay.totalAmount - billToPay.paidAmount).toLocaleString()}</span></p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Account *</label>
                                <select
                                    value={paymentAccountId}
                                    onChange={(e) => setPaymentAccountId(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    <option value="">Select Account</option>
                                    {paymentAccounts.map(a => (
                                        <option key={a.id} value={a.id}>{a.name} ({CURRENCY} {a.balance.toLocaleString()})</option>
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
                                    max={billToPay.totalAmount - billToPay.paidAmount}
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
                </div>
            )}
        </div>
    );
};

export default PurchasesTab;

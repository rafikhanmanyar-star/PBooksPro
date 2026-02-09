
import React, { useState, useMemo } from 'react';
import { InventoryProvider, useInventory } from '../../context/InventoryContext';
import { AccountingProvider, useAccounting } from '../../context/AccountingContext';
import { useAppContext } from '../../context/AppContext';
import { ICONS, CURRENCY } from '../../constants';
import { Contact, InvoiceStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import ContactForm from '../settings/ContactForm';
import { BillsApiRepository } from '../../services/api/repositories/billsApi';
import { VendorsApiRepository } from '../../services/api/repositories/vendorsApi';
import { Bill } from '../../types';

const ProcurementContent: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { items, warehouses, updateStock, addItem, refreshWarehouses, refreshItems } = useInventory();
    const { accounts, postJournalEntry } = useAccounting();

    // 🔍 DEBUG: Check if warehouses are loaded
    React.useEffect(() => {
        console.log('📦 [ProcurementPage] Warehouses loaded:', warehouses);
        console.log('📦 [ProcurementPage] Warehouses count:', warehouses?.length || 0);
    }, [warehouses]);

    // 🔄 Refresh warehouses when component mounts to get latest stores
    React.useEffect(() => {
        console.log('🔄 [ProcurementPage] Refreshing warehouses on mount...');
        refreshWarehouses();
    }, [refreshWarehouses]);

    // 🔄 Refresh items/products when component mounts to get latest SKUs
    React.useEffect(() => {
        console.log('🔄 [ProcurementPage] Refreshing products on mount...');
        refreshItems();
    }, [refreshItems]);

    const billsApi = useMemo(() => new BillsApiRepository(), []);
    const vendorsApi = useMemo(() => new VendorsApiRepository(), []);

    const [selectedVendor, setSelectedVendor] = useState<Contact | null>(null);
    const [targetWarehouse, setTargetWarehouse] = useState('');
    const [purchaseItems, setPurchaseItems] = useState<any[]>([]);
    const [isCreateVendorModalOpen, setIsCreateVendorModalOpen] = useState(false);
    const [isCreateProductModalOpen, setIsCreateProductModalOpen] = useState(false);
    const [newItemData, setNewItemData] = useState({
        sku: '',
        name: '',
        category: 'General',
        costPrice: 0,
        retailPrice: 0,
        reorderPoint: 10,
        unit: 'pcs'
    });
    const [vendorSearchQuery, setVendorSearchQuery] = useState('');
    const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
    const [productSearchQuery, setProductSearchQuery] = useState('');
    const [isSubmitLoading, setIsSubmitLoading] = useState(false);

    const vendors = useMemo(() =>
        state.vendors || [],
        [state.vendors]
    );

    const filteredVendors = vendors.filter(v =>
        v.name.toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
        v.companyName?.toLowerCase().includes(vendorSearchQuery.toLowerCase())
    );

    const filteredProducts = useMemo(() => {
        const query = productSearchQuery.toLowerCase();
        if (!query) {
            // Show first 5 items by default so the list isn't empty
            return items.slice(0, 5);
        }
        return items.filter(i =>
            i.name.toLowerCase().includes(query) ||
            i.sku.toLowerCase().includes(query)
        ).slice(0, 10);
    }, [items, productSearchQuery]);

    const handleAddItem = (inventoryItem: any) => {
        const existing = purchaseItems.find(i => i.id === inventoryItem.id);
        if (existing) {
            setPurchaseItems(prev => prev.map(i =>
                i.id === inventoryItem.id ? { ...i, quantity: i.quantity + 1 } : i
            ));
        } else {
            setPurchaseItems(prev => [...prev, {
                id: inventoryItem.id,
                sku: inventoryItem.sku,
                name: inventoryItem.name,
                quantity: 1,
                costPrice: inventoryItem.costPrice,
                total: inventoryItem.costPrice
            }]);
        }
    };

    const handleUpdateItem = (id: string, field: string, value: any) => {
        setPurchaseItems(prev => prev.map(i => {
            if (i.id === id) {
                const updated = { ...i, [field]: value };
                if (field === 'quantity' || field === 'costPrice') {
                    updated.total = Number(updated.quantity) * Number(updated.costPrice);
                }
                return updated;
            }
            return i;
        }));
    };

    const handleRemoveItem = (id: string) => {
        setPurchaseItems(prev => prev.filter(i => i.id !== id));
    };

    const subtotal = purchaseItems.reduce((sum, i) => sum + i.total, 0);

    const handleStockIn = async () => {
        if (!selectedVendor || !targetWarehouse || purchaseItems.length === 0) {
            alert('Please select vendor, warehouse and add items.');
            return;
        }
        try {
            setIsSubmitLoading(true);
            const grnId = `GRN-${Date.now()}`;

            // 1. Update Inventory for each item
            for (const item of purchaseItems) {
                await updateStock(
                    item.id,
                    targetWarehouse,
                    Number(item.quantity),
                    'Purchase',
                    grnId,
                    `Stock In from ${selectedVendor.name}`
                );
            }

            // 2. Post Journal Entry in Accounting
            // Debit: Inventory Asset, Credit: Accounts Payable
            const inventoryAssetAcc = accounts.find(a => a.name.includes('Inventory'))?.id;
            const accountsPayableAcc = accounts.find(a => a.name.includes('Payable'))?.id;

            if (inventoryAssetAcc && accountsPayableAcc) {
                await postJournalEntry({
                    date: new Date().toISOString().split('T')[0],
                    reference: grnId,
                    description: `Procurement: Stock In from ${selectedVendor.name}`,
                    lines: [
                        {
                            accountId: inventoryAssetAcc,
                            accountName: 'Inventory Asset',
                            memo: `Purchase of ${purchaseItems.length} items`,
                            debit: subtotal,
                            credit: 0
                        },
                        {
                            accountId: accountsPayableAcc,
                            accountName: 'Accounts Payable',
                            memo: `Liability to ${selectedVendor.name}`,
                            debit: 0,
                            credit: subtotal
                        }
                    ],
                    sourceModule: 'Purchases'
                });
            } else {
                console.warn('Accounting accounts not found, skipping journal entry');
            }

            // 3. Create a Bill record for Vendor Tracking
            const billPayload: Partial<Bill> = {
                id: grnId,
                billNumber: grnId,
                contactId: selectedVendor.id,
                amount: subtotal,
                paidAmount: 0,
                status: InvoiceStatus.UNPAID,
                issueDate: new Date().toISOString().split('T')[0],
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days default
                description: `Procurement Stock-in of ${purchaseItems.length} items`
            };

            await billsApi.create(billPayload);

            dispatch({
                type: 'ADD_BILL',
                payload: billPayload as Bill
            });

            alert('Stock In successfully processed!');
            // Reset form
            setSelectedVendor(null);
            setTargetWarehouse('');
            setPurchaseItems([]);
        } catch (error: any) {
            console.error('Procurement error:', error);
            alert(`Failed to process procurement: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSubmitLoading(false);
        }
    };

    const handleCreateProduct = async () => {
        if (!newItemData.name) {
            alert('Product name is required');
            return;
        }

        try {
            const newItem = await addItem({
                ...newItemData,
                id: '', // Will be assigned by backend
                onHand: 0,
                available: 0,
                reserved: 0,
                inTransit: 0,
                damaged: 0,
                warehouseStock: {}
            } as any);

            if (newItem) {
                handleAddItem(newItem);
                setIsCreateProductModalOpen(false);
                setNewItemData({
                    sku: '',
                    name: '',
                    category: 'General',
                    costPrice: 0,
                    retailPrice: 0,
                    reorderPoint: 10,
                    unit: 'pcs'
                });
            }
        } catch (error) {
            // Error handled in InventoryContext
        }
    };

    const handleCreateVendor = async (contact: Omit<Contact, 'id'>) => {
        console.log('🚀 Initiating vendor creation:', contact);
        try {
            const vendorData = {
                name: contact.name,
                description: (contact as any).description || null,
                contactNo: (contact as any).contactNo || null,
                companyName: (contact as any).companyName || null,
                address: (contact as any).address || null,
            };
            const savedVendor = await vendorsApi.create(vendorData);

            console.log('✅ Vendor saved to DB:', savedVendor);

            dispatch({ type: 'ADD_VENDOR', payload: savedVendor as any });
            setSelectedVendor(savedVendor as any);
            setIsCreateVendorModalOpen(false);

            // Success feedback (optional: use toast if available)
            console.log('🎯 Selected new vendor:', savedVendor.name);
        } catch (error: any) {
            console.error('❌ Failed to create vendor:', error);
            const msg = error.response?.data?.message || error.message || 'Unknown server error';
            alert(`Failed to save vendor to database: ${msg}`);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 -m-4 md:-m-8">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-6 shadow-sm z-10 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        Procurement & Stock-In
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-bold uppercase">
                            Catalog: {items.length} items
                        </span>
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">Record incoming inventory and update stock levels.</p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setSelectedVendor(null);
                            setTargetWarehouse('');
                            setPurchaseItems([]);
                        }}
                    >
                        Clear Draft
                    </Button>
                    <Button
                        onClick={handleStockIn}
                        disabled={isSubmitLoading || purchaseItems.length === 0 || !selectedVendor || !targetWarehouse}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[150px]"
                    >
                        {isSubmitLoading ? 'Processing...' : 'Settle & Stock In'}
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex min-h-0">
                {/* Left Side: Setup & Product Selection */}
                <div className="w-1/3 p-6 border-r border-slate-200 overflow-y-auto space-y-6">
                    {/* Step 1: Vendor & Warehouse */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                {ICONS.briefcase}
                            </div>
                            <h2 className="font-bold text-slate-800">1. Source & Destination</h2>
                        </div>

                        <div className="relative">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Vendor / Supplier</label>

                            {selectedVendor ? (
                                <div className="w-full p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between items-center animate-in fade-in slide-in-from-top-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                                            {selectedVendor.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900">{selectedVendor.name}</div>
                                            <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-tighter">{selectedVendor.contactNo}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSelectedVendor(null);
                                            setVendorSearchQuery('');
                                        }}
                                        className="text-indigo-400 hover:text-rose-500 transition-colors p-1"
                                    >
                                        {ICONS.x}
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                        {ICONS.search}
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Type vendor name..."
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                                        value={vendorSearchQuery}
                                        onChange={(e) => {
                                            setVendorSearchQuery(e.target.value);
                                            setIsVendorDropdownOpen(true);
                                        }}
                                        onFocus={() => setIsVendorDropdownOpen(true)}
                                    />

                                    {isVendorDropdownOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-40"
                                                onClick={() => setIsVendorDropdownOpen(false)}
                                            />
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 shadow-2xl rounded-2xl z-50 max-h-[300px] overflow-y-auto p-2 custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                                                <div className="p-2 flex justify-between items-center border-b border-slate-50 mb-2">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Vendor</span>
                                                    <button
                                                        onClick={() => {
                                                            setIsVendorDropdownOpen(false);
                                                            setIsCreateVendorModalOpen(true);
                                                        }}
                                                        className="text-[10px] font-black text-indigo-600 uppercase hover:text-indigo-700"
                                                    >
                                                        + New Vendor
                                                    </button>
                                                </div>

                                                {filteredVendors.length === 0 ? (
                                                    <div className="p-8 text-center text-slate-400">
                                                        <p className="text-xs font-bold italic mb-3">No vendors found matching "{vendorSearchQuery}"</p>
                                                        {vendorSearchQuery && (
                                                            <button
                                                                onClick={() => {
                                                                    setIsVendorDropdownOpen(false);
                                                                    setIsCreateVendorModalOpen(true);
                                                                }}
                                                                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all"
                                                            >
                                                                Create "{vendorSearchQuery}"
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    filteredVendors.map(vendor => (
                                                        <button
                                                            key={vendor.id}
                                                            onClick={() => {
                                                                setSelectedVendor(vendor);
                                                                setIsVendorDropdownOpen(false);
                                                            }}
                                                            className="w-full flex items-center gap-3 p-3 hover:bg-indigo-50 rounded-xl transition-all text-left group"
                                                        >
                                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                                                {vendor.name.charAt(0)}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-bold text-slate-800 text-sm truncate">{vendor.name}</div>
                                                                <div className="text-[10px] text-slate-500">{vendor.companyName || 'Individual'}</div>
                                                            </div>
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Target Warehouse/Store</label>
                            <Select
                                value={targetWarehouse}
                                onChange={(e) => setTargetWarehouse(e.target.value)}
                                className="bg-slate-50 border-slate-200"
                            >
                                <option value="">Select Location...</option>
                                {warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id}>{wh.name} ({wh.code})</option>
                                ))}
                            </Select>
                        </div>
                    </div>

                    {/* Step 2: Product Search */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                {ICONS.package}
                            </div>
                            <h2 className="font-bold text-slate-800">2. Select Products</h2>
                        </div>

                        <div className="relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                {ICONS.search}
                            </span>
                            <input
                                type="text"
                                placeholder="Search by SKU or name..."
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                                value={productSearchQuery}
                                onChange={(e) => setProductSearchQuery(e.target.value)}
                            />

                            {/* Dropdown Results for Products */}
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 shadow-2xl rounded-2xl z-40 max-h-[400px] overflow-y-auto p-2 custom-scrollbar animate-in fade-in zoom-in-95 duration-200 hidden group-focus-within:block">
                                <div className="p-2 border-b border-slate-50 mb-2 flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        {productSearchQuery ? `Matches (${filteredProducts.length})` : 'Catalog Preview'}
                                    </span>
                                    <button
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            setIsCreateProductModalOpen(true);
                                        }}
                                        className="text-[10px] font-black text-indigo-600 uppercase hover:text-indigo-700"
                                    >
                                        + New Product
                                    </button>
                                </div>

                                {filteredProducts.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400">
                                        <p className="text-xs font-bold italic mb-3">No products found "{productSearchQuery}"</p>
                                        <button
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                setNewItemData(prev => ({ ...prev, name: productSearchQuery }));
                                                setIsCreateProductModalOpen(true);
                                            }}
                                            className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all"
                                        >
                                            Create "{productSearchQuery}"
                                        </button>
                                    </div>
                                ) : (
                                    filteredProducts.map(item => (
                                        <button
                                            key={item.id}
                                            onMouseDown={(e) => {
                                                e.preventDefault(); // Prevent focus loss before click
                                                handleAddItem(item);
                                                setProductSearchQuery('');
                                            }}
                                            className="w-full flex items-center justify-between p-3 hover:bg-indigo-50 rounded-xl transition-all text-left border border-transparent hover:border-indigo-100 shadow-sm mb-1"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                                                    {ICONS.package}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-xs truncate max-w-[150px]">{item.name}</div>
                                                    <div className="text-[9px] text-slate-500 font-mono uppercase">{item.sku}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[9px] font-black text-slate-400 uppercase">Stock: {item.onHand}</div>
                                                <div className="text-xs font-black text-indigo-600">{CURRENCY} {item.costPrice.toLocaleString()}</div>
                                            </div>
                                        </button>
                                    ))
                                )}

                                {!productSearchQuery && items.length > filteredProducts.length && (
                                    <div className="p-3 text-center bg-slate-50 rounded-xl">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                                            + {items.length - filteredProducts.length} more in catalog
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Bill items */}
                <div className="flex-1 p-6 overflow-y-auto">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                            <h2 className="font-black text-slate-800 uppercase tracking-widest text-xs">Purchase Draft</h2>
                            <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-bold">
                                {purchaseItems.length} Items Selected
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                            {purchaseItems.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 opacity-50">
                                    <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center scale-150 mb-4">
                                        {ICONS.shoppingCart}
                                    </div>
                                    <p className="font-bold text-lg italic">Your purchase draft is empty</p>
                                    <p className="text-sm">Select a vendor and start adding products to buy.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                                            <th className="pb-3 text-center w-12">#</th>
                                            <th className="pb-3">Product Description</th>
                                            <th className="pb-3 text-center w-32">Quantity</th>
                                            <th className="pb-3 text-right w-32">Unit Cost</th>
                                            <th className="pb-3 text-right w-32">Total</th>
                                            <th className="pb-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {purchaseItems.map((item, idx) => (
                                            <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                                                <td className="py-4 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                                                <td className="py-4">
                                                    <div className="font-bold text-slate-800">{item.name}</div>
                                                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{item.sku}</div>
                                                </td>
                                                <td className="py-4">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => handleUpdateItem(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                                                            className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200"
                                                        >
                                                            -
                                                        </button>
                                                        <input
                                                            type="number"
                                                            className="w-16 text-center bg-transparent border-none font-bold text-slate-800 focus:ring-0 p-0"
                                                            value={item.quantity}
                                                            onChange={(e) => handleUpdateItem(item.id, 'quantity', Number(e.target.value))}
                                                        />
                                                        <button
                                                            onClick={() => handleUpdateItem(item.id, 'quantity', item.quantity + 1)}
                                                            className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="py-4">
                                                    <input
                                                        type="number"
                                                        className="w-full text-right bg-transparent border-none font-bold text-slate-800 focus:ring-0 p-0"
                                                        value={item.costPrice}
                                                        onChange={(e) => handleUpdateItem(item.id, 'costPrice', Number(e.target.value))}
                                                    />
                                                </td>
                                                <td className="py-4 text-right font-black text-slate-800">
                                                    {CURRENCY} {item.total.toLocaleString()}
                                                </td>
                                                <td className="py-4 text-center">
                                                    <button
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        {ICONS.x}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Totals */}
                        <div className="bg-slate-900 text-white p-8 space-y-4">
                            <div className="flex justify-between items-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                                <span>Subtotal</span>
                                <span>{CURRENCY} {subtotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Total Purchase Value</div>
                                    <div className="text-3xl font-black">{CURRENCY} {subtotal.toLocaleString()}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Authorized By</div>
                                    <div className="text-sm font-bold italic">POS Admin</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            {/* Create Product Modal */}
            <Modal
                isOpen={isCreateProductModalOpen}
                onClose={() => setIsCreateProductModalOpen(false)}
                title="Quick Create SKU"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="SKU Code"
                            placeholder="Auto-generated if empty"
                            value={newItemData.sku}
                            onChange={(e) => setNewItemData({ ...newItemData, sku: e.target.value })}
                        />
                        <Input
                            label="Product Name"
                            placeholder="e.g. Cotton T-Shirt"
                            value={newItemData.name}
                            onChange={(e) => setNewItemData({ ...newItemData, name: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Cost Price"
                            type="number"
                            value={newItemData.costPrice}
                            onChange={(e) => setNewItemData({ ...newItemData, costPrice: Number(e.target.value) })}
                        />
                        <Input
                            label="Retail Price"
                            type="number"
                            value={newItemData.retailPrice}
                            onChange={(e) => setNewItemData({ ...newItemData, retailPrice: Number(e.target.value) })}
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label="Category"
                            placeholder="General"
                            value={newItemData.category}
                            onChange={(e) => setNewItemData({ ...newItemData, category: e.target.value })}
                        />
                        <Input
                            label="Unit"
                            placeholder="pcs"
                            value={newItemData.unit}
                            onChange={(e) => setNewItemData({ ...newItemData, unit: e.target.value })}
                        />
                        <Input
                            label="Reorder Alert"
                            type="number"
                            value={newItemData.reorderPoint}
                            onChange={(e) => setNewItemData({ ...newItemData, reorderPoint: Number(e.target.value) })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="secondary" onClick={() => setIsCreateProductModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateProduct} className="bg-indigo-600">Create & Add to Order</Button>
                    </div>
                </div>
            </Modal>

            {/* Create Vendor Modal */}
            <Modal
                isOpen={isCreateVendorModalOpen}
                onClose={() => setIsCreateVendorModalOpen(false)}
                title="Register New Vendor"
                size="xl"
            >
                <div className="p-1">
                    <ContactForm
                        onSubmit={handleCreateVendor}
                        onCancel={() => setIsCreateVendorModalOpen(false)}
                        isVendorForm={true}
                        existingVendors={state.vendors}
                    />
                </div>
            </Modal>
        </div>
    );
};

const ProcurementPage: React.FC = () => {
    return (
        <InventoryProvider>
            <AccountingProvider>
                <ProcurementContent />
            </AccountingProvider>
        </InventoryProvider>
    );
};

export default ProcurementPage;

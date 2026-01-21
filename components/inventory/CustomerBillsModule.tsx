import React, { useState, useEffect, useMemo } from 'react';
import { CustomerBill, SaleItem, InventoryItem, PaymentMethod, PaymentStatus } from '../../types';
import { customerBillApi } from '../../services/api/repositories/customerBillApi';
import { inventoryApi } from '../../services/api/repositories/inventoryApi';
import { logger } from '../../services/logger';

const CustomerBillsModule: React.FC = () => {
    const [bills, setBills] = useState<CustomerBill[]>([]);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedBill, setSelectedBill] = useState<CustomerBill | null>(null);
    const [isInvoiceViewOpen, setIsInvoiceViewOpen] = useState(false);

    // New Bill state
    const [newBill, setNewBill] = useState<Partial<CustomerBill>>({
        billNumber: `BILL-${Date.now().toString().slice(-6)}`,
        customerName: '',
        date: new Date().toISOString().split('T')[0],
        items: [],
        totalAmount: 0,
        totalProfit: 0,
        paymentMethod: 'Cash',
        paymentStatus: 'Unpaid',
        paidAmount: 0
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [billData, itemData] = await Promise.all([
                customerBillApi.getAll(),
                inventoryApi.getAll()
            ]);
            setBills(billData);
            setInventoryItems(itemData);
        } catch (error) {
            logger.errorCategory('inventory', 'Failed to fetch sales data', error);
        } finally {
            setIsLoading(false);
        }
    };

    const addItemToBill = (inventoryItem: InventoryItem) => {
        const markup = 20; // Default 20% markup
        const sellingPrice = inventoryItem.averagePurchasePrice * (1 + markup / 100);
        
        const newItem: SaleItem = {
            id: Math.random().toString(36).substr(2, 9),
            itemId: inventoryItem.id,
            name: inventoryItem.name,
            quantity: 1,
            costPrice: inventoryItem.averagePurchasePrice,
            sellingPrice: sellingPrice,
            markupPercentage: markup,
            total: sellingPrice,
            profit: sellingPrice - inventoryItem.averagePurchasePrice
        };

        const updatedItems = [...(newBill.items || []), newItem];
        calculateTotals(updatedItems);
    };

    const updateItem = (index: number, updates: Partial<SaleItem>) => {
        const items = [...(newBill.items || [])];
        const item = { ...items[index], ...updates };
        
        if (updates.markupPercentage !== undefined) {
            item.sellingPrice = item.costPrice * (1 + item.markupPercentage / 100);
        } else if (updates.sellingPrice !== undefined) {
            item.markupPercentage = ((item.sellingPrice / item.costPrice) - 1) * 100;
        }

        item.total = item.sellingPrice * item.quantity;
        item.profit = (item.sellingPrice - item.costPrice) * item.quantity;
        
        items[index] = item;
        calculateTotals(items);
    };

    const calculateTotals = (items: SaleItem[]) => {
        const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
        const totalProfit = items.reduce((sum, item) => sum + item.profit, 0);
        setNewBill(prev => ({ ...prev, items, totalAmount, totalProfit }));
    };

    const handleSaveBill = async () => {
        try {
            await customerBillApi.save(newBill as CustomerBill);
            
            // Decrement inventory stock
            for (const item of newBill.items || []) {
                const invItem = inventoryItems.find(i => i.id === item.itemId);
                if (invItem) {
                    await inventoryApi.save({
                        ...invItem,
                        currentStock: invItem.currentStock - item.quantity
                    });
                }
            }

            setIsCreateModalOpen(false);
            fetchData();
        } catch (error) {
            logger.errorCategory('inventory', 'Failed to save bill', error);
        }
    };

    const printInvoice = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    aside, nav, header, .no-print { display: none !important; }
                    body { background: white !important; }
                    .print-only { display: block !important; }
                    .main-content { margin: 0 !important; padding: 0 !important; width: 100% !important; }
                }
                .print-only { display: none; }
            `}} />

            <div className="flex items-center justify-between no-print">
                <h2 className="text-xl font-bold font-heading uppercase tracking-tight text-slate-950">Customer Bills</h2>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all font-heading uppercase tracking-widest text-xs font-bold shadow-lg shadow-orange-500/20"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                    New Sale Bill
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm no-print">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bill #</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Customer</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Amount</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right text-emerald-600">Profit</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans text-sm">
                        {bills.map(bill => (
                            <tr 
                                key={bill.id} 
                                onClick={() => {
                                    setSelectedBill(bill);
                                    setIsInvoiceViewOpen(true);
                                }}
                                className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                            >
                                <td className="px-6 py-4 font-mono font-bold text-slate-900">{bill.billNumber}</td>
                                <td className="px-6 py-4 text-slate-700">{bill.customerName}</td>
                                <td className="px-6 py-4 text-slate-500">{new Date(bill.date).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-right font-bold text-slate-900">₹{bill.totalAmount.toLocaleString()}</td>
                                <td className="px-6 py-4 text-right font-bold text-emerald-600">₹{bill.totalProfit.toLocaleString()}</td>
                                <td className="px-6 py-4 text-right">
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                        bill.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                        bill.paymentStatus === 'Partial' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                        'bg-rose-50 text-rose-600 border border-rose-100'
                                    }`}>
                                        {bill.paymentStatus}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create Bill Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm no-print">
                    <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="bg-slate-950 px-8 py-6 flex items-center justify-between">
                            <h2 className="text-xl font-bold font-heading uppercase tracking-tight text-white">Create New Sale</h2>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex">
                            {/* Material Selector */}
                            <div className="w-1/3 border-r border-slate-100 p-6 overflow-y-auto bg-slate-50/50">
                                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Select Materials</h3>
                                <div className="space-y-2">
                                    {inventoryItems.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => addItemToBill(item)}
                                            className="w-full text-left p-3 bg-white border border-slate-200 rounded-xl hover:border-orange-500 hover:shadow-md transition-all group"
                                        >
                                            <p className="font-bold text-slate-900 text-sm group-hover:text-orange-600">{item.name}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Stock: {item.currentStock}</span>
                                                <span className="text-[10px] text-slate-950 font-bold">₹{item.averagePurchasePrice}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Bill Details */}
                            <div className="flex-1 p-8 overflow-y-auto space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Customer Name</label>
                                        <input
                                            type="text"
                                            value={newBill.customerName}
                                            onChange={e => setNewBill({...newBill, customerName: e.target.value})}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                                            placeholder="John Doe"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Payment Method</label>
                                            <select
                                                value={newBill.paymentMethod}
                                                onChange={e => setNewBill({...newBill, paymentMethod: e.target.value as PaymentMethod})}
                                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                                            >
                                                <option value="Cash">Cash</option>
                                                <option value="Bank">Bank</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Status</label>
                                            <select
                                                value={newBill.paymentStatus}
                                                onChange={e => setNewBill({...newBill, paymentStatus: e.target.value as PaymentStatus})}
                                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                                            >
                                                <option value="Unpaid">Unpaid</option>
                                                <option value="Partial">Partial</option>
                                                <option value="Paid">Paid</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                            <tr>
                                                <th className="px-4 py-2">Material</th>
                                                <th className="px-4 py-2 w-16 text-center">Qty</th>
                                                <th className="px-4 py-2 w-20 text-center">Markup%</th>
                                                <th className="px-4 py-2 w-24 text-right">Price</th>
                                                <th className="px-4 py-2 w-24 text-right">Total</th>
                                                <th className="px-4 py-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {newBill.items?.map((item, index) => (
                                                <tr key={item.id} className="text-sm">
                                                    <td className="px-4 py-3 font-medium">{item.name}</td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={e => updateItem(index, { quantity: Number(e.target.value) })}
                                                            className="w-full bg-transparent text-center font-bold"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.markupPercentage}
                                                            onChange={e => updateItem(index, { markupPercentage: Number(e.target.value) })}
                                                            className="w-full bg-transparent text-center font-bold text-orange-600"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <input
                                                            type="number"
                                                            value={item.sellingPrice}
                                                            onChange={e => updateItem(index, { sellingPrice: Number(e.target.value) })}
                                                            className="w-full bg-transparent text-right font-bold"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">₹{item.total.toLocaleString()}</td>
                                                    <td className="px-4 py-3">
                                                        <button 
                                                            onClick={() => {
                                                                const items = [...(newBill.items || [])];
                                                                items.splice(index, 1);
                                                                calculateTotals(items);
                                                            }}
                                                            className="text-rose-500"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-950 p-8 flex items-center justify-between">
                            <div className="flex gap-8">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Bill</p>
                                    <p className="text-2xl font-bold text-white">₹{newBill.totalAmount?.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Net Profit</p>
                                    <p className="text-2xl font-bold text-emerald-400">₹{newBill.totalProfit?.toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-6 py-3 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 transition-all uppercase tracking-widest text-xs"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleSaveBill}
                                    className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-500/20 uppercase tracking-widest text-xs"
                                >
                                    Generate Bill
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice View / Print Modal */}
            {isInvoiceViewOpen && selectedBill && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm no-print">
                    <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8 space-y-8" id="invoice-content">
                            {/* Invoice Header */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="w-12 h-12 bg-slate-950 rounded-xl flex items-center justify-center text-white font-bold text-xl mb-4">P</div>
                                    <h1 className="text-3xl font-bold font-heading uppercase tracking-tighter text-slate-950">INVOICE</h1>
                                    <p className="text-slate-500 font-mono text-sm mt-1">#{selectedBill.billNumber}</p>
                                </div>
                                <div className="text-right">
                                    <h3 className="font-bold text-slate-900 uppercase tracking-widest text-[10px] mb-2">Billed To</h3>
                                    <p className="font-bold text-lg text-slate-900">{selectedBill.customerName}</p>
                                    <p className="text-slate-500 text-sm mt-1">{new Date(selectedBill.date).toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
                                </div>
                            </div>

                            {/* Line Items */}
                            <table className="w-full text-left">
                                <thead className="border-b-2 border-slate-950">
                                    <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        <th className="py-4">Description</th>
                                        <th className="py-4 text-center">Qty</th>
                                        <th className="py-4 text-right">Unit Price</th>
                                        <th className="py-4 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedBill.items.map(item => (
                                        <tr key={item.id} className="text-sm">
                                            <td className="py-4 font-bold text-slate-900">{item.name}</td>
                                            <td className="py-4 text-center">{item.quantity}</td>
                                            <td className="py-4 text-right">₹{item.sellingPrice.toLocaleString()}</td>
                                            <td className="py-4 text-right font-bold text-slate-950">₹{item.total.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Totals */}
                            <div className="flex justify-end pt-6">
                                <div className="w-64 space-y-3">
                                    <div className="flex justify-between text-slate-500 text-sm">
                                        <span>Subtotal</span>
                                        <span>₹{selectedBill.totalAmount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-500 text-sm">
                                        <span>Tax (0%)</span>
                                        <span>₹0</span>
                                    </div>
                                    <div className="flex justify-between pt-3 border-t-2 border-slate-950 font-bold text-slate-950 text-xl">
                                        <span>Total</span>
                                        <span>₹{selectedBill.totalAmount.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-12 border-t border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Thank you for your business</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 flex justify-end gap-3 border-t border-slate-200">
                            <button 
                                onClick={() => setIsInvoiceViewOpen(false)}
                                className="px-6 py-2 text-slate-600 font-bold uppercase tracking-widest text-[10px]"
                            >
                                Close
                            </button>
                            <button 
                                onClick={printInvoice}
                                className="px-8 py-2 bg-slate-950 text-white font-bold rounded-xl hover:bg-slate-900 transition-all uppercase tracking-widest text-[10px] shadow-lg shadow-slate-950/20 flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                                Print Invoice
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerBillsModule;


import React, { useState } from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';
import Button from '../../ui/Button';
import CustomerSelectionModal from './CustomerSelectionModal';

const CheckoutPanel: React.FC = () => {
    const {
        subtotal,
        taxTotal,
        discountTotal,
        grandTotal,
        customer,
        setCustomer,
        setIsPaymentModalOpen,
        cart,
        holdSale,
        applyGlobalDiscount
    } = usePOS();

    const [isDiscountOpen, setIsDiscountOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

    const handleHold = () => {
        if (cart.length === 0) return;
        // Generate a simple reference for the held sale
        const reference = `HOLD-${Date.now().toString().slice(-6)}`;
        holdSale(reference);
    };

    const handleProforma = () => {
        if (cart.length === 0) return;
        // In a real app, this would generate a PDF or print a quote
        alert("Proforma Invoice generated (Simulated)");
    };

    return (
        <div className="flex flex-col h-full">
            {/* Customer Area */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/80">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Customer Information</h3>
                {customer ? (
                    <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-indigo-100 shadow-sm relative group overflow-hidden">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                            {customer.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800 truncate">{customer.name}</div>
                            <div className="text-[10px] text-slate-500 font-medium">{customer.phone}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded leading-none">
                                {customer.tier}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 mt-1">{customer.points} PTS</div>
                        </div>
                        <button
                            onClick={() => setCustomer(null)}
                            className="absolute inset-y-0 right-0 w-8 bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all translate-x-full group-hover:translate-x-0"
                        >
                            {ICONS.x}
                        </button>
                    </div>
                ) : (
                    <button
                        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 border-dashed rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-white transition-all group"
                        onClick={() => setIsCustomerModalOpen(true)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center group-hover:border-indigo-100 group-hover:bg-indigo-50 transition-colors">
                                {ICONS.plus}
                            </div>
                            <span className="text-sm font-bold">Select Customer (F6)</span>
                        </div>
                        {ICONS.chevronRight}
                    </button>
                )}

                {/* Credit Balance Alert (Blueprint example) */}
                {customer && customer.balance > 0 && (
                    <div className="mt-3 p-2 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2 text-amber-700 text-[10px] font-bold animate-pulse">
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                        <span>Outstanding Balance: {CURRENCY} {customer.balance}</span>
                    </div>
                )}
            </div>

            {/* Totals Section */}
            <div className="flex-1 p-6 space-y-4">
                <div className="flex justify-between items-center text-slate-500">
                    <span className="text-sm font-medium">Subtotal</span>
                    <span className="text-sm font-mono font-bold leading-none">{CURRENCY} {subtotal.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center">
                    <button
                        className="text-sm font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1 group transition-colors"
                        onClick={() => setIsDiscountOpen(!isDiscountOpen)}
                    >
                        Discount
                        <span className="text-[10px] text-slate-400 group-hover:text-indigo-400 opacity-50">{ICONS.chevronDown}</span>
                    </button>
                    <span className="text-sm font-mono font-bold text-rose-500 leading-none">-{CURRENCY} {discountTotal.toLocaleString()}</span>
                </div>

                {isDiscountOpen && (
                    <div className="bg-slate-100 p-3 rounded-lg animate-in fade-in slide-in-from-top-2">
                        <label className="text-[10px] font-bold uppercase text-slate-400 mb-2 block">Global Discount %</label>
                        <div className="flex gap-2">
                            {[0, 5, 10, 15, 20].map(pct => (
                                <button
                                    key={pct}
                                    onClick={() => applyGlobalDiscount(pct)}
                                    className="flex-1 py-1 bg-white border border-slate-200 rounded text-xs font-bold hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                                >
                                    {pct}%
                                </button>
                            ))}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                placeholder="Custom %"
                                className="w-full text-xs p-2 rounded border border-slate-200 outline-none focus:border-indigo-500"
                                onChange={(e) => applyGlobalDiscount(Number(e.target.value))}
                                min="0"
                                max="100"
                            />
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center text-slate-500">
                    <span className="text-sm font-medium">Tax Collected</span>
                    <span className="text-sm font-mono font-bold leading-none">{CURRENCY} {taxTotal.toLocaleString()}</span>
                </div>

                <div className="my-6 h-px bg-slate-100"></div>

                <div className="flex justify-between items-start">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Net Payable</span>
                        <div className="text-4xl font-black text-slate-900 tracking-tighter mt-1 font-mono">
                            {grandTotal.toLocaleString()}
                        </div>
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-indigo-100 bg-indigo-600 px-2 py-1 rounded shadow-lg shadow-indigo-100">
                        {CURRENCY}
                    </div>
                </div>
            </div>

            {/* Actions / Payment Area */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Button
                        variant="secondary"
                        size="default"
                        className="w-full bg-white hover:bg-slate-50 text-slate-600 border-slate-200 font-bold"
                        onClick={handleProforma}
                    >
                        PROFORMA
                    </Button>
                    <Button
                        variant="secondary"
                        size="default"
                        className="w-full bg-white hover:bg-slate-50 text-amber-600 border-amber-100 font-bold"
                        onClick={handleHold}
                    >
                        HOLD (F2)
                    </Button>
                </div>

                <button
                    disabled={cart.length === 0}
                    onClick={() => setIsPaymentModalOpen(true)}
                    className={`w-full py-5 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-2xl transition-all active:scale-[0.98] ${cart.length === 0
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed grayscale'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-200 hover:shadow-emerald-300'
                        }`}
                >
                    <span className="text-xs font-black uppercase tracking-widest opacity-80">Finalize Checkout</span>
                    <span className="text-2xl font-black tracking-tight flex items-center gap-2">
                        PAYMENT (F8)
                    </span>
                </button>
            </div>

            <CustomerSelectionModal
                isOpen={isCustomerModalOpen}
                onClose={() => setIsCustomerModalOpen(false)}
            />
        </div>
    );
};

export default CheckoutPanel;

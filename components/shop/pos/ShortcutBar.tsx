
import React from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS } from '../../../constants';

const ShortcutBar: React.FC = () => {
    const {
        clearCart,
        holdSale,
        setIsPaymentModalOpen,
        setIsHeldSalesModalOpen,
        setIsCustomerModalOpen,
        balanceDue,
        completeSale,
        isPaymentModalOpen,
        isHeldSalesModalOpen,
        isCustomerModalOpen
    } = usePOS();

    const shortcuts = [
        { key: 'F1', label: 'New', action: clearCart },
        { key: 'F2', label: 'Hold', action: () => holdSale(`Hold-${new Date().toLocaleTimeString()}`) },
        { key: 'F3', label: 'Recall', action: () => setIsHeldSalesModalOpen(!isHeldSalesModalOpen) },
        {
            key: 'F4', label: 'Search', action: () => {
                const searchInput = document.getElementById('pos-product-search');
                if (searchInput) searchInput.focus();
            }
        },
        { key: 'F6', label: 'Customer', action: () => setIsCustomerModalOpen(!isCustomerModalOpen) },
        { key: 'F9', label: 'History', action: () => usePOS().setIsSalesHistoryModalOpen(!usePOS().isSalesHistoryModalOpen) },
        { key: 'F8', label: 'Payment', action: () => setIsPaymentModalOpen(!isPaymentModalOpen) },
        {
            key: 'F12', label: 'Finish', action: () => {
                if (balanceDue <= 0) {
                    completeSale();
                } else {
                    setIsPaymentModalOpen(true);
                }
            }
        },
    ];

    return (
        <div className="h-10 bg-slate-800 flex items-center px-4 gap-1 z-30 overflow-x-auto scrollbar-none">
            {shortcuts.map((sc) => (
                <button
                    key={sc.key}
                    onClick={sc.action}
                    className="flex items-center gap-2 px-3 py-1 bg-slate-700/50 hover:bg-slate-700 text-slate-100 rounded text-[10px] font-bold border border-slate-600/50 hover:border-slate-500 transition-all whitespace-nowrap active:bg-indigo-600"
                >
                    <span className="text-indigo-400 font-black px-1.5 py-0.5 bg-slate-900 rounded">{sc.key}</span>
                    <span className="uppercase tracking-widest">{sc.label}</span>
                </button>
            ))}

            <div className="ml-auto hidden md:flex items-center gap-4 text-[10px] font-bold text-slate-500 mr-4">
                <span className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                    CAPS LOCK
                </span>
                <span className="flex items-center gap-1.5 uppercase">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    Sync Active
                </span>
            </div>
        </div>
    );
};

export default ShortcutBar;

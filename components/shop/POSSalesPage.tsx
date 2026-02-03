
import React, { useEffect, useRef } from 'react';
import { POSProvider, usePOS } from '../../context/POSContext';
import { LoyaltyProvider } from '../../context/LoyaltyContext';
import POSHeader from './pos/POSHeader';
import ProductSearch from './pos/ProductSearch';
import CartGrid from './pos/CartGrid';
import CheckoutPanel from './pos/CheckoutPanel';
import ShortcutBar from './pos/ShortcutBar';
import PaymentModal from './pos/PaymentModal';
import HeldSalesModal from './pos/HeldSalesModal';
import CustomerSelectionModal from './pos/CustomerSelectionModal';

const POSSalesContent: React.FC = () => {
    const {
        isPaymentModalOpen,
        setIsPaymentModalOpen,
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        isCustomerModalOpen,
        setIsCustomerModalOpen,
        holdSale,
        clearCart,
        completeSale,
        balanceDue
    } = usePOS();
    const mainRef = useRef<HTMLDivElement>(null);

    // Global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Prevent default for F-keys and others we use
            if (e.key.startsWith('F')) {
                e.preventDefault();
            }

            switch (e.key) {
                case 'F1': clearCart(); break;
                case 'F2': holdSale(`Hold-${new Date().toLocaleTimeString()}`); break;
                case 'F3': setIsHeldSalesModalOpen(!isHeldSalesModalOpen); break;
                case 'F4': // Search focus is handled by ProductSearch autoFocus or ref
                    const searchInput = document.getElementById('pos-product-search');
                    if (searchInput) searchInput.focus();
                    break;
                case 'F6': setIsCustomerModalOpen(!isCustomerModalOpen); break;
                case 'F8': setIsPaymentModalOpen(!isPaymentModalOpen); break;
                case 'F12':
                    if (balanceDue <= 0) {
                        completeSale();
                    } else {
                        setIsPaymentModalOpen(true);
                    }
                    break;
                // Add more as needed
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [clearCart, holdSale, setIsPaymentModalOpen, setIsHeldSalesModalOpen, setIsCustomerModalOpen, completeSale, balanceDue]);

    return (
        <div className="flex flex-col h-full bg-slate-100 -m-4 md:-m-8 overflow-hidden font-sans select-none" ref={mainRef}>
            {/* Top Status Bar */}
            <POSHeader />

            <div className="flex flex-1 min-h-0">
                {/* Left Panel: Search & Products */}
                <div className="w-1/3 lg:w-1/4 flex flex-col bg-white border-r border-slate-200">
                    <ProductSearch />
                </div>

                {/* Center Panel: Cart / Bill Grid */}
                <div className="flex-1 flex flex-col bg-slate-50 relative">
                    <CartGrid />
                </div>

                {/* Right Panel: Totals & Payments */}
                <div className="w-80 lg:w-96 flex flex-col bg-white border-l border-slate-200 shadow-xl z-10">
                    <CheckoutPanel />
                </div>
            </div>

            {/* Bottom Bar: Action Shortcuts */}
            <ShortcutBar />

            {/* Modals */}
            <PaymentModal />
            <HeldSalesModal />
            <CustomerSelectionModal
                isOpen={usePOS().isCustomerModalOpen}
                onClose={() => usePOS().setIsCustomerModalOpen(false)}
            />
        </div>
    );
};

const POSSalesPage: React.FC = () => {
    return (
        <POSProvider>
            <POSSalesContent />
        </POSProvider>
    );
};

export default POSSalesPage;

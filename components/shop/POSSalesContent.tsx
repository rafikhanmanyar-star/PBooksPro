import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import POSHeader from './pos/POSHeader';
import ProductSearch from './pos/ProductSearch';
import CartGrid from './pos/CartGrid';
import CheckoutPanel from './pos/CheckoutPanel';
import ShortcutBar from './pos/ShortcutBar';
import PaymentModal from './pos/PaymentModal';
import HeldSalesModal from './pos/HeldSalesModal';
import CustomerSelectionModal from './pos/CustomerSelectionModal';
import SalesHistoryModal from './pos/SalesHistoryModal';
import { useAppContext } from '../../context/AppContext';

const POSSalesContent: React.FC = () => {
    const { state } = useAppContext();
    const {
        isPaymentModalOpen,
        setIsPaymentModalOpen,
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        isCustomerModalOpen,
        setIsCustomerModalOpen,
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        holdSale,
        clearCart,
        completeSale,
        balanceDue
    } = usePOS();
    const mainRef = useRef<HTMLDivElement>(null);

    const isActive = state.currentPage === 'posSales';

    const [isFullScreen, setIsFullScreen] = useState(false);

    const setFullScreenEnabled = useCallback((enabled: boolean) => {
        setIsFullScreen(enabled);
        window.dispatchEvent(new CustomEvent('pos:fullscreen', { detail: { enabled } }));
    }, []);

    const toggleFullScreen = useCallback(() => {
        setFullScreenEnabled(!isFullScreen);
    }, [isFullScreen, setFullScreenEnabled]);

    // If we leave the POS page while full screen is enabled, always restore normal layout
    useEffect(() => {
        if (!isActive && isFullScreen) {
            setFullScreenEnabled(false);
        }
    }, [isActive, isFullScreen, setFullScreenEnabled]);

    // Global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isActive) return;

            // Prevent default for F-keys and others we use
            if (e.key.startsWith('F')) {
                e.preventDefault();
            }

            switch (e.key) {
                case 'F1': clearCart(); break;
                case 'F2': holdSale(`Hold-${new Date().toLocaleTimeString()}`); break;
                case 'F3': setIsHeldSalesModalOpen(!isHeldSalesModalOpen); break;
                case 'F4': { // Search focus is handled by ProductSearch autoFocus or ref
                    const searchInput = document.getElementById('pos-product-search');
                    if (searchInput) searchInput.focus();
                    break;
                }
                case 'F6': setIsCustomerModalOpen(!isCustomerModalOpen); break;
                case 'F9': setIsSalesHistoryModalOpen(!isSalesHistoryModalOpen); break;
                case 'F7': toggleFullScreen(); break;
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
    }, [
        isActive,
        clearCart,
        holdSale,
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        isCustomerModalOpen,
        setIsCustomerModalOpen,
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        isPaymentModalOpen,
        setIsPaymentModalOpen,
        balanceDue,
        completeSale,
        toggleFullScreen
    ]);

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
            <ShortcutBar isFullScreen={isFullScreen} onToggleFullScreen={toggleFullScreen} />

            {/* Modals */}
            <PaymentModal />
            <HeldSalesModal />
            <CustomerSelectionModal
                isOpen={isCustomerModalOpen}
                onClose={() => setIsCustomerModalOpen(false)}
            />
            <SalesHistoryModal />
        </div>
    );
};

export default POSSalesContent;

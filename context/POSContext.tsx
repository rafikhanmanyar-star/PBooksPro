import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    POSCartItem,
    POSProduct,
    POSCustomer,
    POSHeldSale,
    POSPayment,
    POSPaymentMethod,
    POSShift,
    POSProductVariant
} from '../types/pos';
import { shopApi } from '../services/api/shopApi';
import { ContactsApiRepository } from '../services/api/repositories/contactsApi';
import { CURRENCY } from '../constants';
import { BarcodeScanner, createBarcodeScanner } from '../services/barcode/barcodeScanner';
import { ThermalPrinter, createThermalPrinter, ReceiptData } from '../services/printer/thermalPrinter';
import { useAppContext } from './AppContext';



interface POSContextType {
    cart: POSCartItem[];
    addToCart: (product: POSProduct, variant?: POSProductVariant, quantity?: number) => void;
    removeFromCart: (cartItemId: string) => void;
    updateCartItem: (cartItemId: string, updates: Partial<POSCartItem>) => void;
    clearCart: () => void;
    applyGlobalDiscount: (percentage: number) => void;

    customer: POSCustomer | null;
    setCustomer: (customer: POSCustomer | null) => void;

    payments: POSPayment[];
    addPayment: (method: POSPaymentMethod, amount: number, reference?: string) => void;
    removePayment: (paymentId: string) => void;

    heldSales: POSHeldSale[];
    holdSale: (reference: string) => void;
    recallSale: (heldSaleId: string) => void;

    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    grandTotal: number;
    totalPaid: number;
    balanceDue: number;
    changeDue: number;

    isPaymentModalOpen: boolean;
    setIsPaymentModalOpen: (isOpen: boolean) => void;

    isHeldSalesModalOpen: boolean;
    setIsHeldSalesModalOpen: (isOpen: boolean) => void;

    isCustomerModalOpen: boolean;
    setIsCustomerModalOpen: (isOpen: boolean) => void;

    searchQuery: string;
    setSearchQuery: (query: string) => void;

    isSalesHistoryModalOpen: boolean;
    setIsSalesHistoryModalOpen: (isOpen: boolean) => void;

    completeSale: () => Promise<void>;
    printReceipt: (saleData?: any) => Promise<void>;
    lastCompletedSale: any | null;
    setLastCompletedSale: (sale: any | null) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { state } = useAppContext(); // Access app state for print settings
    const [cart, setCart] = useState<POSCartItem[]>([]);
    const [customer, setCustomer] = useState<POSCustomer | null>(null);
    const [payments, setPayments] = useState<POSPayment[]>([]);
    const [heldSales, setHeldSales] = useState<POSHeldSale[]>([]);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isHeldSalesModalOpen, setIsHeldSalesModalOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [isSalesHistoryModalOpen, setIsSalesHistoryModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [lastCompletedSale, setLastCompletedSale] = useState<any | null>(null);

    // Barcode scanner and printer instances
    const barcodeScannerRef = useRef<BarcodeScanner | null>(null);
    const thermalPrinterRef = useRef<ThermalPrinter | null>(null);


    // Totals Calculation
    const totals = useMemo(() => {
        const subtotal = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        const discountTotal = cart.reduce((sum, item) => sum + item.discountAmount, 0);
        const taxTotal = cart.reduce((sum, item) => sum + item.taxAmount, 0);
        const grandTotal = subtotal - discountTotal + taxTotal;
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const balanceDue = Math.max(0, grandTotal - totalPaid);
        const changeDue = Math.max(0, totalPaid - grandTotal); // Refund/change amount

        return { subtotal, taxTotal, discountTotal, grandTotal, totalPaid, balanceDue, changeDue };
    }, [cart, payments]);

    // Initialize barcode scanner and thermal printer
    useEffect(() => {
        // Initialize thermal printer with print settings
        if (!thermalPrinterRef.current) {
            thermalPrinterRef.current = createThermalPrinter({
                paperWidth: 80, // 80mm thermal paper
                autoConnect: true,
                printSettings: state.printSettings // Pass print settings for configurable receipts
            });
        }

        // Initialize barcode scanner
        if (!barcodeScannerRef.current) {
            barcodeScannerRef.current = createBarcodeScanner((barcode) => {
                console.log('Barcode scanned:', barcode);
                setSearchQuery(barcode);
            });
            barcodeScannerRef.current.start();
        }

        // Cleanup on unmount
        return () => {
            if (barcodeScannerRef.current) {
                barcodeScannerRef.current.stop();
            }
        };
    }, [state.printSettings]); // Re-initialize when print settings change

    // Print receipt function
    const printReceipt = useCallback(async (saleData?: any) => {
        try {
            const dataToUse = saleData || lastCompletedSale;
            if (!dataToUse) {
                alert('No sale data available to print');
                return;
            }

            const receiptData: ReceiptData = {
                storeName: 'PBooks Pro Store',
                storeAddress: 'Karachi, Pakistan',
                storePhone: '+92-XXX-XXXXXXX',
                taxId: 'TAX-ID-XXXXX',
                receiptNumber: dataToUse.saleNumber,
                date: new Date(dataToUse.createdAt || Date.now()).toLocaleDateString(),
                time: new Date(dataToUse.createdAt || Date.now()).toLocaleTimeString(),
                cashier: dataToUse.userId || 'Cashier',
                customer: customer?.name,
                items: dataToUse.items.map((item: any) => ({
                    name: item.name || 'Unknown Item',
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    discount: item.discountAmount || 0,
                    total: item.subtotal
                })),
                subtotal: dataToUse.subtotal,
                discount: dataToUse.discountTotal,
                tax: dataToUse.taxTotal,
                total: dataToUse.grandTotal,
                payments: dataToUse.paymentDetails.map((p: any) => ({
                    method: p.method,
                    amount: p.amount
                })),
                change: dataToUse.changeDue > 0 ? dataToUse.changeDue : undefined,
                footer: 'Thank you for shopping with us!'
            };

            if (thermalPrinterRef.current) {
                await thermalPrinterRef.current.printReceipt(receiptData);
                console.log('Receipt printed successfully');
            } else {
                throw new Error('Printer not initialized');
            }
        } catch (error: any) {
            console.error('Failed to print receipt:', error);
            alert('Failed to print receipt: ' + (error.message || 'Unknown error'));
        }
    }, [lastCompletedSale, customer]);


    const addToCart = useCallback((product: POSProduct, variant?: POSProductVariant, quantity: number = 1) => {
        setCart(prev => {
            const existingItemIndex = prev.findIndex(item =>
                item.productId === product.id && item.variantId === variant?.id
            );

            if (existingItemIndex > -1) {
                const newCart = [...prev];
                const item = newCart[existingItemIndex];
                const newQty = item.quantity + quantity;

                // Recalculate tax for the whole line
                const basePrice = (item.unitPrice * newQty);
                const tax = basePrice * (item.taxRate / 100);

                newCart[existingItemIndex] = {
                    ...item,
                    quantity: newQty,
                    taxAmount: tax
                };
                return newCart;
            }

            const unitPrice = product.price + (variant?.priceAdjustment || 0);
            const tax = (unitPrice * quantity) * (product.taxRate / 100);

            const newItem: POSCartItem = {
                id: crypto.randomUUID(),
                productId: product.id,
                variantId: variant?.id,
                name: variant ? `${product.name} (${variant.name})` : product.name,
                sku: variant?.sku || product.sku,
                quantity: quantity,
                unitPrice: unitPrice,
                discountAmount: 0,
                discountPercentage: 0,
                taxAmount: tax,
                taxRate: product.taxRate,
            };
            return [...prev, newItem];
        });
        setSearchQuery(''); // Reset search after adding
    }, []);

    const removeFromCart = useCallback((cartItemId: string) => {
        setCart(prev => prev.filter(item => item.id !== cartItemId));
    }, []);

    const updateCartItem = useCallback((cartItemId: string, updates: Partial<POSCartItem>) => {
        setCart(prev => prev.map(item => {
            if (item.id === cartItemId) {
                const updatedItem = { ...item, ...updates };
                // Recalculate tax/discount if quantity or price changed
                if ('quantity' in updates || 'unitPrice' in updates || 'discountPercentage' in updates) {
                    const price = updatedItem.unitPrice;
                    const qty = updatedItem.quantity;
                    const disc = updatedItem.isFree ? price * qty : (price * qty * (updatedItem.discountPercentage / 100));
                    const taxableAmount = (price * qty) - disc;
                    updatedItem.discountAmount = disc;
                    updatedItem.taxAmount = taxableAmount * (updatedItem.taxRate / 100);
                }
                return updatedItem;
            }
            return item;
        }));
    }, []);

    const clearCart = useCallback(() => {
        setCart([]);
        setPayments([]);
        setCustomer(null);
    }, []);

    const addPayment = useCallback((method: POSPaymentMethod, amount: number, reference?: string) => {
        setPayments(prev => [...prev, { id: crypto.randomUUID(), method, amount, reference }]);
    }, []);

    const removePayment = useCallback((paymentId: string) => {
        setPayments(prev => prev.filter(p => p.id !== paymentId));
    }, []);

    const holdSale = useCallback((reference: string) => {
        if (cart.length === 0) return;

        const newHeldSale: POSHeldSale = {
            id: crypto.randomUUID(),
            reference,
            cart: [...cart],
            customerId: customer?.id,
            total: totals.grandTotal,
            heldAt: new Date().toISOString(),
            cashierId: 'default-user' // TODO: Get from Auth
        };

        setHeldSales(prev => [...prev, newHeldSale]);
        clearCart();
    }, [cart, customer, totals.grandTotal, clearCart]);

    const recallSale = useCallback(async (heldSaleId: string) => {
        const heldSale = heldSales.find(s => s.id === heldSaleId);
        if (heldSale) {
            setCart(heldSale.cart);

            if (heldSale.customerId) {
                try {
                    const contactsApi = new ContactsApiRepository();
                    const contact = await contactsApi.findById(heldSale.customerId);
                    if (contact) {
                        // Map contact to POSCustomer
                        const posCustomer: POSCustomer = {
                            id: contact.id,
                            name: contact.name,
                            phone: contact.contactNo || 'N/A',
                            points: 0, // In a real app, fetch from loyalty
                            creditLimit: 0,
                            balance: 0,
                            tier: 'Standard'
                        };
                        setCustomer(posCustomer);
                    }
                } catch (error) {
                    console.error('Failed to restore customer:', error);
                }
            }

            setHeldSales(prev => prev.filter(s => s.id !== heldSaleId));
        }
    }, [heldSales]);

    const completeSale = useCallback(async () => {
        try {
            const saleNumber = `SALE-${Date.now()}`;
            const saleData = {
                branchId: 'st-1', // Default Karachi Flagship for now
                terminalId: 't-1',
                userId: 'default-user',
                customerId: customer?.id,
                loyaltyMemberId: null, // TODO: Link loyalty member
                saleNumber,
                subtotal: totals.subtotal,
                taxTotal: totals.taxTotal,
                discountTotal: totals.discountTotal,
                grandTotal: totals.grandTotal,
                totalPaid: totals.totalPaid,
                changeDue: totals.changeDue,
                paymentMethod: payments.length > 1 ? 'Multiple' : payments[0]?.method || 'Cash',
                paymentDetails: payments,
                items: cart.map(item => ({
                    productId: item.productId,
                    name: item.name, // Include name for receipt printing
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    taxAmount: item.taxAmount,
                    discountAmount: item.discountAmount,
                    subtotal: (item.unitPrice * item.quantity) - item.discountAmount + item.taxAmount
                })),
                createdAt: new Date().toISOString()
            };

            await shopApi.createSale(saleData);

            // Save sale data for receipt printing
            setLastCompletedSale(saleData);

            clearCart();
            // Keep modal open so user can print receipt
            // setIsPaymentModalOpen(false);

            // Show success message with change due if applicable
            if (totals.changeDue > 0) {
                alert(`Sale completed!\n\nChange to return: ${CURRENCY} ${totals.changeDue.toLocaleString()}\n\nYou can now print the receipt.`);
            } else {
                alert('Sale completed successfully!\n\nYou can now print the receipt.');
            }
        } catch (error: any) {
            console.error('Failed to complete sale:', error);
            alert('Error completing sale: ' + (error.message || 'Unknown error'));
        }
    }, [cart, customer, payments, totals, clearCart]);

    const applyGlobalDiscount = useCallback((percentage: number) => {
        setCart(prev => prev.map(item => {
            const price = item.unitPrice;
            const qty = item.quantity;
            const disc = item.isFree ? price * qty : (price * qty * (percentage / 100));
            // Ensure tax is calculated on the discounted amount
            const taxableAmount = Math.max(0, (price * qty) - disc);

            return {
                ...item,
                discountPercentage: percentage,
                discountAmount: disc,
                taxAmount: taxableAmount * (item.taxRate / 100)
            };
        }));
    }, []);

    const value = {
        cart,
        addToCart,
        removeFromCart,
        updateCartItem,
        clearCart,
        applyGlobalDiscount,
        customer,
        setCustomer,
        payments,
        addPayment,
        removePayment,
        heldSales,
        holdSale,
        recallSale,
        ...totals,
        isPaymentModalOpen,
        setIsPaymentModalOpen,
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        isCustomerModalOpen,
        setIsCustomerModalOpen,
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        searchQuery,
        setSearchQuery,
        completeSale,
        printReceipt,
        lastCompletedSale,
        setLastCompletedSale
    };

    return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
};

export const usePOS = () => {
    const context = useContext(POSContext);
    if (!context) throw new Error('usePOS must be used within a POSProvider');
    return context;
};

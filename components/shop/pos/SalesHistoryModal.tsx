
import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import { usePOS } from '../../../context/POSContext';
import { shopApi } from '../../../services/api/shopApi';
import { POSSale } from '../../../types/pos';
import { ICONS, CURRENCY } from '../../../constants';

const SalesHistoryModal: React.FC = () => {
    const {
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        printReceipt
    } = usePOS();

    const [sales, setSales] = useState<POSSale[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSale, setSelectedSale] = useState<POSSale | null>(null);

    useEffect(() => {
        if (isSalesHistoryModalOpen) {
            fetchSales();
        }
    }, [isSalesHistoryModalOpen]);

    const fetchSales = async () => {
        setIsLoading(true);
        try {
            const response = await shopApi.getSales();
            // ApiClient returns data directly as an array
            if (response && Array.isArray(response)) {
                // Sort by date descending
                const sortedSales = [...response].sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                setSales(sortedSales);
            }
        } catch (error) {
            console.error('Failed to fetch sales history:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredSales = sales.filter(sale =>
        sale.saleNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sale.customerName && sale.customerName.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handlePrint = (sale: POSSale) => {
        printReceipt(sale);
    };

    if (!isSalesHistoryModalOpen) return null;

    return (
        <Modal
            isOpen={isSalesHistoryModalOpen}
            onClose={() => setIsSalesHistoryModalOpen(false)}
            title="Sales History & Reprint"
            size="xl"
        >
            <div className="flex flex-col h-[600px]">
                {/* Search Bar */}
                <div className="mb-6">
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                            {ICONS.search}
                        </span>
                        <input
                            type="text"
                            placeholder="Search by Receipt # or Customer Name..."
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-500 focus:ring-0 transition-all font-bold"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex-1 flex gap-6 overflow-hidden">
                    {/* Sales List */}
                    <div className="w-1/2 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="p-3 bg-slate-50 border-bottom border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-widest flex justify-between">
                            <span>Recent Sales</span>
                            <span>{filteredSales.length} found</span>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {isLoading ? (
                                <div className="p-8 text-center text-slate-400 italic">Loading sales...</div>
                            ) : filteredSales.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 italic">No sales found</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {filteredSales.map(sale => (
                                        <button
                                            key={sale.id || sale.saleNumber}
                                            onClick={() => setSelectedSale(sale)}
                                            className={`w-full p-4 text-left hover:bg-slate-50 transition-colors flex justify-between items-center group ${selectedSale?.saleNumber === sale.saleNumber ? 'bg-indigo-50' : ''}`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-slate-800">{sale.saleNumber}</span>
                                                <span className="text-[10px] text-slate-400 font-bold uppercase">
                                                    {new Date(sale.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-black text-indigo-600">{CURRENCY} {sale.grandTotal.toLocaleString()}</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase">{sale.paymentMethod}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sale Detail & Reprint */}
                    <div className="flex-1 flex flex-col bg-slate-900 rounded-2xl p-6 text-white shadow-xl overflow-hidden">
                        {selectedSale ? (
                            <div className="flex flex-col h-full">
                                <div className="mb-6 border-b border-slate-700 pb-4">
                                    <h3 className="text-xl font-black mb-1">{selectedSale.saleNumber}</h3>
                                    <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">
                                        {new Date(selectedSale.createdAt).toLocaleString()}
                                    </p>
                                </div>

                                <div className="flex-1 overflow-y-auto mb-6 pr-2 space-y-4">
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase text-slate-500 mb-2">Items</h4>
                                        <div className="space-y-2">
                                            {selectedSale.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <span className="text-slate-300">{item.name} x {item.quantity}</span>
                                                    <span className="font-mono">{item.subtotal.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-800 space-y-2">
                                        <div className="flex justify-between text-sm text-slate-400">
                                            <span>Subtotal</span>
                                            <span className="font-mono">{selectedSale.subtotal.toLocaleString()}</span>
                                        </div>
                                        {selectedSale.discountTotal > 0 && (
                                            <div className="flex justify-between text-sm text-rose-400">
                                                <span>Discount</span>
                                                <span className="font-mono">-{selectedSale.discountTotal.toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-lg font-black pt-2">
                                            <span>TOTAL</span>
                                            <span className="text-emerald-400 font-mono">{CURRENCY} {selectedSale.grandTotal.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handlePrint(selectedSale)}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    REPRINT RECEIPT
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center">
                                <div className="mb-4 text-slate-700">
                                    <svg className="w-16 h-16 mx-auto opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <p className="font-bold">Select a sale from the list<br />to view details and reprint</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default SalesHistoryModal;

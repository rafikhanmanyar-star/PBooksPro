
import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import { usePOS } from '../../../context/POSContext';
import { POSPaymentMethod } from '../../../types/pos';
import { ICONS, CURRENCY } from '../../../constants';

const PaymentModal: React.FC = () => {
    const {
        isPaymentModalOpen,
        setIsPaymentModalOpen,
        grandTotal,
        balanceDue,
        changeDue,
        addPayment,
        payments,
        removePayment,
        completeSale,
        printReceipt,
        lastCompletedSale,
        setLastCompletedSale
    } = usePOS();

    const [tenderAmount, setTenderAmount] = useState('0');
    const [selectedMethod, setSelectedMethod] = useState<POSPaymentMethod>(POSPaymentMethod.CASH);

    useEffect(() => {
        if (isPaymentModalOpen) {
            setTenderAmount(balanceDue.toString());
        }
    }, [isPaymentModalOpen, balanceDue]);

    const handleAddPayment = () => {
        const amount = parseFloat(tenderAmount);
        if (amount > 0) {
            addPayment(selectedMethod, amount);
            setTenderAmount('0');
        }
    };

    const handleQuickAmount = (amt: number) => {
        setTenderAmount(amt.toString());
    };

    if (!isPaymentModalOpen) return null;

    return (
        <Modal
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            title="Finalize Payment & Checkout"
            size="xl"
        >
            <div className="flex gap-6 min-h-[450px]">
                {/* Left Side: Method Selection & Tendering */}
                <div className="flex-1 space-y-6">
                    <div>
                        <h3 className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">Select Tender Type</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {Object.values(POSPaymentMethod).map(method => (
                                <button
                                    key={method}
                                    onClick={() => setSelectedMethod(method)}
                                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${selectedMethod === method
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-lg shadow-indigo-100'
                                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                                        }`}
                                >
                                    <span className="text-xs font-black uppercase tracking-wide">{method}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 block">Amount to Tender</label>
                        <div className="flex items-center gap-4">
                            <span className="text-3xl font-black text-slate-500">{CURRENCY}</span>
                            <input
                                type="text"
                                className="bg-transparent border-none text-5xl font-black text-white focus:ring-0 w-full p-0 font-mono tracking-tighter"
                                value={tenderAmount}
                                onChange={(e) => setTenderAmount(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="grid grid-cols-4 gap-2 mt-6">
                            {[100, 500, 1000, 5000].map(amt => (
                                <button
                                    key={amt}
                                    onClick={() => handleQuickAmount(amt)}
                                    className="py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold border border-slate-700 transition-colors"
                                >
                                    +{amt}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleAddPayment}
                        disabled={parseFloat(tenderAmount) <= 0}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white rounded-xl font-black text-lg shadow-lg shadow-indigo-200 transition-all uppercase tracking-widest"
                    >
                        Add {selectedMethod} Payment
                    </button>
                </div>

                {/* Right Side: Payment Summary */}
                <div className="w-80 bg-slate-50 rounded-2xl border border-slate-200 p-6 flex flex-col">
                    <div className="space-y-4 mb-auto">
                        <div className="flex justify-between items-center text-slate-500 text-sm font-bold uppercase tracking-widest">
                            <span>Grand Total</span>
                            <span className="text-slate-900 font-mono text-xl">{grandTotal.toLocaleString()}</span>
                        </div>

                        <div className="h-px bg-slate-200"></div>

                        <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase text-slate-400">Tenders Received</h4>
                            {payments.length === 0 ? (
                                <div className="text-sm italic text-slate-400 py-4 text-center">No payments added yet</div>
                            ) : (
                                <div className="space-y-2">
                                    {payments.map(p => (
                                        <div key={p.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm group">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-800 uppercase tracking-wide">{p.method}</span>
                                                <span className="text-[10px] text-slate-400 font-mono">{p.id.slice(0, 8)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-black font-mono">{p.amount.toLocaleString()}</span>
                                                <button
                                                    onClick={() => removePayment(p.id)}
                                                    className="text-slate-300 hover:text-rose-500 transition-colors"
                                                >
                                                    {ICONS.x}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-8 space-y-4">
                        <div className="bg-white p-4 rounded-xl border-2 border-slate-100 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase text-slate-400">Balance Due</span>
                                <span className={`text-2xl font-black font-mono ${balanceDue > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {balanceDue.toLocaleString()}
                                </span>
                            </div>

                            {changeDue > 0 && (
                                <>
                                    <div className="h-px bg-gradient-to-r from-transparent via-amber-200 to-transparent"></div>
                                    <div className="flex justify-between items-center bg-gradient-to-r from-amber-50 to-orange-50 -mx-4 -mb-4 px-4 py-4 rounded-b-xl border-t-2 border-amber-200">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Change to Return</span>
                                            <span className="text-[8px] uppercase text-amber-500 tracking-wider">Customer Refund</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                                            <span className="text-3xl font-black font-mono text-amber-600">
                                                {CURRENCY} {changeDue.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <button
                            disabled={balanceDue > 0 || lastCompletedSale !== null}
                            onClick={completeSale}
                            className={`w-full py-5 rounded-2xl font-black text-xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 ${balanceDue > 0 || lastCompletedSale !== null
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-200'
                                }`}
                        >
                            {ICONS.checkCircle}
                            {lastCompletedSale ? 'ORDER COMPLETED' : 'COMPLETE ORDER'}
                        </button>

                        {lastCompletedSale && (
                            <>
                                <button
                                    onClick={() => printReceipt()}
                                    className="w-full py-5 rounded-2xl font-black text-xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-200 animate-pulse"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    PRINT RECEIPT
                                </button>

                                <button
                                    onClick={() => {
                                        setIsPaymentModalOpen(false);
                                        setLastCompletedSale(null);
                                    }}
                                    className="w-full py-4 rounded-2xl font-bold text-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3 bg-slate-600 hover:bg-slate-500 text-white"
                                >
                                    {ICONS.x}
                                    CLOSE & NEW SALE
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default PaymentModal;

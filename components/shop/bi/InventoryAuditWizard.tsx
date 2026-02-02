
import React, { useState, useEffect } from 'react';
import { ICONS, CURRENCY } from '../../../constants';
import Modal from '../../ui/Modal';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import { shopApi } from '../../../services/api/shopApi';

interface InventoryAuditWizardProps {
    isOpen: boolean;
    onClose: () => void;
}

interface AuditItem {
    id: string;
    name: string;
    sku: string;
    systemQty: number;
    physicalQty: number;
    costPrice: number;
}

const InventoryAuditWizard: React.FC<InventoryAuditWizardProps> = ({ isOpen, onClose }) => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<AuditItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (isOpen && step === 1) {
            fetchInitialData();
        }
    }, [isOpen, step]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const inventory = await shopApi.getInventory();
            // Mocking costPrice if not present for demonstration, in real app it should come from API
            const auditItems = inventory.map(item => ({
                id: item.product_id || item.id,
                name: item.product_name || 'Unknown Product',
                sku: item.sku || 'N/A',
                systemQty: item.quantity || 0,
                physicalQty: item.quantity || 0,
                costPrice: item.cost_price || 100 // Default for demo
            }));
            setItems(auditItems);
        } catch (error) {
            console.error('Failed to fetch inventory:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleQtyChange = (id: string, value: string) => {
        const qty = parseFloat(value) || 0;
        setItems(prev => prev.map(item => item.id === id ? { ...item, physicalQty: qty } : item));
    };

    const discrepancies = items.filter(item => item.physicalQty !== item.systemQty);
    const totalLossGain = discrepancies.reduce((acc, item) => acc + (item.physicalQty - item.systemQty) * item.costPrice, 0);

    const handleFinalize = async () => {
        setLoading(true);
        try {
            for (const item of discrepancies) {
                await shopApi.adjustInventory({
                    productId: item.id,
                    quantity: Math.abs(item.physicalQty - item.systemQty),
                    type: item.physicalQty > item.systemQty ? 'IN' : 'OUT',
                    reason: 'AUDIT_ADJUSTMENT',
                    notes: `Audit Wizard Adjustment. System: ${item.systemQty}, Physical: ${item.physicalQty}`
                });
            }
            onClose();
        } catch (error) {
            console.error('Failed to adjust inventory:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Inventory Audit Intelligence Wizard"
            size="lg"
        >
            <div className="p-1">
                {/* Stepper Header */}
                <div className="flex items-center justify-between mb-8 px-4">
                    {[
                        { s: 1, l: 'Verify Stock', icon: ICONS.package },
                        { s: 2, l: 'Analyze Discrepancies', icon: ICONS.barChart },
                        { s: 3, l: 'Finalize & Sync', icon: ICONS.checkCircle },
                    ].map((st) => (
                        <div key={st.s} className="flex flex-col items-center gap-2 flex-1 relative">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10 ${step >= st.s ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border-slate-200 text-slate-400'
                                }`}>
                                {React.isValidElement(st.icon) ? React.cloneElement(st.icon as React.ReactElement<any>, { width: 18, height: 18 }) : st.icon}
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${step >= st.s ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {st.l}
                            </span>
                            {st.s < 3 && (
                                <div className={`absolute top-5 left-[60%] w-[80%] h-0.5 transition-all duration-500 ${step > st.s ? 'bg-indigo-600' : 'bg-slate-100'}`} />
                            )}
                        </div>
                    ))}
                </div>

                {step === 1 && (
                    <div className="space-y-6 animate-in slide-in-from-right duration-500">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div>
                                <h4 className="font-black text-slate-800 text-lg">Physical Stock Count</h4>
                                <p className="text-xs text-slate-500 font-medium">Enter actual quantities found on shelf</p>
                            </div>
                            <div className="relative w-72">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                    {ICONS.search}
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search products/SKU..."
                                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                            <table className="w-full border-separate border-spacing-y-3">
                                <thead className="sticky top-0 bg-white z-10">
                                    <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        <th className="px-4 pb-2">Product Details</th>
                                        <th className="px-4 pb-2">Category</th>
                                        <th className="px-4 pb-2">System Qty</th>
                                        <th className="px-4 pb-2 w-40">Physical Qty</th>
                                        <th className="px-4 pb-2">Variance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={5} className="py-20 text-center">
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
                                                    <p className="text-sm font-black text-slate-400 animate-pulse">Scanning Inventory...</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredItems.map(item => {
                                        const variance = item.physicalQty - item.systemQty;
                                        return (
                                            <tr key={item.id} className="bg-white border border-slate-100 shadow-sm rounded-xl transition-all hover:border-indigo-200 group">
                                                <td className="px-4 py-4 rounded-l-2xl border-y border-l">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">{item.name}</span>
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.sku}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 border-y">
                                                    <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase">General</span>
                                                </td>
                                                <td className="px-4 py-4 border-y">
                                                    <span className="font-black text-slate-800">{item.systemQty}</span>
                                                </td>
                                                <td className="px-4 py-4 border-y">
                                                    <input
                                                        type="number"
                                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
                                                        value={item.physicalQty}
                                                        onChange={(e) => handleQtyChange(item.id, e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-4 py-4 rounded-r-2xl border-y border-r">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${variance === 0 ? 'bg-slate-100 text-slate-400' :
                                                        variance > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                                                        }`}>
                                                        {variance === 0 ? 'No Change' : `${variance > 0 ? '+' : ''}${variance}`}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end pt-6 border-t border-slate-100">
                            <button
                                onClick={() => setStep(2)}
                                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-2"
                            >
                                Next: Analyze Discrepancies {ICONS.arrowRight}
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-8 animate-in slide-in-from-right duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card className="p-6 bg-rose-50 border-rose-100 border-2">
                                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Total Loss Items</p>
                                <p className="text-3xl font-black text-rose-900">{discrepancies.filter(d => d.physicalQty < d.systemQty).length}</p>
                            </Card>
                            <Card className="p-6 bg-emerald-50 border-emerald-100 border-2">
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Found Surplus</p>
                                <p className="text-3xl font-black text-emerald-900">{discrepancies.filter(d => d.physicalQty > d.systemQty).length}</p>
                            </Card>
                            <Card className="p-6 bg-slate-900 border-none shadow-xl">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Valuation Impact</p>
                                <p className={`text-3xl font-black ${totalLossGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {totalLossGain >= 0 ? '+' : ''}{CURRENCY} {Math.abs(totalLossGain).toLocaleString()}
                                </p>
                            </Card>
                        </div>

                        <div className="bg-white rounded-3xl border border-slate-100 p-8 space-y-6">
                            <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs flex items-center gap-2">
                                {ICONS.alertTriangle} Discrepancy Breakdown
                            </h4>
                            <div className="space-y-4">
                                {discrepancies.length === 0 ? (
                                    <div className="py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 scale-150">
                                            {ICONS.checkCircle}
                                        </div>
                                        <p className="font-black text-slate-800">Perfect Sync!</p>
                                        <p className="text-xs text-slate-500">No discrepancies found in the audited items.</p>
                                    </div>
                                ) : discrepancies.map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.physicalQty > item.systemQty ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                {item.physicalQty > item.systemQty ? ICONS.plus : ICONS.minus}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                    System: {item.systemQty} → Physical: {item.physicalQty}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-black text-sm ${item.physicalQty > item.systemQty ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {item.physicalQty > item.systemQty ? '+' : '-'}{CURRENCY} {Math.abs((item.physicalQty - item.systemQty) * item.costPrice).toLocaleString()}
                                            </p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impact</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-between pt-6 border-t border-slate-100">
                            <button
                                onClick={() => setStep(1)}
                                className="px-8 py-3 text-slate-600 font-black text-xs uppercase tracking-widest hover:text-slate-900 transition-all"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep(3)}
                                className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all"
                            >
                                Continue to Finalize
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-8 animate-in zoom-in duration-500 py-10 text-center">
                        <div className="w-32 h-32 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                            <div className="absolute inset-0 bg-indigo-200 rounded-full animate-ping opacity-20" />
                            {React.isValidElement(ICONS.shield) ? React.cloneElement(ICONS.shield as React.ReactElement<any>, { width: 64, height: 64 }) : ICONS.shield}
                        </div>
                        <div className="max-w-md mx-auto space-y-4">
                            <h3 className="text-2xl font-black text-slate-800">Ready to Synchronize?</h3>
                            <p className="text-sm text-slate-500 leading-relaxed font-medium">
                                You are about to adjust <span className="text-indigo-600 font-black">{discrepancies.length}</span> items in your live inventory.
                                This will generate audit trail entries and update your valuation reports.
                            </p>
                        </div>

                        <div className="max-w-xl mx-auto grid grid-cols-2 gap-4 mt-8">
                            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-left">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Audit Reference</p>
                                <p className="text-sm font-black text-slate-800">AUDIT-{new Date().getTime().toString().slice(-6)}</p>
                            </div>
                            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-left">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Authorized By</p>
                                <p className="text-sm font-black text-slate-800">Current Administrator</p>
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-4 mt-12">
                            <button
                                onClick={handleFinalize}
                                disabled={loading}
                                className={`w-full max-w-sm py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-3 ${loading ? 'bg-slate-400 cursor-not-allowed text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                            >
                                {loading ? (
                                    <>Synchronizing Data...</>
                                ) : (
                                    <>Approve & Sync {discrepancies.length} Adjustments</>
                                )}
                            </button>
                            <button
                                onClick={() => setStep(2)}
                                disabled={loading}
                                className="text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-all"
                            >
                                Cancel and Review
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default InventoryAuditWizard;

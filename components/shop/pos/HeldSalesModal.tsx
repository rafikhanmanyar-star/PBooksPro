
import React from 'react';
import Modal from '../../ui/Modal';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';

const HeldSalesModal: React.FC = () => {
    const {
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        heldSales,
        recallSale
    } = usePOS();

    if (!isHeldSalesModalOpen) return null;

    return (
        <Modal
            isOpen={isHeldSalesModalOpen}
            onClose={() => setIsHeldSalesModalOpen(false)}
            title="Recall Held Sale"
            size="lg"
        >
            <div className="space-y-4">
                {heldSales.length === 0 ? (
                    <div className="py-20 text-center text-slate-400">
                        <div className="text-4xl mb-4 flex justify-center">{ICONS.box}</div>
                        <p className="font-bold italic">No held sales found</p>
                        <p className="text-xs">Hold sales with (F2) to see them here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        {heldSales.map((sale) => (
                            <div
                                key={sale.id}
                                className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-300 hover:bg-slate-50 transition-all group"
                            >
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-black text-slate-800 uppercase tracking-tight text-sm">
                                            {sale.reference || 'Unnamed Sale'}
                                        </span>
                                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold">
                                            {new Date(sale.heldAt).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest flex items-center gap-2">
                                        <span>{sale.cart.length} Items</span>
                                        <span>•</span>
                                        <span className="text-indigo-600 font-bold">{CURRENCY} {sale.total.toLocaleString()}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        recallSale(sale.id);
                                        setIsHeldSalesModalOpen(false);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
                                >
                                    {ICONS.refresh}
                                    Recall
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default HeldSalesModal;

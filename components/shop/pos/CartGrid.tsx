
import React from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';

const CartGrid: React.FC = () => {
    const { cart, removeFromCart, updateCartItem } = usePOS();

    return (
        <div className="flex flex-col h-full">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr,100px,120px,120px,50px] gap-4 px-6 py-3 bg-slate-200/50 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                <div>Description</div>
                <div className="text-center">Rate</div>
                <div className="text-center">Qty</div>
                <div className="text-right">Total</div>
                <div></div>
            </div>

            {/* Scrollable Items Container */}
            <div className="flex-1 overflow-y-auto">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4 opacity-50">
                        <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center">
                            {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 48 })}
                        </div>
                        <div className="text-xl font-bold italic">Cart is Empty</div>
                        <p className="text-sm">Scan a product or use the search panel to begin.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {cart.map((item) => (
                            <div
                                key={item.id}
                                className="grid grid-cols-[1fr,100px,120px,120px,50px] gap-4 px-6 py-4 bg-white hover:bg-indigo-50/30 transition-colors group items-center"
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-slate-800 line-clamp-1">{item.name}</div>
                                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">{item.sku}</div>
                                    {item.notes && <div className="text-[10px] text-amber-600 font-medium italic mt-1 leading-tight">{item.notes}</div>}
                                </div>

                                <div className="text-center font-mono text-sm font-bold">
                                    {item.unitPrice.toLocaleString()}
                                </div>

                                <div className="flex items-center justify-center gap-1">
                                    <button
                                        onClick={() => updateCartItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                                        className="w-7 h-7 flex items-center justify-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90 transition-all"
                                    >
                                        {ICONS.minus}
                                    </button>
                                    <input
                                        type="text"
                                        className="w-10 text-center text-sm font-black bg-transparent border-none focus:ring-0 select-all font-mono"
                                        value={item.quantity}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val)) updateCartItem(item.id, { quantity: val });
                                        }}
                                    />
                                    <button
                                        onClick={() => updateCartItem(item.id, { quantity: item.quantity + 1 })}
                                        className="w-7 h-7 flex items-center justify-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90 transition-all"
                                    >
                                        {ICONS.plus}
                                    </button>
                                </div>

                                <div className="text-right flex flex-col items-end">
                                    <div className="text-sm font-black text-slate-900 font-mono">
                                        {(item.unitPrice * item.quantity).toLocaleString()}
                                    </div>
                                    {item.discountAmount > 0 && (
                                        <div className="text-[10px] font-bold text-rose-500">
                                            -{item.discountAmount.toLocaleString()}
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                    >
                                        {React.cloneElement(ICONS.trash as React.ReactElement, { size: 18 })}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Cart Indicators */}
            {cart.length > 0 && (
                <div className="px-6 py-2 bg-indigo-50 border-t border-indigo-100 flex items-center justify-between text-[10px] font-bold text-indigo-600">
                    <div className="flex items-center gap-4">
                        <span>Items: {cart.length}</span>
                        <span>Total Qty: {cart.reduce((sum, i) => sum + i.quantity, 0)}</span>
                    </div>
                    <div className="animate-pulse flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                        <span>Draft Bill auto-saved</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CartGrid;

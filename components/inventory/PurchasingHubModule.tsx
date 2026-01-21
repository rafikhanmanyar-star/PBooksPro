import React, { useState, useEffect, useMemo } from 'react';
import { InventoryPurchaseOrder, PurchaseOrderItem, InventoryItem, POLogisticsStatus, POFinancialStatus } from '../../types';
import { purchaseOrderApi } from '../../services/api/repositories/purchaseOrderApi';
import { inventoryApi } from '../../services/api/repositories/inventoryApi';
import { logger } from '../../services/logger';
import { GoogleGenAI } from '@google/genai';

const PurchasingHubModule: React.FC = () => {
    const [selectedPO, setSelectedPO] = useState<InventoryPurchaseOrder | null>(null);
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});

    const handleReceiveItems = async () => {
        if (!selectedPO) return;
        
        try {
            const updatedItems = selectedPO.items.map(item => ({
                ...item,
                receivedQuantity: item.receivedQuantity + (receiveQuantities[item.id] || 0)
            }));

            const allReceived = updatedItems.every(item => item.receivedQuantity >= item.quantity);
            const someReceived = updatedItems.some(item => item.receivedQuantity > 0);

            const logisticsStatus: POLogisticsStatus = allReceived ? 'Received' : (someReceived ? 'Partial' : 'Pending');

            await purchaseOrderApi.save({
                ...selectedPO,
                items: updatedItems,
                logisticsStatus
            });

            // Update inventory levels
            for (const item of selectedPO.items) {
                const qtyToReceive = receiveQuantities[item.id] || 0;
                if (qtyToReceive > 0 && item.itemId) {
                    const invItem = inventoryItems.find(i => i.id === item.itemId);
                    if (invItem) {
                        await inventoryApi.save({
                            ...invItem,
                            currentStock: invItem.currentStock + qtyToReceive
                        });
                    }
                }
            }

            setIsReceiveModalOpen(false);
            fetchData();
        } catch (error) {
            logger.errorCategory('inventory', 'Failed to receive items', error);
        }
    };
    
    // New PO state
    const [newPO, setNewPO] = useState<Partial<InventoryPurchaseOrder>>({
        poNumber: `PO-${Date.now().toString().slice(-6)}`,
        supplierName: '',
        date: new Date().toISOString().split('T')[0],
        items: [],
        totalAmount: 0,
        financialStatus: 'Unpaid',
        logisticsStatus: 'Pending'
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [poData, itemData] = await Promise.all([
                purchaseOrderApi.getAll(),
                inventoryApi.getAll()
            ]);
            setPos(poData);
            setInventoryItems(itemData);
        } catch (error) {
            logger.errorCategory('inventory', 'Failed to fetch purchasing data', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64Data = (reader.result as string).split(',')[1];
                await scanReceipt(base64Data, file.type);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            logger.errorCategory('inventory', 'AI Scanning failed', error);
            alert('AI Scanning failed. Please enter details manually.');
        } finally {
            setIsScanning(false);
        }
    };

    const scanReceipt = async (base64Data: string, mimeType: string) => {
        try {
            const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error('Gemini API key not found');
            }

            const ai = new GoogleGenAI({ apiKey });

            const prompt = `
                Extract the following information from this receipt in JSON format:
                - supplierName: name of the company/store
                - items: array of objects with { name, quantity, pricePerUnit }
                
                Ensure the response is ONLY valid JSON.
            `;

            const result = await ai.models.generateContent({
                model: "gemini-1.5-flash",
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt },
                            {
                                inlineData: {
                                    data: base64Data,
                                    mimeType
                                }
                            }
                        ]
                    }
                ]
            });

            const responseText = result.text || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                
                // Map extracted items to PO items
                const mappedItems: PurchaseOrderItem[] = data.items.map((item: any) => {
                    // Try to find matching item in inventory
                    const existingItem = inventoryItems.find(inv => 
                        inv.name.toLowerCase().includes(item.name.toLowerCase()) || 
                        item.name.toLowerCase().includes(inv.name.toLowerCase())
                    );

                    return {
                        id: Math.random().toString(36).substr(2, 9),
                        itemId: existingItem?.id || '',
                        name: item.name,
                        quantity: Number(item.quantity) || 1,
                        receivedQuantity: 0,
                        pricePerUnit: Number(item.pricePerUnit) || 0,
                        total: (Number(item.quantity) || 1) * (Number(item.pricePerUnit) || 0)
                    };
                });

                const total = mappedItems.reduce((sum, item) => sum + item.total, 0);

                setNewPO(prev => ({
                    ...prev,
                    supplierName: data.supplierName || '',
                    items: mappedItems,
                    totalAmount: total
                }));
                
                alert('AI Scanning successful! Details auto-filled.');
            }
        } catch (error) {
            console.error('Gemini error:', error);
            throw error;
        }
    };

    const handleSavePO = async () => {
        try {
            await purchaseOrderApi.save(newPO as InventoryPurchaseOrder);
            setIsCreateModalOpen(false);
            fetchData();
        } catch (error) {
            logger.errorCategory('inventory', 'Failed to save PO', error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold font-heading uppercase tracking-tight text-slate-950">Purchasing Hub</h2>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-6 py-2 bg-slate-950 text-white rounded-xl hover:bg-slate-900 transition-all font-heading uppercase tracking-widest text-xs font-bold shadow-lg"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                    New Purchase Order
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">PO #</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Supplier</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Amount</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Logistics</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Financial</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans text-sm">
                        {pos.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">No purchase orders found.</td>
                            </tr>
                        ) : (
                            pos.map(po => (
                                <tr 
                                    key={po.id} 
                                    onClick={() => {
                                        setSelectedPO(po);
                                        const initialQtys: Record<string, number> = {};
                                        po.items.forEach(item => {
                                            initialQtys[item.id] = item.quantity - item.receivedQuantity;
                                        });
                                        setReceiveQuantities(initialQtys);
                                        setIsReceiveModalOpen(true);
                                    }}
                                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                                >
                                    <td className="px-6 py-4 font-mono font-bold text-slate-900">{po.poNumber}</td>
                                    <td className="px-6 py-4 text-slate-700">{po.supplierName}</td>
                                    <td className="px-6 py-4 text-slate-500">{new Date(po.date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 font-bold text-slate-900">₹{po.totalAmount.toLocaleString()}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                            po.logisticsStatus === 'Received' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                            po.logisticsStatus === 'Partial' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                            'bg-slate-50 text-slate-500 border border-slate-100'
                                        }`}>
                                            {po.logisticsStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                            po.financialStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600' :
                                            po.financialStatus === 'Partial' ? 'bg-amber-50 text-amber-600' :
                                            'bg-rose-50 text-rose-600'
                                        }`}>
                                            {po.financialStatus}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create PO Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-slate-950 px-8 py-6 flex items-center justify-between">
                            <h2 className="text-xl font-bold font-heading uppercase tracking-tight text-white">Create Purchase Order</h2>
                            <div className="flex items-center gap-4">
                                <label className="cursor-pointer flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all text-xs font-bold uppercase tracking-widest">
                                    {isScanning ? (
                                        <span className="flex items-center gap-2">
                                            <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            AI Scanning...
                                        </span>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                            AI Scan Receipt
                                        </>
                                    )}
                                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" disabled={isScanning} />
                                </label>
                                <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-8 max-h-[70vh] overflow-y-auto space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Supplier Name</label>
                                    <input
                                        type="text"
                                        value={newPO.supplierName}
                                        onChange={e => setNewPO({...newPO, supplierName: e.target.value})}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">PO Number</label>
                                    <input
                                        type="text"
                                        value={newPO.poNumber}
                                        readOnly
                                        className="w-full px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-mono"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Line Items</label>
                                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                            <tr>
                                                <th className="px-4 py-2">Item</th>
                                                <th className="px-4 py-2 w-20 text-center">Qty</th>
                                                <th className="px-4 py-2 w-24 text-right">Price</th>
                                                <th className="px-4 py-2 w-24 text-right">Total</th>
                                                <th className="px-4 py-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {newPO.items?.map((item, index) => (
                                                <tr key={item.id} className="text-sm">
                                                    <td className="px-4 py-2">{item.name}</td>
                                                    <td className="px-4 py-2 text-center">{item.quantity}</td>
                                                    <td className="px-4 py-2 text-right">₹{item.pricePerUnit}</td>
                                                    <td className="px-4 py-2 text-right font-bold">₹{item.total}</td>
                                                    <td className="px-4 py-2">
                                                        <button 
                                                            onClick={() => {
                                                                const items = [...(newPO.items || [])];
                                                                items.splice(index, 1);
                                                                const total = items.reduce((sum, i) => sum + i.total, 0);
                                                                setNewPO({...newPO, items, totalAmount: total});
                                                            }}
                                                            className="text-rose-500 hover:text-rose-700"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-8 flex items-center justify-between border-t border-slate-200">
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Grand Total</p>
                                <p className="text-2xl font-bold text-slate-950">₹{newPO.totalAmount?.toLocaleString()}</p>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs"
                                >
                                    Discard
                                </button>
                                <button 
                                    onClick={handleSavePO}
                                    className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-500/20 uppercase tracking-widest text-xs"
                                >
                                    Confirm PO
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Receiving Modal */}
            {isReceiveModalOpen && selectedPO && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-slate-950 px-8 py-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold font-heading uppercase tracking-tight text-white">Receive Materials</h2>
                                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">PO: {selectedPO.poNumber}</p>
                            </div>
                            <button onClick={() => setIsReceiveModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        
                        <div className="p-8 space-y-6">
                            <div className="space-y-4">
                                {selectedPO.items.map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                                        <div className="flex-1">
                                            <p className="font-bold text-slate-900 text-sm">{item.name}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                                                Received: {item.receivedQuantity} / {item.quantity}
                                            </p>
                                        </div>
                                        <div className="w-24">
                                            <input
                                                type="number"
                                                min="0"
                                                max={item.quantity - item.receivedQuantity}
                                                value={receiveQuantities[item.id] || 0}
                                                onChange={e => setReceiveQuantities({...receiveQuantities, [item.id]: Number(e.target.value)})}
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-right font-bold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button 
                                    onClick={() => setIsReceiveModalOpen(false)}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all uppercase tracking-widest text-xs"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleReceiveItems}
                                    className="flex-1 py-3 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-2xl transition-all shadow-lg shadow-slate-950/20 uppercase tracking-widest text-xs"
                                >
                                    Update Delivery
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PurchasingHubModule;

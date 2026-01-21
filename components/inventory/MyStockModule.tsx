import React, { useState, useMemo, useEffect } from 'react';
import { InventoryItem, InventoryUnit } from '../../types';
import { inventoryApi } from '../../services/api/repositories/inventoryApi';
import { logger } from '../../services/logger';

const MyStockModule: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [items, setItems] = useState<InventoryItem[]>([]);
    
    // Form state for New Material
    const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
        name: '',
        category: '',
        currentStock: 0,
        minStockThreshold: 0,
        unit: 'bags',
        averagePurchasePrice: 0
    });

    const fetchItems = async () => {
        setIsLoading(true);
        try {
            const data = await inventoryApi.getAll();
            setItems(data);
        } catch (error) {
            logger.errorCategory('inventory', 'Failed to fetch inventory items', error);
            // Fallback mock data if API fails or is not implemented yet
            setItems([
                { id: '1', tenant_Id: 't1', name: 'Portland Cement', category: 'Cement', currentStock: 120, minStockThreshold: 50, unit: 'bags', averagePurchasePrice: 450 },
                { id: '2', tenant_Id: 't1', name: 'TMT Steel Bars', category: 'Steel', currentStock: 15, minStockThreshold: 20, unit: 'pieces', averagePurchasePrice: 1200 }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const categories = useMemo(() => {
        const cats = Array.from(new Set(items.map(item => item.category)));
        return ['All', ...cats];
    }, [items]);

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
            return matchesSearch && matchesCategory;
        });
    }, [items, searchTerm, categoryFilter]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await inventoryApi.save(newItem as InventoryItem);
            setIsModalOpen(false);
            setNewItem({ name: '', category: '', currentStock: 0, minStockThreshold: 0, unit: 'bags', averagePurchasePrice: 0 });
            fetchItems();
        } catch (error) {
            logger.errorCategory('inventory', 'Failed to save material', error);
            alert('Failed to save material. Using local state for demo.');
            const mockNewItem = { ...newItem, id: Date.now().toString(), tenant_Id: 'mock' } as InventoryItem;
            setItems(prev => [...prev, mockNewItem]);
            setIsModalOpen(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        </span>
                        <input
                            type="text"
                            placeholder="Search materials..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all font-sans text-sm"
                        />
                    </div>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all font-sans text-sm outline-none"
                    >
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-6 py-2 bg-slate-950 text-white rounded-xl hover:bg-slate-900 transition-all font-heading uppercase tracking-widest text-xs font-bold shadow-lg shadow-slate-950/20"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                    New Material
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Material Name</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Category</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Stock</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Unit</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avg. Price</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans text-sm">
                        {filteredItems.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-900">{item.name}</td>
                                <td className="px-6 py-4 text-slate-600">
                                    <span className="px-2 py-1 bg-slate-100 rounded-md text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        {item.category}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-mono font-medium text-slate-700">{item.currentStock}</td>
                                <td className="px-6 py-4 text-slate-500">{item.unit}</td>
                                <td className="px-6 py-4 text-slate-700">₹{item.averagePurchasePrice.toLocaleString()}</td>
                                <td className="px-6 py-4 text-right">
                                    {item.currentStock <= item.minStockThreshold ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-rose-100">
                                            <span className="w-1 h-1 bg-rose-600 rounded-full animate-pulse"></span>
                                            Low Stock
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                                            Healthy
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* New Material Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-slate-950 px-8 py-6 flex items-center justify-between">
                            <h2 className="text-xl font-bold font-heading uppercase tracking-tight text-white">Add New Material</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-8 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Material Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={newItem.name}
                                        onChange={e => setNewItem({...newItem, name: e.target.value})}
                                        placeholder="e.g. Portland Cement"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-sans text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Category</label>
                                    <input
                                        required
                                        type="text"
                                        value={newItem.category}
                                        onChange={e => setNewItem({...newItem, category: e.target.value})}
                                        placeholder="e.g. Cement"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-sans text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Unit</label>
                                    <select
                                        value={newItem.unit}
                                        onChange={e => setNewItem({...newItem, unit: e.target.value})}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-sans text-sm"
                                    >
                                        <option value="bags">Bags</option>
                                        <option value="kg">KG</option>
                                        <option value="meters">Meters</option>
                                        <option value="pieces">Pieces</option>
                                        <option value="liters">Liters</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Current Stock</label>
                                    <input
                                        required
                                        type="number"
                                        value={newItem.currentStock}
                                        onChange={e => setNewItem({...newItem, currentStock: Number(e.target.value)})}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-sans text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Min. Threshold</label>
                                    <input
                                        required
                                        type="number"
                                        value={newItem.minStockThreshold}
                                        onChange={e => setNewItem({...newItem, minStockThreshold: Number(e.target.value)})}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-sans text-sm"
                                    />
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Avg. Purchase Price (₹)</label>
                                    <input
                                        required
                                        type="number"
                                        value={newItem.averagePurchasePrice}
                                        onChange={e => setNewItem({...newItem, averagePurchasePrice: Number(e.target.value)})}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-sans text-sm"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button 
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all uppercase tracking-widest text-xs"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-500/20 uppercase tracking-widest text-xs"
                                >
                                    Save Material
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyStockModule;

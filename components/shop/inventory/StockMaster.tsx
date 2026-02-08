
import React, { useState } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import Select from '../../ui/Select';

const StockMaster: React.FC = () => {
    const { items, warehouses, updateStock, requestTransfer } = useInventory();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItem, setSelectedItem] = useState<any>(null);

    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

    const [transferData, setTransferData] = useState({
        sourceWarehouseId: '',
        destinationWarehouseId: '',
        quantity: 0,
        notes: ''
    });

    const [adjustData, setAdjustData] = useState({
        warehouseId: '',
        type: 'Increase' as 'Increase' | 'Decrease',
        quantity: 0,
        reason: ''
    });

    const handleTransfer = () => {
        if (!selectedItem) return;
        requestTransfer({
            sourceWarehouseId: transferData.sourceWarehouseId,
            destinationWarehouseId: transferData.destinationWarehouseId,
            items: [{
                itemId: selectedItem.id,
                quantity: Number(transferData.quantity),
                sku: selectedItem.sku,
                name: selectedItem.name
            }],
            requestedBy: 'admin-1', // Mock user
            notes: transferData.notes
        });
        setIsTransferModalOpen(false);
        setTransferData({ sourceWarehouseId: '', destinationWarehouseId: '', quantity: 0, notes: '' });
    };

    const handleAdjust = () => {
        if (!selectedItem) return;
        // Generate a random ID for reference
        const referenceId = `ADJ-${Date.now()}`;
        updateStock(
            selectedItem.id,
            adjustData.warehouseId,
            adjustData.type === 'Increase' ? Number(adjustData.quantity) : -Number(adjustData.quantity),
            'Adjustment',
            referenceId,
            adjustData.reason
        );
        setIsAdjustModalOpen(false);
        setAdjustData({ warehouseId: '', type: 'Increase', quantity: 0, reason: '' });
    };

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.includes(searchQuery) ||
        (item.barcode && item.barcode.includes(searchQuery))
    );

    return (
        <div className="flex gap-8 animate-fade-in relative h-full">
            {/* Left: Item List */}
            <div className={`flex-1 flex flex-col gap-6 transition-all ${selectedItem ? 'w-1/2' : 'w-full'}`}>
                <div className="relative group max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        {ICONS.search}
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                        placeholder="Search SKU or Name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <Card className="border-none shadow-sm overflow-hidden flex-1">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                                <tr>
                                    <th className="px-6 py-4">Item Details</th>
                                    <th className="px-6 py-4">On Hand</th>
                                    <th className="px-6 py-4">Available</th>
                                    <th className="px-6 py-4">In Transit</th>
                                    <th className="px-6 py-4">Value (Retail)</th>
                                    <th className="px-6 py-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredItems.map(item => (
                                    <tr
                                        key={item.id}
                                        onClick={() => setSelectedItem(item)}
                                        className={`hover:bg-indigo-50/50 cursor-pointer transition-colors ${selectedItem?.id === item.id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''}`}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                                            <div className="text-[10px] text-slate-400 font-mono italic">SKU: {item.sku}</div>
                                            {item.barcode && (
                                                <div className="text-[10px] text-indigo-500 font-mono font-bold mt-0.5">📊 {item.barcode}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-black font-mono text-slate-700">{item.onHand}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.available > 10 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                {item.available} {item.unit}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-slate-400 font-mono">{item.inTransit}</td>
                                        <td className="px-6 py-4 text-sm font-black text-slate-900 font-mono">
                                            {(item.onHand * item.retailPrice).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                                                {ICONS.chevronRight}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* Right: Item Drill-down Side Panel */}
            {selectedItem && (
                <div className="w-1/3 min-w-[400px] h-full sticky top-0 animate-slide-in-right">
                    <Card className="h-full border-none shadow-xl flex flex-col p-8 gap-8 overflow-y-auto bg-white border-l border-indigo-100 rounded-none rounded-l-3xl">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-black text-slate-800">{selectedItem.name}</h2>
                                <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mt-1">SKU ID: {selectedItem.sku}</p>
                                {selectedItem.barcode && (
                                    <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mt-0.5">📊 BARCODE: {selectedItem.barcode}</p>
                                )}
                            </div>
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                            >
                                {ICONS.x}
                            </button>
                        </div>

                        {/* Stock Distribution Matrix */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Inventory Distribution</h3>
                            <div className="grid grid-cols-1 gap-3">
                                {warehouses.map(wh => (
                                    <div key={wh.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 shadow-sm border border-slate-100 group-hover:text-indigo-600">
                                                {ICONS.building}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{wh.name}</p>
                                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{wh.code}</p>
                                            </div>
                                        </div>
                                        <div className="text-xl font-black text-slate-900 font-mono">
                                            {selectedItem.warehouseStock[wh.id] || 0}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Financial Metrics */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-100">
                                <p className="text-[10px] font-bold uppercase opacity-80">Retail Price</p>
                                <p className="text-xl font-black font-mono mt-1">{CURRENCY} {selectedItem.retailPrice}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-100">
                                <p className="text-[10px] font-bold uppercase opacity-80">Cost Price</p>
                                <p className="text-xl font-black font-mono mt-1">{CURRENCY} {selectedItem.costPrice}</p>
                            </div>
                        </div>

                        {/* Inventory Controls */}
                        <div className="space-y-4 mt-auto">
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsTransferModalOpen(true)}
                                    className="flex-1 py-4 bg-white border-2 border-slate-100 text-slate-700 rounded-2xl font-black text-xs hover:border-indigo-600 hover:text-indigo-600 transition-all uppercase tracking-widest shadow-sm"
                                >
                                    Transfer
                                </button>
                                <button
                                    onClick={() => setIsAdjustModalOpen(true)}
                                    className="flex-1 py-4 bg-white border-2 border-slate-100 text-slate-700 rounded-2xl font-black text-xs hover:border-indigo-600 hover:text-indigo-600 transition-all uppercase tracking-widest shadow-sm"
                                >
                                    Adjust
                                </button>
                            </div>
                            <button className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-dashed border-slate-200 hover:bg-slate-100 transition-all">
                                View Full Card History
                            </button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Transfer Modal */}
            <Modal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                title={`Transfer Stock - ${selectedItem?.name}`}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            label="Source Warehouse"
                            value={transferData.sourceWarehouseId}
                            onChange={(e) => setTransferData({ ...transferData, sourceWarehouseId: e.target.value })}
                        >
                            <option value="">Select Source</option>
                            {warehouses.map(wh => (
                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                            ))}
                        </Select>
                        <Select
                            label="Destination Warehouse"
                            value={transferData.destinationWarehouseId}
                            onChange={(e) => setTransferData({ ...transferData, destinationWarehouseId: e.target.value })}
                        >
                            <option value="">Select Destination</option>
                            {warehouses.map(wh => (
                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                            ))}
                        </Select>
                    </div>
                    <Input
                        label="Quantity"
                        type="number"
                        value={transferData.quantity}
                        onChange={(e) => setTransferData({ ...transferData, quantity: Number(e.target.value) })}
                    />
                    <Input
                        label="Notes"
                        placeholder="Reason for transfer..."
                        value={transferData.notes}
                        onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsTransferModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleTransfer} disabled={!transferData.sourceWarehouseId || !transferData.destinationWarehouseId || !transferData.quantity}>
                            Confirm Transfer
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Adjustment Modal */}
            <Modal
                isOpen={isAdjustModalOpen}
                onClose={() => setIsAdjustModalOpen(false)}
                title={`Adjust Stock - ${selectedItem?.name}`}
            >
                <div className="space-y-4">
                    <Select
                        label="Warehouse"
                        value={adjustData.warehouseId}
                        onChange={(e) => setAdjustData({ ...adjustData, warehouseId: e.target.value })}
                    >
                        <option value="">Select Warehouse</option>
                        {warehouses.map(wh => (
                            <option key={wh.id} value={wh.id}>{wh.name}</option>
                        ))}
                    </Select>
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            label="Adjustment Type"
                            value={adjustData.type}
                            onChange={(e) => setAdjustData({ ...adjustData, type: e.target.value as any })}
                        >
                            <option value="Increase">Increase (+)</option>
                            <option value="Decrease">Decrease (-)</option>
                        </Select>
                        <Input
                            label="Quantity"
                            type="number"
                            value={adjustData.quantity}
                            onChange={(e) => setAdjustData({ ...adjustData, quantity: Number(e.target.value) })}
                        />
                    </div>
                    <Input
                        label="Reason"
                        placeholder="Broken, Found, Gift, etc."
                        value={adjustData.reason}
                        onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsAdjustModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleAdjust} disabled={!adjustData.warehouseId || !adjustData.quantity}>
                            Confirm Adjustment
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default StockMaster;

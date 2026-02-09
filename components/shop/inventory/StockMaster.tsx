
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
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const { movements, updateItem } = useInventory();
    const itemHistory = movements.filter(m => m.itemId === selectedItem?.id);
    const [editData, setEditData] = useState<any>(null);

    // Initialize edit data when selected item changes
    React.useEffect(() => {
        if (selectedItem) {
            setEditData({
                name: selectedItem.name,
                sku: selectedItem.sku,
                barcode: selectedItem.barcode || '',
                category: selectedItem.category,
                unit: selectedItem.unit,
                retailPrice: selectedItem.retailPrice,
                costPrice: selectedItem.costPrice,
                reorderPoint: selectedItem.reorderPoint
            });
        }
    }, [selectedItem]);

    const handleUpdateItem = async () => {
        if (!selectedItem || !editData) return;
        try {
            await updateItem(selectedItem.id, editData);
            setIsEditModalOpen(false);
            // Re-select item to refresh side panel
            const updated = items.find(i => i.id === selectedItem.id);
            if (updated) setSelectedItem(updated);
        } catch (error) {
            console.error(error);
        }
    };

    const getMovementStyle = (type: string) => {
        switch (type) {
            case 'Sale': return 'bg-rose-100 text-rose-600';
            case 'Purchase': return 'bg-emerald-100 text-emerald-600';
            case 'Transfer': return 'bg-indigo-100 text-indigo-600';
            case 'Adjustment': return 'bg-amber-100 text-amber-600';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

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

    const filteredItems = items.filter(item => {
        const query = searchQuery.toLowerCase().trim();
        return item.name.toLowerCase().includes(query) ||
            item.sku.toLowerCase().includes(query) ||
            (item.barcode && item.barcode.toLowerCase().includes(query));
    });

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
                        placeholder="Search SKU, Name or Barcode..."
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
                                    <th className="px-6 py-4">Barcode</th>
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
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {item.barcode ? (
                                                <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg w-fit border border-indigo-100">
                                                    <span className="text-xs font-mono font-bold">{item.barcode}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-[10px] italic">No Barcode</span>
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
                            <button
                                onClick={() => setIsEditModalOpen(true)}
                                className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs hover:bg-indigo-100 transition-all uppercase tracking-widest shadow-sm border border-indigo-100 mb-3"
                            >
                                Edit Product Details
                            </button>
                            <button
                                onClick={() => setIsHistoryModalOpen(true)}
                                className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-dashed border-slate-200 hover:bg-slate-100 transition-all"
                            >
                                View Full Card History
                            </button>
                        </div>
                    </Card>
                </div>
            )}

            {/* History Modal */}
            <Modal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                title={`Stock Card - ${selectedItem?.name}`}
                size="lg"
            >
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Bin Card History</p>
                            <h4 className="text-sm font-bold text-slate-600 mt-1">Audit Trail for {selectedItem?.sku}</h4>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Current Balance</p>
                            <p className="text-lg font-black text-indigo-600 font-mono italic">{selectedItem?.onHand} {selectedItem?.unit}</p>
                        </div>
                    </div>

                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Event</th>
                                    <th className="px-6 py-4">Warehouse</th>
                                    <th className="px-6 py-4 text-center">Qty</th>
                                    <th className="px-6 py-4 text-right">Reference</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {itemHistory.length > 0 ? itemHistory.map(move => (
                                    <tr key={move.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs font-bold text-slate-700">
                                                {new Date(move.timestamp).toLocaleDateString()}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-mono">
                                                {new Date(move.timestamp).toLocaleTimeString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${getMovementStyle(move.type)}`}>
                                                {move.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                            {warehouses.find(w => w.id === move.warehouseId)?.name || '---'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-sm font-black font-mono ${move.quantity > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {move.quantity > 0 ? '+' : ''}{move.quantity}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 p-1 rounded uppercase">
                                                {move.referenceId.slice(0, 8)}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                                            No historical transactions found for this item.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

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

            {/* Edit Product Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title={`Edit Product - ${selectedItem?.name}`}
            >
                {editData && (
                    <div className="space-y-4">
                        <Input
                            label="Product Name"
                            value={editData.name}
                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="SKU"
                                value={editData.sku}
                                onChange={(e) => setEditData({ ...editData, sku: e.target.value })}
                            />
                            <Input
                                label="Barcode"
                                value={editData.barcode}
                                onChange={(e) => setEditData({ ...editData, barcode: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Retail Price"
                                type="number"
                                value={editData.retailPrice}
                                onChange={(e) => setEditData({ ...editData, retailPrice: Number(e.target.value) })}
                            />
                            <Input
                                label="Cost Price"
                                type="number"
                                value={editData.costPrice}
                                onChange={(e) => setEditData({ ...editData, costPrice: Number(e.target.value) })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Unit"
                                value={editData.unit}
                                onChange={(e) => setEditData({ ...editData, unit: e.target.value })}
                            />
                            <Input
                                label="Reorder Point"
                                type="number"
                                value={editData.reorderPoint}
                                onChange={(e) => setEditData({ ...editData, reorderPoint: Number(e.target.value) })}
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleUpdateItem}>Save Changes</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default StockMaster;


import React, { useState } from 'react';
import { InventoryProvider, useInventory } from '../../context/InventoryContext';
import InventoryDashboard from './inventory/InventoryDashboard';
import StockMaster from './inventory/StockMaster';
import StockMovements from './inventory/StockMovements';
import StockAdjustments from './inventory/StockAdjustments';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

const InventoryContent: React.FC = () => {
    const { addItem, refreshItems } = useInventory();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'stock' | 'movements' | 'adjustments'>('dashboard');
    const [isNewSkuModalOpen, setIsNewSkuModalOpen] = useState(false);
    const [newItemData, setNewItemData] = useState({
        sku: '',
        barcode: '',
        name: '',
        category: 'General',
        retailPrice: 0,
        costPrice: 0,
        reorderPoint: 10,
        unit: 'pcs'
    });

    // 🔄 Refresh items when component mounts to get latest SKUs
    React.useEffect(() => {
        console.log('🔄 [InventoryPage] Refreshing items on mount...');
        refreshItems();
    }, [refreshItems]);

    const handleCreateSku = async () => {
        try {
            await addItem({
                id: '', // Will be generated
                sku: newItemData.sku || `SKU-${Date.now()}`,
                barcode: newItemData.barcode || undefined,
                name: newItemData.name,
                category: newItemData.category,
                retailPrice: Number(newItemData.retailPrice),
                costPrice: Number(newItemData.costPrice),
                onHand: 0,
                available: 0,
                reserved: 0,
                inTransit: 0,
                damaged: 0,
                reorderPoint: Number(newItemData.reorderPoint),
                unit: newItemData.unit,
                warehouseStock: {}
            });
            setIsNewSkuModalOpen(false);
            setNewItemData({
                sku: '',
                barcode: '',
                name: '',
                category: 'General',
                retailPrice: 0,
                costPrice: 0,
                reorderPoint: 10,
                unit: 'pcs'
            });
        } catch (error) {
            // Error already handled in addItem
            console.error('Failed to create SKU:', error);
        }
    };

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: ICONS.barChart },
        { id: 'stock', label: 'Stock Master', icon: ICONS.package },
        { id: 'movements', label: 'Movements', icon: ICONS.trendingUp },
        { id: 'adjustments', label: 'Adjustments', icon: ICONS.settings },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50 -m-4 md:-m-8">
            {/* Header / Tab Navigation */}
            <div className="bg-white border-b border-slate-200 px-8 pt-6 shadow-sm z-10">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Inventory Management</h1>
                        <p className="text-slate-500 text-sm font-medium">Enterprise-level stock control and logistics.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsNewSkuModalOpen(true)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2"
                        >
                            {ICONS.plus} New SKU
                        </button>
                    </div>
                </div>

                <div className="flex gap-8">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === tab.id
                                ? 'text-indigo-600'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<any>, { width: 18, height: 18 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
                {activeTab === 'dashboard' && <InventoryDashboard />}
                {activeTab === 'stock' && <StockMaster />}
                {activeTab === 'movements' && <StockMovements />}
                {activeTab === 'adjustments' && <StockAdjustments />}
            </div>

            <Modal
                isOpen={isNewSkuModalOpen}
                onClose={() => setIsNewSkuModalOpen(false)}
                title="Create New SKU"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="SKU Code"
                            placeholder="Auto-generated if empty"
                            value={newItemData.sku}
                            onChange={(e) => setNewItemData({ ...newItemData, sku: e.target.value })}
                        />
                        <Input
                            label="Barcode"
                            placeholder="Scan or enter barcode"
                            value={newItemData.barcode}
                            onChange={(e) => setNewItemData({ ...newItemData, barcode: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <Input
                            label="Product Name"
                            placeholder="e.g. Cotton T-Shirt"
                            value={newItemData.name}
                            onChange={(e) => setNewItemData({ ...newItemData, name: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label="Category"
                            placeholder="e.g. Apparel"
                            value={newItemData.category}
                            onChange={(e) => setNewItemData({ ...newItemData, category: e.target.value })}
                        />
                        <Input
                            label="Unit"
                            placeholder="pcs, kg, etc"
                            value={newItemData.unit}
                            onChange={(e) => setNewItemData({ ...newItemData, unit: e.target.value })}
                        />
                        <Input
                            label="Reorder Point"
                            type="number"
                            value={newItemData.reorderPoint}
                            onChange={(e) => setNewItemData({ ...newItemData, reorderPoint: Number(e.target.value) })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Cost Price"
                            type="number"
                            value={newItemData.costPrice}
                            onChange={(e) => setNewItemData({ ...newItemData, costPrice: Number(e.target.value) })}
                        />
                        <Input
                            label="Retail Price"
                            type="number"
                            value={newItemData.retailPrice}
                            onChange={(e) => setNewItemData({ ...newItemData, retailPrice: Number(e.target.value) })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="secondary" onClick={() => setIsNewSkuModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateSku} disabled={!newItemData.name}>Create Product</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const InventoryPage: React.FC = () => {
    return <InventoryContent />;
};

export default InventoryPage;

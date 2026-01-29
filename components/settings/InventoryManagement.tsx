
import React, { useState, useMemo, useEffect } from 'react';
import WarehouseManagement from './WarehouseManagement';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import SettingsDetailPage from './SettingsDetailPage';

interface TableRowData {
    id: string;
    [key: string]: any;
    originalItem: any;
    level?: number;
}

const InventoryManagement: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast } = useNotification();
    const [activeTab, setActiveTab] = useState<'items' | 'warehouses'>('items');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingEntity, setEditingEntity] = useState<{ type: string; id: string } | null>(null);

    const handleAddNew = () => {
        if (activeTab === 'items') {
            setEditingEntity({ type: 'INVENTORYITEM', id: 'new' });
        } else if (activeTab === 'warehouses') {
            // Trigger warehouse form opening
            if ((window as any).__warehouseOpenForm) {
                (window as any).__warehouseOpenForm();
            }
        }
    };

    const handleRowClick = (item: TableRowData) => {
        setEditingEntity({ type: 'INVENTORYITEM', id: item.id });
    };

    const handleEdit = (e: React.MouseEvent, item: TableRowData) => {
        e.stopPropagation();
        setEditingEntity({ type: 'INVENTORYITEM', id: item.id });
    };

    // Table data for inventory items
    const tableData = useMemo(() => {
        const itemsMap = new Map<string, any>();
        state.inventoryItems.forEach(item => {
            const categoryName = item.expenseCategoryId 
                ? state.categories.find(c => c.id === item.expenseCategoryId)?.name || '-'
                : '-';
            itemsMap.set(item.id, { ...item, categoryName, children: [] });
        });
        const rootItems: any[] = [];
        itemsMap.forEach(item => {
            if (item.parentId && itemsMap.has(item.parentId)) {
                itemsMap.get(item.parentId).children.push(item);
            } else {
                rootItems.push(item);
            }
        });
        const flattened: TableRowData[] = [];
        const flatten = (items: any[], level = 0) => {
            items.sort((a, b) => a.name.localeCompare(b.name));
            items.forEach(item => {
                flattened.push({ 
                    id: item.id, 
                    name: item.name,
                    categoryName: item.categoryName,
                    unitType: item.unitType,
                    pricePerUnit: item.pricePerUnit || 0,
                    description: item.description || '-',
                    level,
                    originalItem: item
                });
                if (item.children && item.children.length > 0) flatten(item.children, level + 1);
            });
        };
        flatten(rootItems);
        let finalData = flattened;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            finalData = finalData.filter(item => 
                item.name.toLowerCase().includes(q) ||
                item.categoryName.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q)
            );
        }
        return finalData;
    }, [state.inventoryItems, state.categories, searchQuery]);

    const columnConfig = [
        {
            key: 'name', label: 'Name', render: (val: any, row: TableRowData) => (
                <div style={{ paddingLeft: `${(row.level || 0) * 20}px` }} className="flex items-center gap-2">
                    {row.level && row.level > 0 ? <span className="text-slate-300">└</span> : null}
                    <span className={row.level && row.level > 0 ? 'text-slate-700' : 'font-semibold text-sm text-slate-900'}>{val}</span>
                </div>
            )
        },
        { key: 'categoryName', label: 'Expense Category' },
        { key: 'unitType', label: 'Unit Type', render: (val: string) => {
            const labels: Record<string, string> = {
                'LENGTH_FEET': 'Length (Feet)',
                'AREA_SQFT': 'Area (Sq Ft)',
                'VOLUME_CUFT': 'Volume (Cu Ft)',
                'QUANTITY': 'Quantity'
            };
            return labels[val] || val;
        }},
        { key: 'pricePerUnit', label: 'Price/Unit', isNumeric: true },
        { key: 'description', label: 'Description' }
    ];

    // Sync local editingEntity with global state
    useEffect(() => {
        if (editingEntity) {
            dispatch({ type: 'SET_EDITING_ENTITY', payload: editingEntity });
        } else {
            dispatch({ type: 'CLEAR_EDITING_ENTITY' });
        }
    }, [editingEntity, dispatch]);

    if (editingEntity) {
        return <SettingsDetailPage goBack={() => setEditingEntity(null)} />;
    }

    return (
        <div className="flex flex-col h-full space-y-4 overflow-hidden px-0 py-6">
            {/* Tabs */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div className="flex overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent flex-1">
                        <button
                            onClick={() => setActiveTab('items')}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                                ${activeTab === 'items'
                                    ? 'bg-indigo-50 text-indigo-700 border-2 border-indigo-500'
                                    : 'border-2 border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }
                            `}
                        >
                            <div className={`w-4 h-4 ${activeTab === 'items' ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {ICONS.package}
                            </div>
                            <span>Inventory Items</span>
                            <span className={`
                                ml-1 px-2 py-0.5 rounded-full text-xs font-medium
                                ${activeTab === 'items'
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-slate-100 text-slate-500'
                                }
                            `}>
                                {state.inventoryItems.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('warehouses')}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ml-2
                                ${activeTab === 'warehouses'
                                    ? 'bg-blue-50 text-blue-700 border-2 border-blue-500'
                                    : 'border-2 border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }
                            `}
                        >
                            <div className={`w-4 h-4 ${activeTab === 'warehouses' ? 'text-blue-600' : 'text-slate-400'}`}>
                                {ICONS.archive}
                            </div>
                            <span>Warehouses</span>
                            <span className={`
                                ml-1 px-2 py-0.5 rounded-full text-xs font-medium
                                ${activeTab === 'warehouses'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-slate-100 text-slate-500'
                                }
                            `}>
                                {state.warehouses.length}
                            </span>
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={handleAddNew}
                        className="
                            ml-4 flex items-center justify-center w-10 h-10 rounded-lg transition-all flex-shrink-0
                            bg-indigo-100 text-indigo-600 hover:bg-indigo-200
                        "
                        title={activeTab === 'items' ? 'Add New Item' : 'Add New Warehouse'}
                    >
                        <div className="w-5 h-5">
                            {ICONS.plus}
                        </div>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {activeTab === 'items' ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
                        {/* Search Bar */}
                        <div className="p-4 border-b border-slate-200 flex-shrink-0">
                            <div className="relative">
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search inventory items..."
                                    className="w-full bg-white border-slate-200 shadow-sm focus:ring-2 focus:ring-indigo-100 transition-all rounded-lg pl-10"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    <div className="w-4 h-4">{ICONS.search}</div>
                                </div>
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        <div className="w-4 h-4">{ICONS.x}</div>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr>
                                        {columnConfig.map(col => (
                                            <th
                                                key={col.key}
                                                className={`px-4 py-2 text-${col.isNumeric ? 'right' : 'left'} text-xs font-semibold text-slate-500 uppercase tracking-wider`}
                                            >
                                                {col.label}
                                            </th>
                                        ))}
                                        <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-50">
                                    {tableData.length === 0 ? (
                                        <tr>
                                            <td colSpan={columnConfig.length + 1} className="px-4 py-8 text-center text-slate-400">
                                                {searchQuery 
                                                    ? 'No items found matching your search.' 
                                                    : 'No inventory items found. Add your first item above!'
                                                }
                                            </td>
                                        </tr>
                                    ) : (
                                        tableData.map((item) => (
                                            <tr
                                                key={item.id}
                                                onClick={() => handleRowClick(item)}
                                                className="cursor-pointer hover:bg-indigo-50/30 transition-colors group"
                                            >
                                                {columnConfig.map(col => (
                                                    <td
                                                        key={col.key}
                                                        className={`px-4 py-2 whitespace-nowrap text-xs ${col.isNumeric ? 'text-right' : 'text-slate-600'}`}
                                                    >
                                                        {col.render ? col.render(item[col.key], item) : (col.isNumeric ? <span className={`font-semibold ${item[col.key] >= 0 ? 'text-slate-700' : 'text-rose-600'}`}>{CURRENCY} {(item[col.key] || 0).toLocaleString()}</span> : item[col.key] || '-')}
                                                    </td>
                                                ))}
                                                <td className="px-4 py-2 whitespace-nowrap text-right">
                                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => handleEdit(e, item)}
                                                            className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 p-1 rounded transition-colors"
                                                            title="Edit"
                                                        >
                                                            <div className="w-3.5 h-3.5">{ICONS.edit}</div>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <WarehouseManagement onOpenFormRequest={() => {}} />
                )}
            </div>
        </div>
    );
};

export default InventoryManagement;

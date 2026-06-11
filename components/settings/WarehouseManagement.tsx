
import { useDispatchOnly, useWarehouses } from '../../hooks/useSelectiveState';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Warehouse } from '../../types';
import { ICONS } from '../../constants';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { useNotification } from '../../context/NotificationContext';
import { apiClient } from '../../services/api/client';

interface WarehouseManagementProps {
    onOpenFormRequest?: () => void;
}

const WarehouseManagement: React.FC<WarehouseManagementProps> = ({ onOpenFormRequest }) => {
        const warehouses = useWarehouses();
    const appDispatch = useDispatchOnly();
    const { showConfirm, showToast } = useNotification();
    
    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    
    // Grid state
    const [gridSearchQuery, setGridSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenForm = useCallback(() => {
        setName('');
        setAddress('');
        setEditingWarehouse(null);
        setIsFormOpen(true);
    }, []);

    // Listen for form open requests from parent
    useEffect(() => {
        if (onOpenFormRequest) {
            // Store the handler so parent can call it
            (window as any).__warehouseOpenForm = handleOpenForm;
            return () => {
                delete (window as any).__warehouseOpenForm;
            };
        }
    }, [onOpenFormRequest, handleOpenForm]);

    // Get all warehouses for grid, filtered and sorted
    const gridWarehouses = useMemo(() => {
        let warehouses = [...warehouses || []];

        // Apply search filter
        if (gridSearchQuery) {
            const query = gridSearchQuery.toLowerCase();
            warehouses = warehouses.filter(w => 
                w.name?.toLowerCase().includes(query) ||
                w.address?.toLowerCase().includes(query)
            );
        }

        // Apply sorting
        if (sortConfig) {
            warehouses.sort((a, b) => {
                let aVal: any = a[sortConfig.key as keyof Warehouse];
                let bVal: any = b[sortConfig.key as keyof Warehouse];
                
                // Handle undefined/null values
                if (aVal === undefined || aVal === null) aVal = '';
                if (bVal === undefined || bVal === null) bVal = '';
                
                // Convert to strings for comparison
                aVal = String(aVal).toLowerCase();
                bVal = String(bVal).toLowerCase();
                
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            // Default sort by name
            warehouses.sort((a, b) => a.name.localeCompare(b.name));
        }

        return warehouses;
    }, [warehouses, gridSearchQuery, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        
        if (!name.trim()) {
            showToast('Warehouse Name is required', 'error');
            return;
        }

        // Check for duplicate name
        const duplicate = warehouses?.find(w => 
            w.name.trim().toLowerCase() === name.trim().toLowerCase() && 
            (!editingWarehouse || w.id !== editingWarehouse.id)
        );

        if (duplicate) {
            showToast(`A warehouse with the name "${duplicate.name}" already exists.`, 'error');
            return;
        }

        const warehouseData: Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'> = {
            name: name.trim(),
            address: address.trim() || undefined
        };

        setIsSubmitting(true);
        try {
            if (editingWarehouse) {
                // Update existing warehouse
                const updated = await apiClient.post<Warehouse>('/warehouses', {
                    ...warehouseData,
                    id: editingWarehouse.id
                });
                
                appDispatch({
                    type: 'UPDATE_WAREHOUSE',
                    payload: updated
                });
                showToast('Warehouse updated successfully', 'success');
            } else {
                // Create new warehouse
                const created = await apiClient.post<Warehouse>('/warehouses', warehouseData);
                
                appDispatch({
                    type: 'ADD_WAREHOUSE',
                    payload: created
                });
                showToast('Warehouse added successfully', 'success');
            }

            // Reset form and close
            handleResetForm(true);
        } catch (error: any) {
            console.error('Error saving warehouse:', error);
            showToast(error?.response?.data?.error || 'Failed to save warehouse', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResetForm = (closeForm = false) => {
        setName('');
        setAddress('');
        setEditingWarehouse(null);
        if (closeForm) {
            setIsFormOpen(false);
        }
    };

    const handleEdit = (warehouse: Warehouse) => {
        setEditingWarehouse(warehouse);
        setName(warehouse.name);
        setAddress(warehouse.address || '');
        setIsFormOpen(true);
    };

    const handleDelete = async (warehouse: Warehouse) => {
        const confirmed = await showConfirm(
            'Delete Warehouse',
            `Are you sure you want to delete "${warehouse.name}"? This action cannot be undone.`,
            'Delete',
            'Cancel'
        );

        if (!confirmed) return;

        try {
            await apiClient.delete(`/warehouses/${warehouse.id}`);
            
            appDispatch({
                type: 'DELETE_WAREHOUSE',
                payload: warehouse.id
            });
            showToast('Warehouse deleted successfully', 'success');
        } catch (error: any) {
            console.error('Error deleting warehouse:', error);
            showToast(error?.response?.data?.error || 'Failed to delete warehouse', 'error');
        }
    };

    return (
        <div className="flex flex-col h-full space-y-4 overflow-hidden">
            {/* Add New Warehouse Form - Collapsible */}
            {isFormOpen && (
                <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-4 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3">
                        <div>
                            <h2 className="text-lg font-bold text-app-text">
                                {editingWarehouse ? 'Edit Warehouse' : 'Add New Warehouse'}
                            </h2>
                            <p className="text-xs text-app-muted">Fill in the warehouse details below.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input
                                label="Warehouse Name *"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Main Warehouse"
                                required
                                autoFocus
                                className="text-sm border-app-border border-2 focus:border-ds-primary"
                            />
                            <Textarea
                                label="Address"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Street address, City, State"
                                rows={2}
                                className="text-sm !border-app-border !border-2 focus:!border-ds-primary"
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            {editingWarehouse && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleResetForm}
                                    className="flex-1 text-sm py-2"
                                >
                                    Cancel
                                </Button>
                            )}
                            <LoadingButton
                                type="submit"
                                loading={isSubmitting}
                                loadingText="Saving..."
                                className="flex-1 text-sm py-2 bg-ds-primary hover:bg-ds-primary-hover text-white"
                            >
                                {editingWarehouse ? 'Update Warehouse' : 'Add Warehouse'}
                            </LoadingButton>
                        </div>
                    </form>
                </div>
            )}

            {/* Data Grid - Full Width */}
            <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card overflow-hidden flex-1 min-h-0 flex flex-col">
                {/* Search Bar */}
                <div className="p-4 border-b border-app-border flex-shrink-0">
                    <div className="relative">
                        <Input
                            value={gridSearchQuery}
                            onChange={(e) => setGridSearchQuery(e.target.value)}
                            placeholder="Search warehouses..."
                            className="w-full bg-app-card border-app-border shadow-ds-card focus:ring-2 focus:ring-ds-primary/20 transition-all rounded-lg pl-10"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        {gridSearchQuery && (
                            <button
                                onClick={() => setGridSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-muted"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scrollbar-thin scrollbar-thumb-app-border scrollbar-track-transparent">
                    <table className="min-w-full divide-y divide-app-border">
                        <thead className="bg-app-bg sticky top-0 z-10">
                            <tr>
                                {[
                                    { key: 'name', label: 'Name' },
                                    { key: 'address', label: 'Address' },
                                    { key: 'actions', label: 'Actions' }
                                ].map((col) => (
                                    <th
                                        key={col.key}
                                        className={`px-4 py-2 text-left text-xs font-semibold text-app-muted uppercase tracking-wider ${
                                            col.key === 'actions' ? 'text-right' : ''
                                        } ${
                                            col.key !== 'actions' ? 'cursor-pointer hover:bg-app-surface-2' : ''
                                        }`}
                                        onClick={() => col.key !== 'actions' && handleSort(col.key)}
                                    >
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {sortConfig?.key === col.key && (
                                                <div className="w-3 h-3 text-ds-primary">
                                                    {sortConfig.direction === 'asc' ? ICONS.arrowUp : ICONS.arrowDown}
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-app-card divide-y divide-app-border">
                            {gridWarehouses.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-app-muted">
                                        {gridSearchQuery 
                                            ? 'No warehouses found matching your search.' 
                                            : 'No warehouses found. Add your first warehouse using the + button above!'
                                        }
                                    </td>
                                </tr>
                            ) : (
                                gridWarehouses.map((warehouse) => (
                                    <tr
                                        key={warehouse.id}
                                        className="hover:bg-app-highlight/30 transition-colors group"
                                    >
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <div className="font-semibold text-sm text-app-text">{warehouse.name}</div>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-app-muted max-w-xs truncate">
                                            {warehouse.address || '-'}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEdit(warehouse)}
                                                    className="text-ds-primary hover:text-app-text bg-app-highlight hover:bg-app-highlight p-1 rounded transition-colors"
                                                    title="Edit"
                                                >
                                                    <div className="w-3.5 h-3.5">{ICONS.edit}</div>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(warehouse)}
                                                    className="text-ds-danger hover:text-ds-danger bg-rose-50 hover:bg-rose-100 p-1 rounded transition-colors"
                                                    title="Delete"
                                                >
                                                    <div className="w-3.5 h-3.5">{ICONS.trash}</div>
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
        </div>
    );
};

export default WarehouseManagement;

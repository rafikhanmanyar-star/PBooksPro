import React, { useState, useEffect, useCallback } from 'react';
import { shopApi, ShopProductCategory } from '../../../services/api/shopApi';
import { ICONS } from '../../../constants';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';

const InventoryCategories: React.FC = () => {
    const [categories, setCategories] = useState<ShopProductCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [saving, setSaving] = useState(false);

    const loadCategories = useCallback(async () => {
        try {
            setError(null);
            const list = await shopApi.getShopCategories();
            setCategories(Array.isArray(list) ? list : []);
        } catch (e: any) {
            setError(e?.message || 'Failed to load categories');
            setCategories([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    const openAdd = () => {
        setEditingId(null);
        setFormName('');
        setIsModalOpen(true);
    };

    const openEdit = (cat: ShopProductCategory) => {
        setEditingId(cat.id);
        setFormName(cat.name);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        const name = formName.trim();
        if (!name) return;
        setSaving(true);
        try {
            if (editingId) {
                await shopApi.updateShopCategory(editingId, { name });
            } else {
                await shopApi.createShopCategory({ name });
            }
            setIsModalOpen(false);
            await loadCategories();
        } catch (e: any) {
            setError(e?.message || 'Failed to save category');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Remove this category? Products using it will have their category cleared.')) return;
        try {
            await shopApi.deleteShopCategory(id);
            await loadCategories();
        } catch (e: any) {
            setError(e?.message || 'Failed to delete category');
        }
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Product Categories</h2>
                    <p className="text-slate-500 text-sm mt-0.5">Manage categories used when creating SKUs.</p>
                </div>
                <Button onClick={openAdd}>{ICONS.plus} Add Category</Button>
            </div>
            <div className="p-6">
                {loading && <p className="text-slate-500 text-sm">Loading...</p>}
                {error && <p className="text-rose-600 text-sm mb-3">{error}</p>}
                {!loading && categories.length === 0 && !error && (
                    <p className="text-slate-500 text-sm">No categories yet. Add one to use in product creation.</p>
                )}
                {!loading && categories.length > 0 && (
                    <ul className="divide-y divide-slate-100">
                        {categories.map(cat => (
                            <li key={cat.id} className="py-3 flex items-center justify-between gap-4">
                                <span className="font-medium text-slate-800">{cat.name}</span>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => openEdit(cat)}
                                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(cat.id)}
                                        className="text-sm text-rose-600 hover:text-rose-800 font-medium"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingId ? 'Edit Category' : 'Add Category'}
                size="sm"
            >
                <div className="space-y-4">
                    <Input
                        label="Category name"
                        placeholder="e.g. Food, Apparel"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!formName.trim() || saving}>
                            {saving ? 'Saving...' : (editingId ? 'Update' : 'Add')}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default InventoryCategories;

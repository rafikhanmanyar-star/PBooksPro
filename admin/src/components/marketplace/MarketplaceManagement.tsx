import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
    Search,
    Edit2,
    Plus,
    Trash2,
    Check,
    X,
    Image as ImageIcon
} from 'lucide-react';

interface MarketplaceAd {
    id: string;
    tenant_id: string;
    title: string;
    description?: string;
    category_id: string;
    category_name?: string;
    product_brand?: string;
    product_model?: string;
    status: string;
    views?: number;
    likes?: number;
    created_at: string;
    supplier_name?: string;
    supplier_company_name?: string;
    first_image?: {
        data_base64: string;
        content_type: string;
    };
}

interface Category {
    id: string;
    name: string;
    display_order: number;
}

const MarketplaceManagement: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'ads' | 'categories'>('ads');
    const [ads, setAds] = useState<MarketplaceAd[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Category Form State
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryFormData, setCategoryFormData] = useState({ id: '', name: '', display_order: 0 });

    useEffect(() => {
        if (activeTab === 'ads') {
            loadAds();
        } else {
            loadCategories();
        }
    }, [activeTab]);

    const loadAds = async () => {
        try {
            setLoading(true);
            const data = await adminApi.getMarketplaceAds();
            setAds(data);
            setError('');
        } catch (err: any) {
            setError(err.message || 'Failed to load ads');
        } finally {
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        try {
            setLoading(true);
            const data = await adminApi.getMarketplaceCategories();
            setCategories(data);
            setError('');
        } catch (err: any) {
            setError(err.message || 'Failed to load categories');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (adId: string) => {
        if (!confirm('Approve this listing for the global marketplace?')) return;
        try {
            await adminApi.approveMarketplaceAd(adId);
            loadAds();
        } catch (err: any) {
            alert(err.message || 'Failed to approve ad');
        }
    };

    const handleReject = async (adId: string) => {
        const reason = prompt('Reason for rejection (optional):');
        if (reason === null) return;
        try {
            await adminApi.rejectMarketplaceAd(adId, reason);
            loadAds();
        } catch (err: any) {
            alert(err.message || 'Failed to reject ad');
        }
    };

    const handleCategorySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingCategory) {
                await adminApi.updateMarketplaceCategory(editingCategory.id, {
                    name: categoryFormData.name,
                    display_order: categoryFormData.display_order
                });
            } else {
                await adminApi.createMarketplaceCategory(categoryFormData);
            }
            setShowCategoryForm(false);
            setEditingCategory(null);
            setCategoryFormData({ id: '', name: '', display_order: 0 });
            loadCategories();
        } catch (err: any) {
            alert(err.message || 'Failed to save category');
        }
    };

    const handleDeleteCategory = async (catId: string) => {
        if (!confirm('Are you sure you want to delete this category? It will fail if ads are using it.')) return;
        try {
            await adminApi.deleteMarketplaceCategory(catId);
            loadCategories();
        } catch (err: any) {
            alert(err.message || 'Failed to delete category');
        }
    };

    const filteredAds = ads.filter(ad => {
        const matchesSearch = ad.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            ad.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            ad.supplier_company_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === '' || ad.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="admin-container" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Marketplace Management</h1>
                    <p style={{ color: '#6b7280' }}>Moderate listings and manage industry categories</p>
                </div>
            </div>

            {error && (
                <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                    {error}
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #e5e7eb' }}>
                <button
                    onClick={() => setActiveTab('ads')}
                    style={{
                        padding: '0.75rem 1.5rem',
                        border: 'none',
                        background: 'none',
                        fontWeight: 600,
                        color: activeTab === 'ads' ? '#4f46e5' : '#6b7280',
                        borderBottom: activeTab === 'ads' ? '2px solid #4f46e5' : 'none',
                        cursor: 'pointer'
                    }}
                >
                    Moderation Queue
                </button>
                <button
                    onClick={() => setActiveTab('categories')}
                    style={{
                        padding: '0.75rem 1.5rem',
                        border: 'none',
                        background: 'none',
                        fontWeight: 600,
                        color: activeTab === 'categories' ? '#4f46e5' : '#6b7280',
                        borderBottom: activeTab === 'categories' ? '2px solid #4f46e5' : 'none',
                        cursor: 'pointer'
                    }}
                >
                    Industry Categories
                </button>
            </div>

            {activeTab === 'ads' && (
                <>
                    {/* Filters */}
                    <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Search size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Search by title, supplier, or company..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ paddingLeft: '2.5rem', width: '100%' }}
                                />
                            </div>
                            <select
                                className="input"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{ width: '200px' }}
                            >
                                <option value="">All Statuses</option>
                                <option value="PENDING">Pending Approval</option>
                                <option value="ACTIVE">Active</option>
                                <option value="REJECTED">Rejected</option>
                            </select>
                        </div>
                    </div>

                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#f9fafb' }}>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '1rem' }}>Product</th>
                                    <th style={{ textAlign: 'left', padding: '1rem' }}>Supplier</th>
                                    <th style={{ textAlign: 'left', padding: '1rem' }}>Category</th>
                                    <th style={{ textAlign: 'left', padding: '1rem' }}>Status</th>
                                    <th style={{ textAlign: 'left', padding: '1rem' }}>Posted On</th>
                                    <th style={{ textAlign: 'right', padding: '1rem' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Loading ads...</td></tr>
                                ) : filteredAds.length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No ads found</td></tr>
                                ) : (
                                    filteredAds.map(ad => (
                                        <tr key={ad.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                    <div style={{ width: '48px', height: '48px', backgroundColor: '#f3f4f6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyItems: 'center', overflow: 'hidden' }}>
                                                        {ad.first_image ? (
                                                            <img src={`data:${ad.first_image.content_type};base64,${ad.first_image.data_base64}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : <ImageIcon size={20} color="#9ca3af" />}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{ad.title}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                                            {ad.product_brand} {ad.product_model}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <div>{ad.supplier_company_name || ad.supplier_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>ID: {ad.tenant_id}</div>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <span className="badge" style={{ backgroundColor: '#eef2ff', color: '#4338ca' }}>
                                                    {ad.category_name}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <span className="badge" style={{
                                                    backgroundColor: ad.status === 'ACTIVE' ? '#d1fae5' : ad.status === 'PENDING' ? '#fef3c7' : '#fee2e2',
                                                    color: ad.status === 'ACTIVE' ? '#065f46' : ad.status === 'PENDING' ? '#92400e' : '#991b1b'
                                                }}>
                                                    {ad.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                {new Date(ad.created_at).toLocaleDateString()}
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    {ad.status === 'PENDING' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleApprove(ad.id)}
                                                                className="btn btn-success"
                                                                title="Approve"
                                                                style={{ padding: '0.5rem' }}
                                                            >
                                                                <Check size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(ad.id)}
                                                                className="btn btn-danger"
                                                                title="Reject"
                                                                style={{ padding: '0.5rem' }}
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {ad.status === 'ACTIVE' && (
                                                        <button
                                                            onClick={() => handleReject(ad.id)}
                                                            className="btn btn-danger"
                                                            title="Deactivate"
                                                            style={{ padding: '0.5rem' }}
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    )}
                                                    {ad.status === 'REJECTED' && (
                                                        <button
                                                            onClick={() => handleApprove(ad.id)}
                                                            className="btn btn-success"
                                                            title="Re-activate"
                                                            style={{ padding: '0.5rem' }}
                                                        >
                                                            <Check size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'categories' && (
                <>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setEditingCategory(null);
                                setCategoryFormData({ id: '', name: '', display_order: 0 });
                                setShowCategoryForm(true);
                            }}
                        >
                            <Plus size={18} style={{ marginRight: '0.5rem' }} />
                            Add New Category
                        </button>
                    </div>

                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#f9fafb' }}>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '1rem' }}>ID (Slug)</th>
                                    <th style={{ textAlign: 'left', padding: '1rem' }}>Display Name</th>
                                    <th style={{ textAlign: 'left', padding: '1rem' }}>Order</th>
                                    <th style={{ textAlign: 'right', padding: '1rem' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>Loading categories...</td></tr>
                                ) : categories.length === 0 ? (
                                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>No categories defined</td></tr>
                                ) : (
                                    categories.map(cat => (
                                        <tr key={cat.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                                            <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{cat.id}</td>
                                            <td style={{ padding: '1rem', fontWeight: 600 }}>{cat.name}</td>
                                            <td style={{ padding: '1rem' }}>{cat.display_order}</td>
                                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="btn btn-secondary"
                                                        onClick={() => {
                                                            setEditingCategory(cat);
                                                            setCategoryFormData({ id: cat.id, name: cat.name, display_order: cat.display_order });
                                                            setShowCategoryForm(true);
                                                        }}
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        className="btn btn-danger"
                                                        onClick={() => handleDeleteCategory(cat.id)}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Category Modal */}
            {showCategoryForm && (
                <div style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '400px', padding: '2rem' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>{editingCategory ? 'Edit Category' : 'Create Category'}</h2>
                        <form onSubmit={handleCategorySubmit}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Category ID (Slug)</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={categoryFormData.id}
                                    disabled={!!editingCategory}
                                    onChange={(e) => setCategoryFormData({ ...categoryFormData, id: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                                    placeholder="e.g. consumer_electronics"
                                    required
                                />
                                {!editingCategory && <p style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>Must be unique, lowercase, no spaces.</p>}
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Display Name</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={categoryFormData.name}
                                    onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                                    placeholder="e.g. Consumer Electronics"
                                    required
                                />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Display Order</label>
                                <input
                                    type="number"
                                    className="input"
                                    value={categoryFormData.display_order}
                                    onChange={(e) => setCategoryFormData({ ...categoryFormData, display_order: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCategoryForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingCategory ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketplaceManagement;

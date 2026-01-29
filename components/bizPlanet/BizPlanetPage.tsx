
import React, { memo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import BuyerDashboard from './BuyerDashboard';
import SupplierPortal from './SupplierPortal';
import MarketplacePage from './MarketplacePage';
import { consumePendingBizPlanetAction, dispatchBizPlanetNotificationAction } from '../../utils/bizPlanetNotifications';

type TabType = 'marketplace' | 'supplier' | 'buyer';

const BizPlanetPage: React.FC = () => {
    const { tenant } = useAuth();
    const [isSupplier, setIsSupplier] = useState<boolean>(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('supplier');

    useEffect(() => {
        checkSupplierStatus();
    }, [tenant]);

    useEffect(() => {
        if (loading) return;
        const action = consumePendingBizPlanetAction();
        if (!action) return;
        if (!isSupplier && action.target === 'supplier') return;
        const targetTab: TabType = action.target === 'supplier' ? 'supplier' : 'buyer';
        if (isSupplier) {
            setActiveTab(targetTab);
        }
        const timer = setTimeout(() => {
            dispatchBizPlanetNotificationAction(action);
        }, 150);
        return () => clearTimeout(timer);
    }, [loading, isSupplier]);

    const checkSupplierStatus = async () => {
        try {
            if (tenant?.id) {
                // Fetch current tenant info to check is_supplier flag
                const tenantInfo = await apiClient.get<{ is_supplier?: boolean }>('/tenants/me');
                console.log('Tenant info received:', tenantInfo);
                console.log('is_supplier value:', tenantInfo.is_supplier);
                const supplierStatus = tenantInfo.is_supplier === true || tenantInfo.is_supplier === 'true';
                console.log('Setting isSupplier to:', supplierStatus);
                setIsSupplier(supplierStatus);
                // If supplier, default to supplier tab; otherwise marketplace (first tab)
                setActiveTab(supplierStatus ? 'supplier' : 'marketplace');
            } else {
                console.log('No tenant ID available');
                setIsSupplier(false);
                setActiveTab('marketplace');
            }
        } catch (error) {
            console.error('Error checking supplier status:', error);
            // If error, default to buyer (not supplier)
            setIsSupplier(false);
            setActiveTab('marketplace');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mb-2"></div>
                    <p className="text-sm text-slate-600">Loading...</p>
                </div>
            </div>
        );
    }

    // Main tabs: Marketplace first (left), then Supplier (if supplier), then Buyer
    const tabs: { key: TabType; label: string }[] = [
        { key: 'marketplace', label: 'Marketplace' },
        ...(isSupplier ? [{ key: 'supplier' as TabType, label: 'Supplier Dashboard' }] : []),
        { key: 'buyer', label: 'Buyer Dashboard' },
    ];

    if (isSupplier) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex-shrink-0 border-b border-slate-200 bg-white">
                    <div className="flex gap-1 px-4 pt-4 flex-wrap">
                        {tabs.map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                                    activeTab === key
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-hidden">
                    {activeTab === 'marketplace' && <MarketplacePage isSupplier={true} />}
                    {activeTab === 'supplier' && <SupplierPortal />}
                    {activeTab === 'buyer' && <BuyerDashboard />}
                </div>
            </div>
        );
    }

    // Non-supplier: Marketplace + Buyer Dashboard only
    return (
        <div className="flex flex-col h-full">
            <div className="flex-shrink-0 border-b border-slate-200 bg-white">
                <div className="flex gap-1 px-4 pt-4">
                    {tabs.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                                activeTab === key
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-hidden">
                {activeTab === 'marketplace' && <MarketplacePage isSupplier={false} />}
                {activeTab === 'buyer' && <BuyerDashboard />}
            </div>
        </div>
    );
};

export default memo(BizPlanetPage);

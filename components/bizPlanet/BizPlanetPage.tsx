
import React, { memo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import BuyerDashboard from './BuyerDashboard';
import SupplierPortal from './SupplierPortal';
import MarketplacePage from './MarketplacePage';
import { consumePendingBizPlanetAction, dispatchBizPlanetNotificationAction } from '../../utils/bizPlanetNotifications';
import { Globe, Briefcase, ShieldCheck } from 'lucide-react';

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

    const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
        { key: 'marketplace', label: 'Marketplace', icon: <Globe className="w-4 h-4" /> },
        ...(isSupplier ? [{ key: 'supplier' as TabType, label: 'Supplier Hub', icon: <Briefcase className="w-4 h-4" /> }] : []),
        { key: 'buyer', label: 'Buyer Center', icon: <ShieldCheck className="w-4 h-4" /> },
    ];

    const renderTabs = () => (
        <div className="flex-shrink-0 bg-white border-b border-slate-200">
            <div className="max-w-[1600px] mx-auto px-6 pt-6">
                <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl w-fit mb-[-1px] relative z-10 border border-slate-200">
                    {tabs.map(({ key, label, icon }) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-black rounded-xl transition-all duration-300 uppercase tracking-tight ${activeTab === key
                                ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200'
                                : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
                                }`}
                        >
                            {icon}
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {renderTabs()}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'marketplace' && <MarketplacePage isSupplier={isSupplier} />}
                {activeTab === 'supplier' && isSupplier && <SupplierPortal />}
                {activeTab === 'buyer' && <BuyerDashboard />}
            </div>
        </div>
    );
};

export default memo(BizPlanetPage);

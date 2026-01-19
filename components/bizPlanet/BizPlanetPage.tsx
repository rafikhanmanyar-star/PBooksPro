
import React, { memo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import BuyerDashboard from './BuyerDashboard';
import SupplierPortal from './SupplierPortal';

type TabType = 'supplier' | 'buyer';

const BizPlanetPage: React.FC = () => {
    const { tenant } = useAuth();
    const [isSupplier, setIsSupplier] = useState<boolean>(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('supplier');

    useEffect(() => {
        checkSupplierStatus();
    }, [tenant]);

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
                // If supplier, default to supplier tab; otherwise buyer tab
                setActiveTab(supplierStatus ? 'supplier' : 'buyer');
            } else {
                console.log('No tenant ID available');
                setIsSupplier(false);
                setActiveTab('buyer');
            }
        } catch (error) {
            console.error('Error checking supplier status:', error);
            // If error, default to buyer (not supplier)
            setIsSupplier(false);
            setActiveTab('buyer');
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

    // If supplier, show both tabs. Otherwise, show only buyer dashboard
    if (isSupplier) {
        return (
            <div className="flex flex-col h-full">
                {/* Tabs for Supplier and Buyer */}
                <div className="flex-shrink-0 border-b border-slate-200 bg-white">
                    <div className="flex gap-1 px-4 pt-4">
                        <button
                            onClick={() => setActiveTab('supplier')}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                                activeTab === 'supplier'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            Supplier Dashboard
                        </button>
                        <button
                            onClick={() => setActiveTab('buyer')}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                                activeTab === 'buyer'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            Buyer Dashboard
                        </button>
                    </div>
                </div>
                
                {/* Tab Content */}
                <div className="flex-1 overflow-hidden">
                    {activeTab === 'supplier' ? (
                        <SupplierPortal />
                    ) : (
                        <BuyerDashboard />
                    )}
                </div>
            </div>
        );
    }

    // Non-supplier: show only buyer dashboard
    return <BuyerDashboard />;
};

export default memo(BizPlanetPage);


import React, { memo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import BuyerDashboard from './BuyerDashboard';
import SupplierPortal from './SupplierPortal';

const BizPlanetPage: React.FC = () => {
    const { tenant } = useAuth();
    const [isSupplier, setIsSupplier] = useState<boolean>(false);
    const [loading, setLoading] = useState(true);

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
            } else {
                console.log('No tenant ID available');
                setIsSupplier(false);
            }
        } catch (error) {
            console.error('Error checking supplier status:', error);
            // If error, default to buyer (not supplier)
            setIsSupplier(false);
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

    return (
        <>
            {isSupplier ? (
                <SupplierPortal />
            ) : (
                <BuyerDashboard />
            )}
        </>
    );
};

export default memo(BizPlanetPage);

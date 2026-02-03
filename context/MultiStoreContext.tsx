
import React, { createContext, useContext, useState, useMemo } from 'react';
import {
    StoreBranch,
    POSTerminal,
    StorePerformance,
    OrganizationHeader,
    GlobalPolicies
} from '../types/multiStore';
import { shopApi } from '../services/api/shopApi';
import { useAuth } from './AuthContext';

interface MultiStoreContextType {
    organization: OrganizationHeader;
    stores: StoreBranch[];
    terminals: POSTerminal[];
    performance: StorePerformance[];

    // Actions
    updateStoreStatus: (storeId: string, status: any) => void;
    lockTerminal: (terminalId: string) => void;

    // Derived
    consolidatedRevenue: number;
    activeTerminalsCount: number;
    addStore: (store: Omit<StoreBranch, 'id' | 'status'>) => Promise<void>;
    updateStore: (id: string, store: Partial<StoreBranch>) => Promise<void>;
    addTerminal: (terminal: Omit<POSTerminal, 'id' | 'status' | 'healthScore' | 'lastSync' | 'code'> & { code?: string }) => Promise<void>;
    savePolicies: (policies: GlobalPolicies) => Promise<void>;
    policies: GlobalPolicies;
    updateTerminal: (id: string, terminal: Partial<POSTerminal>) => Promise<void>;
    deleteTerminal: (id: string) => Promise<void>;
    unlockTerminal: (id: string) => Promise<void>;
}

const MultiStoreContext = createContext<MultiStoreContextType | undefined>(undefined);

export const MultiStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [organization, setOrganization] = useState<OrganizationHeader>({
        name: 'My Organization',
        hqAddress: '',
        totalStores: 0,
        centralCurrency: 'PKR',
        lastConsolidated: new Date().toISOString()
    });

    const [stores, setStores] = useState<StoreBranch[]>([]);
    const [terminals, setTerminals] = useState<POSTerminal[]>([]);
    const [performance, setPerformance] = useState<StorePerformance[]>([]);
    const [policies, setPolicies] = useState<GlobalPolicies>({
        allowNegativeStock: false,
        universalPricing: true,
        taxInclusive: false,
        defaultTaxRate: 0,
        requireManagerApproval: false,
        loyaltyRedemptionRatio: 0.01
    });

    const { isAuthenticated, tenant } = useAuth();

    React.useEffect(() => {
        const fetchData = async () => {
            if (!isAuthenticated) {
                console.log('[MultiStoreContext] Skipping fetch: not authenticated');
                return;
            }

            try {
                console.log('[MultiStoreContext] Fetching branches for tenant:', tenant?.id);
                const branches = await shopApi.getBranches();

                if (!Array.isArray(branches)) {
                    console.error('[MultiStoreContext] Received non-array response from getBranches:', branches);
                    return;
                }

                const mappedStores: StoreBranch[] = branches.map((b: any) => ({
                    id: b.id,
                    name: b.name,
                    code: b.code,
                    type: b.type,
                    status: b.status,
                    location: b.location,
                    region: b.region,
                    manager: b.manager_name,
                    contact: b.contact_no,
                    timezone: b.timezone,
                    openTime: b.open_time,
                    closeTime: b.close_time
                }));
                setStores(mappedStores);

                // Set organization name from tenant or defaults
                setOrganization(prev => ({
                    ...prev,
                    name: tenant?.name || 'My Organization',
                    totalStores: mappedStores.length
                }));

                // Fetch Global Policies
                const policyData = await shopApi.getPolicies() as any;
                if (policyData) {
                    setPolicies({
                        allowNegativeStock: policyData.allow_negative_stock,
                        universalPricing: policyData.universal_pricing,
                        taxInclusive: policyData.tax_inclusive,
                        defaultTaxRate: parseFloat(policyData.default_tax_rate) || 0,
                        requireManagerApproval: policyData.require_manager_approval,
                        loyaltyRedemptionRatio: parseFloat(policyData.loyalty_redemption_ratio) || 0.01
                    });
                }

                // Fetch Terminals
                const terminalData = await shopApi.getTerminals() as any[];
                console.log(`[MultiStoreContext] Fetched ${terminalData?.length} terminals`);
                if (Array.isArray(terminalData)) {
                    const mappedTerminals = terminalData.map((t: any) => ({
                        id: t.id,
                        storeId: t.branch_id,
                        name: t.name,
                        status: t.status,
                        version: t.version,
                        lastSync: t.last_sync || new Date().toISOString(),
                        ipAddress: t.ip_address,
                        healthScore: t.health_score || 100
                    }));
                    console.log('[MultiStoreContext] Mapped terminals:', mappedTerminals);
                    setTerminals(mappedTerminals);
                }
            } catch (error) {
                console.error('Failed to fetch stores or policies:', error);
            }
        };
        fetchData();
    }, [isAuthenticated, tenant?.id]);

    const updateStoreStatus = (storeId: string, status: any) => {
        setStores(prev => prev.map(s => s.id === storeId ? { ...s, status } : s));
    };

    const addStore = async (storeData: Omit<StoreBranch, 'id' | 'status'>) => {
        try {
            // Map frontend fields to backend expected fields
            const apiPayload = {
                name: storeData.name,
                code: storeData.code,
                type: storeData.type,
                location: storeData.location,
                region: storeData.region,
                managerName: storeData.manager,
                contactNo: storeData.contact,
                timezone: storeData.timezone,
                openTime: storeData.openTime,
                closeTime: storeData.closeTime
            };

            const response = await shopApi.createBranch(apiPayload) as any;

            const newStore: StoreBranch = {
                ...storeData,
                id: response && response.id ? response.id : crypto.randomUUID(),
                status: 'Active'
            };
            setStores(prev => [...prev, newStore]);
        } catch (e) {
            console.error('Failed to create store:', e);
            throw e; // Rethrow so the UI can handle/display the error
        }
    };

    const updateStore = async (id: string, storeData: Partial<StoreBranch>) => {
        try {
            // Map frontend fields to backend expected fields
            const apiPayload = {
                name: storeData.name,
                code: storeData.code,
                type: storeData.type,
                location: storeData.location,
                region: storeData.region,
                managerName: storeData.manager,
                contactNo: storeData.contact,
                timezone: storeData.timezone,
                openTime: storeData.openTime,
                closeTime: storeData.closeTime,
                status: storeData.status
            };

            await shopApi.updateBranch(id, apiPayload);

            setStores(prev => prev.map(s => s.id === id ? { ...s, ...storeData } : s));
        } catch (e) {
            console.error('Failed to update store:', e);
            throw e;
        }
    };

    const savePolicies = async (policyData: GlobalPolicies) => {
        try {
            const updated = await shopApi.updatePolicies(policyData) as any;
            setPolicies({
                allowNegativeStock: updated.allow_negative_stock,
                universalPricing: updated.universal_pricing,
                taxInclusive: updated.tax_inclusive,
                defaultTaxRate: parseFloat(updated.default_tax_rate),
                requireManagerApproval: updated.require_manager_approval,
                loyaltyRedemptionRatio: parseFloat(updated.loyalty_redemption_ratio)
            });
        } catch (e) {
            console.error('Failed to save policies:', e);
            throw e;
        }
    };

    const lockTerminal = async (terminalId: string) => {
        try {
            await shopApi.updateTerminal(terminalId, { status: 'Locked' });
            setTerminals(prev => prev.map(t => t.id === terminalId ? { ...t, status: 'Locked' } : t));
        } catch (e) {
            console.error('Failed to lock terminal:', e);
            throw e;
        }
    };

    const unlockTerminal = async (terminalId: string) => {
        try {
            await shopApi.updateTerminal(terminalId, { status: 'Online' });
            setTerminals(prev => prev.map(t => t.id === terminalId ? { ...t, status: 'Online' } : t));
        } catch (e) {
            console.error('Failed to unlock terminal:', e);
            throw e;
        }
    };

    const updateTerminal = async (id: string, terminalData: Partial<POSTerminal>) => {
        try {
            const apiPayload = {
                name: terminalData.name,
                status: terminalData.status,
                ip_address: terminalData.ipAddress,
                version: terminalData.version,
                health_score: terminalData.healthScore
            };
            await shopApi.updateTerminal(id, apiPayload);
            setTerminals(prev => prev.map(t => t.id === id ? { ...t, ...terminalData } : t));
        } catch (e) {
            console.error('Failed to update terminal:', e);
            throw e;
        }
    };

    const deleteTerminal = async (id: string) => {
        try {
            await shopApi.deleteTerminal(id);
            setTerminals(prev => prev.filter(t => t.id !== id));
        } catch (e) {
            console.error('Failed to delete terminal:', e);
            throw e;
        }
    };

    const addTerminal = async (terminalData: Omit<POSTerminal, 'id' | 'status' | 'healthScore' | 'lastSync' | 'code'> & { code?: string }) => {
        try {
            const apiPayload = {
                branchId: terminalData.storeId,
                name: terminalData.name,
                version: terminalData.version,
                ipAddress: terminalData.ipAddress,
                code: terminalData.code,
                status: 'Offline'
            };

            const response = await shopApi.createTerminal(apiPayload) as any;

            const newTerminal: POSTerminal = {
                ...terminalData,
                id: response && response.id ? response.id : crypto.randomUUID(),
                code: terminalData.code || (response && response.code) || `T-${Date.now().toString().slice(-4)}`,
                status: 'Offline',
                healthScore: 100,
                lastSync: new Date().toISOString()
            };
            setTerminals(prev => [...prev, newTerminal]);
        } catch (e) {
            console.error('Failed to register terminal:', e);
            throw e;
        }
    };

    const consolidatedRevenue = useMemo(() => performance.reduce((sum, p) => sum + p.salesToday, 0), [performance]);
    const activeTerminalsCount = useMemo(() => terminals.filter(t => t.status === 'Online').length, [terminals]);

    const value = {
        organization,
        stores,
        terminals,
        performance,
        updateStoreStatus,
        lockTerminal,
        unlockTerminal,
        addStore,
        updateStore,
        addTerminal,
        updateTerminal,
        deleteTerminal,
        savePolicies,
        policies,
        consolidatedRevenue,
        activeTerminalsCount
    };

    return <MultiStoreContext.Provider value={value}>{children}</MultiStoreContext.Provider>;
};

export const useMultiStore = () => {
    const context = useContext(MultiStoreContext);
    if (!context) throw new Error('useMultiStore must be used within a MultiStoreProvider');
    return context;
};

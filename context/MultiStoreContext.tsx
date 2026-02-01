
import React, { createContext, useContext, useState, useMemo } from 'react';
import {
    StoreBranch,
    POSTerminal,
    StorePerformance,
    OrganizationHeader
} from '../types/multiStore';
import { shopApi } from '../services/api/shopApi';

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

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const branches = await shopApi.getBranches();
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

                // Set organization name from first branch or defaults
                if (mappedStores.length > 0) {
                    setOrganization(prev => ({ ...prev, name: 'PBooks Enterprise', totalStores: mappedStores.length }));
                }
            } catch (error) {
                console.error('Failed to fetch stores:', error);
            }
        };
        fetchData();
    }, []);

    const updateStoreStatus = (storeId: string, status: any) => {
        setStores(prev => prev.map(s => s.id === storeId ? { ...s, status } : s));
    };

    const addStore = async (storeData: Omit<StoreBranch, 'id' | 'status'>) => {
        try {
            const response = await shopApi.createBranch({
                ...storeData,
                status: 'Active'
            }) as any;

            const newStore: StoreBranch = {
                ...storeData,
                id: response && response.id ? response.id : crypto.randomUUID(),
                status: 'Active'
            };
            setStores(prev => [...prev, newStore]);
        } catch (e) {
            console.error(e);
            // Fallback
            setStores(prev => [...prev, { ...storeData, id: crypto.randomUUID(), status: 'Active' }]);
        }
    };

    const lockTerminal = (terminalId: string) => {
        setTerminals(prev => prev.map(t => t.id === terminalId ? { ...t, status: 'Locked' } : t));
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
        addStore,
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

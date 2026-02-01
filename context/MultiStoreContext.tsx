
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
    const [organization] = useState<OrganizationHeader>({
        name: 'PBooks Retail Group (PVT) LTD',
        hqAddress: '7th Floor, Executive Tower, Karachi',
        totalStores: 12,
        centralCurrency: 'PKR',
        lastConsolidated: new Date().toISOString()
    });

    const [stores, setStores] = useState<StoreBranch[]>([
        { id: 'st-1', name: 'Karachi Flagship', code: 'KHI-01', type: 'Flagship', status: 'Active', location: 'DHA Phase 6', region: 'South', manager: 'Zubair Shah', contact: '+92-300-1234567', timezone: 'GMT+5', openTime: '10:00', closeTime: '22:00' },
        { id: 'st-2', name: 'Lahore Emporium', code: 'LHR-02', type: 'Express', status: 'Active', location: 'Johar Town', region: 'Central', manager: 'Mariam Ali', contact: '+92-300-7654321', timezone: 'GMT+5', openTime: '11:00', closeTime: '23:00' },
        { id: 'st-3', name: 'Islamabad Centaurus', code: 'ISB-01', type: 'Express', status: 'Active', location: 'Blue Area', region: 'North', manager: 'Kamran Jaffar', contact: '+92-300-9988776', timezone: 'GMT+5', openTime: '11:00', closeTime: '23:00' },
        { id: 'st-4', name: 'Central Warehouse', code: 'CWH-01', type: 'Warehouse', status: 'Active', location: 'Port Qasim', region: 'South', manager: 'Irfan Khan', contact: '+92-300-5554433', timezone: 'GMT+5', openTime: '08:00', closeTime: '20:00' },
        { id: 'st-5', name: 'Online Store', code: 'WEB-01', type: 'Virtual', status: 'Active', location: 'Cloud', region: 'Global', manager: 'Ayesha Aziz', contact: 'support@pbooks.com', timezone: 'GMT', openTime: '00:00', closeTime: '23:59' }
    ]);

    const [terminals, setTerminals] = useState<POSTerminal[]>([
        { id: 't-1', storeId: 'st-1', name: 'Main Counter 01', code: 'KHI-T1', status: 'Online', version: '2.4.1', lastSync: new Date().toISOString(), ipAddress: '192.168.1.45', healthScore: 98 },
        { id: 't-2', storeId: 'st-1', name: 'Express Lane 02', code: 'KHI-T2', status: 'Online', version: '2.4.1', lastSync: new Date().toISOString(), ipAddress: '192.168.1.46', healthScore: 95 },
        { id: 't-3', storeId: 'st-2', name: 'Front Desk', code: 'LHR-T1', status: 'Offline', version: '2.4.0', lastSync: new Date(Date.now() - 3600000).toISOString(), ipAddress: '10.0.4.12', healthScore: 82 },
        { id: 't-4', storeId: 'st-3', name: 'POS-01', code: 'ISB-T1', status: 'Online', version: '2.4.1', lastSync: new Date().toISOString(), ipAddress: '172.16.0.10', healthScore: 100 }
    ]);

    const [performance] = useState<StorePerformance[]>([
        { storeId: 'st-1', salesToday: 450000, salesMTD: 12500000, customerCount: 450, inventoryValue: 35000000, profitMargin: 24, variance: -0.5 },
        { storeId: 'st-2', salesToday: 280000, salesMTD: 8900000, customerCount: 210, inventoryValue: 18000000, profitMargin: 22, variance: 1.2 },
        { storeId: 'st-3', salesToday: 310000, salesMTD: 9200000, customerCount: 245, inventoryValue: 22000000, profitMargin: 25, variance: 0.8 },
        { storeId: 'st-5', salesToday: 185000, salesMTD: 5600000, customerCount: 890, inventoryValue: 0, profitMargin: 28, variance: 2.5 }
    ]);

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

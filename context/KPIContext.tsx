
import React, { createContext, useState, useContext, ReactNode, useCallback, useMemo, useEffect } from 'react';
import { ALL_KPIS } from '../components/dashboard/kpiDefinitions.ts';
import { reportDefinitions, ReportDefinition } from '../components/reports/reportDefinitions';
import { KpiDefinition, TransactionType, AccountType } from '../types';
import { useAccounts, useCategories } from '../hooks/useSelectiveState';
import { ICONS } from '../constants';
import { useDashboardPreferencesStore } from '../stores/dashboardPreferencesStore';

interface KPIContextType {
  isPanelOpen: boolean;
  togglePanel: () => void;
  // KPIs
  visibleKpiIds: string[];
  setVisibleKpiIds: React.Dispatch<React.SetStateAction<string[]>>;
  allKpis: KpiDefinition[];
  // Reports
  favoriteReportIds: string[];
  setFavoriteReportIds: React.Dispatch<React.SetStateAction<string[]>>;
  allReports: ReportDefinition[];
  // Panel State
  activePanelTab: 'kpis' | 'reports' | 'shortcuts';
  setActivePanelTab: React.Dispatch<React.SetStateAction<'kpis' | 'reports' | 'shortcuts'>>;
  // Drilldown
  activeDrilldownKpi: KpiDefinition | null;
  openDrilldown: (kpi: KpiDefinition) => void;
  closeDrilldown: () => void;
}

const KPIContext = createContext<KPIContextType | undefined>(undefined);

export const KPIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<'kpis' | 'reports' | 'shortcuts'>('kpis');
  const [activeDrilldownKpi, setActiveDrilldownKpi] = useState<KpiDefinition | null>(null);

  const visibleKpiIds = useDashboardPreferencesStore((s) => s.visibleKpiPanelIds);
  const setVisibleKpiPanelIds = useDashboardPreferencesStore((s) => s.setVisibleKpiPanelIds);
  const favoriteReportIds = useDashboardPreferencesStore((s) => s.favoriteReportIds);
  const setFavoriteReportIdsStore = useDashboardPreferencesStore((s) => s.setFavoriteReportIds);
  const migrateKpiPanelFromLegacy = useDashboardPreferencesStore((s) => s.migrateKpiPanelFromLegacy);

  useEffect(() => {
    migrateKpiPanelFromLegacy();
  }, [migrateKpiPanelFromLegacy]);

  const setVisibleKpiIds = useCallback<React.Dispatch<React.SetStateAction<string[]>>>(
    (action) => {
      setVisibleKpiPanelIds((prev) =>
        typeof action === 'function' ? action(prev) : action
      );
    },
    [setVisibleKpiPanelIds]
  );

  const setFavoriteReportIds = useCallback<React.Dispatch<React.SetStateAction<string[]>>>(
    (action) => {
      setFavoriteReportIdsStore((prev) =>
        typeof action === 'function' ? action(prev) : action
      );
    },
    [setFavoriteReportIdsStore]
  );

  const accounts = useAccounts();
  const categories = useCategories();

  const allReports = useMemo(() => reportDefinitions, []);

  const togglePanel = useCallback(() => {
    setIsPanelOpen(prev => !prev);
  }, []);
  
  const openDrilldown = useCallback((kpi: KpiDefinition) => {
      setActiveDrilldownKpi(kpi);
  }, []);

  const closeDrilldown = useCallback(() => {
      setActiveDrilldownKpi(null);
  }, []);

  const allKpis = useMemo(() => {
    const dynamicKpis: KpiDefinition[] = [];
    
    const bankAccounts = accounts.filter(acc => acc.type === AccountType.BANK);

    for (const account of bankAccounts) {
        dynamicKpis.push({
            id: `account-balance-${account.id}`,
            title: account.name,
            group: 'Bank Accounts',
            icon: ICONS.wallet,
            getData: (appState) => appState.accounts.find(a => a.id === account.id)?.balance || 0,
        });
    }

    for (const category of categories) {
        const isIncome = category.type === TransactionType.INCOME;
        
        const isDiscountCategory = !isIncome && [
            'Customer Discount', 'Floor Discount', 'Lump Sum Discount', 'Misc Discount'
        ].includes(category.name);

        dynamicKpis.push({
            id: isIncome ? `category-income-${category.id}` : `category-expense-${category.id}`,
            title: category.name,
            group: isIncome ? 'Income Categories' : 'Expense Categories',
            icon: isIncome ? ICONS.arrowDownCircle : ICONS.arrowUpCircle,
            getData: (appState) => {
                let total = appState.transactions
                    .filter(tx => tx.categoryId === category.id)
                    .reduce((sum, tx) => sum + tx.amount, 0);
                
                if (isDiscountCategory) {
                    appState.projectAgreements.forEach(pa => {
                        let discountAmt = 0;
                        if (category.name === 'Customer Discount') discountAmt = pa.customerDiscount;
                        else if (category.name === 'Floor Discount') discountAmt = pa.floorDiscount;
                        else if (category.name === 'Lump Sum Discount') discountAmt = pa.lumpSumDiscount;
                        else if (category.name === 'Misc Discount') discountAmt = pa.miscDiscount;
                        
                        total += (discountAmt || 0);
                    });
                }
                return total;
            }
        });
    }

    return [...ALL_KPIS, ...dynamicKpis];
  }, [accounts, categories]);

  const contextValue = useMemo(() => ({
    isPanelOpen,
    togglePanel,
    visibleKpiIds,
    setVisibleKpiIds,
    allKpis,
    favoriteReportIds,
    setFavoriteReportIds,
    allReports,
    activePanelTab,
    setActivePanelTab,
    activeDrilldownKpi,
    openDrilldown,
    closeDrilldown,
  }), [isPanelOpen, togglePanel, visibleKpiIds, setVisibleKpiIds, allKpis,
       favoriteReportIds, setFavoriteReportIds, allReports, activePanelTab,
       setActivePanelTab, activeDrilldownKpi, openDrilldown, closeDrilldown]);

  return (
    <KPIContext.Provider value={contextValue}>
      {children}
    </KPIContext.Provider>
  );
};

export const useKpis = () => {
  const context = useContext(KPIContext);
  if (context === undefined) {
    throw new Error('useKpis must be used within a KPIProvider');
  }
  return context;
};

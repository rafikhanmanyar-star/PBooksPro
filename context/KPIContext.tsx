
import React, { createContext, useState, useContext, ReactNode, useCallback, useMemo } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { ALL_KPIS } from '../components/dashboard/kpiDefinitions.ts';
import { reportDefinitions, ReportDefinition } from '../components/reports/reportDefinitions';
import { KpiDefinition, TransactionType, AccountType } from '../types';
import { useAppContext } from './AppContext';
import { ICONS } from '../constants';

const DEFAULT_VISIBLE_KPIS = [
    'totalBalance', 
    'netIncome',
    'projectFunds',
    'bmFunds',
    'accountsReceivable', 
    'accountsPayable', 
    'outstandingLoan',
    'occupiedUnits'
];
const DEFAULT_FAVORITE_REPORTS = ['rental-owner-payouts', 'project-summary'];

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

  const [visibleKpiIds, setVisibleKpiIds] = useLocalStorage<string[]>('kpiPanelVisibleIds_v5', DEFAULT_VISIBLE_KPIS);
  const [favoriteReportIds, setFavoriteReportIds] = useLocalStorage<string[]>('kpiPanelFavoriteReports_v1', DEFAULT_FAVORITE_REPORTS);

  const { state } = useAppContext();

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
    
    // Account Balances - Only BANK accounts (as per request for Total Balance group)
    const bankAccounts = state.accounts.filter(acc => acc.type === AccountType.BANK);

    for (const account of bankAccounts) {
        dynamicKpis.push({
            id: `account-balance-${account.id}`,
            title: account.name,
            group: 'Bank Accounts', // Renamed from 'Account Balances' for clarity
            icon: ICONS.wallet,
            getData: (appState) => appState.accounts.find(a => a.id === account.id)?.balance || 0,
        });
    }

    // Category KPIs (Income & Expense) - Including Discounts logic
    for (const category of state.categories) {
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
                
                // Inject discounts if this is a discount category
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
  }, [state.accounts, state.transactions, state.categories, state.projectAgreements]);

  return (
    <KPIContext.Provider value={{
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
    }}>
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

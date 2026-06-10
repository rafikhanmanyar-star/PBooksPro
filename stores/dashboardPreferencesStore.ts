import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DashboardChartWidgetId =
  | 'revenueVsExpenses'
  | 'receivablesAging'
  | 'cashFlowTrend'
  | 'salesPipeline'
  | 'expenseBreakdown'
  | 'collectionsPerformance';

export type DashboardKpiGroupId = 'financial' | 'realEstate' | 'activity';

export const DEFAULT_CHART_WIDGET_ORDER: DashboardChartWidgetId[] = [
  'revenueVsExpenses',
  'receivablesAging',
  'cashFlowTrend',
  'salesPipeline',
  'expenseBreakdown',
  'collectionsPerformance',
];

export const CHART_WIDGET_LABELS: Record<DashboardChartWidgetId, string> = {
  revenueVsExpenses: 'Revenue vs Expenses',
  receivablesAging: 'Receivables Aging',
  cashFlowTrend: 'Cash Flow Trend',
  salesPipeline: 'Sales Pipeline',
  expenseBreakdown: 'Expense Breakdown',
  collectionsPerformance: 'Collections Performance',
};

export const DEFAULT_KPI_GROUP_ORDER: DashboardKpiGroupId[] = [
  'financial',
  'realEstate',
  'activity',
];

/** Default KPI panel selection (matches legacy KPIContext). */
export const DEFAULT_VISIBLE_KPI_PANEL_IDS = [
  'totalBalance',
  'netIncome',
  'projectFunds',
  'bmFunds',
  'accountsReceivable',
  'accountsPayable',
  'outstandingLoan',
  'occupiedUnits',
];

export const DEFAULT_FAVORITE_REPORT_IDS = ['rental-owner-payouts', 'project-summary'];

const LEGACY_KPI_PANEL_KEY = 'kpiPanelVisibleIds_v5';
const LEGACY_FAVORITE_REPORTS_KEY = 'kpiPanelFavoriteReports_v1';

function readLegacyJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function migrateLegacyKpiPanelPrefs(): {
  visibleKpiPanelIds?: string[];
  favoriteReportIds?: string[];
} {
  const patch: { visibleKpiPanelIds?: string[]; favoriteReportIds?: string[] } = {};
  const legacyKpis = readLegacyJson<string[]>(LEGACY_KPI_PANEL_KEY);
  const legacyReports = readLegacyJson<string[]>(LEGACY_FAVORITE_REPORTS_KEY);
  if (legacyKpis?.length) patch.visibleKpiPanelIds = legacyKpis;
  if (legacyReports?.length) patch.favoriteReportIds = legacyReports;
  return patch;
}

interface DashboardPreferencesState {
  chartWidgetOrder: DashboardChartWidgetId[];
  hiddenChartWidgets: Partial<Record<DashboardChartWidgetId, boolean>>;
  kpiGroupOrder: DashboardKpiGroupId[];
  visibleKpiPanelIds: string[];
  favoriteReportIds: string[];
  kpiPanelMigrated: boolean;
  setChartWidgetOrder: (order: DashboardChartWidgetId[]) => void;
  toggleChartWidget: (id: DashboardChartWidgetId) => void;
  resetChartWidgets: () => void;
  setKpiGroupOrder: (order: DashboardKpiGroupId[]) => void;
  resetKpiGroups: () => void;
  setVisibleKpiPanelIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  setFavoriteReportIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  migrateKpiPanelFromLegacy: () => void;
}

export const useDashboardPreferencesStore = create<DashboardPreferencesState>()(
  persist(
    (set, get) => ({
      chartWidgetOrder: [...DEFAULT_CHART_WIDGET_ORDER],
      hiddenChartWidgets: {},
      kpiGroupOrder: [...DEFAULT_KPI_GROUP_ORDER],
      visibleKpiPanelIds: [...DEFAULT_VISIBLE_KPI_PANEL_IDS],
      favoriteReportIds: [...DEFAULT_FAVORITE_REPORT_IDS],
      kpiPanelMigrated: false,
      setChartWidgetOrder: (order) => set({ chartWidgetOrder: order }),
      toggleChartWidget: (id) => {
        const hidden = { ...get().hiddenChartWidgets };
        hidden[id] = !hidden[id];
        set({ hiddenChartWidgets: hidden });
      },
      resetChartWidgets: () =>
        set({
          chartWidgetOrder: [...DEFAULT_CHART_WIDGET_ORDER],
          hiddenChartWidgets: {},
        }),
      setKpiGroupOrder: (order) => set({ kpiGroupOrder: order }),
      resetKpiGroups: () => set({ kpiGroupOrder: [...DEFAULT_KPI_GROUP_ORDER] }),
      setVisibleKpiPanelIds: (ids) =>
        set({
          visibleKpiPanelIds: typeof ids === 'function' ? ids(get().visibleKpiPanelIds) : ids,
        }),
      setFavoriteReportIds: (ids) =>
        set({
          favoriteReportIds: typeof ids === 'function' ? ids(get().favoriteReportIds) : ids,
        }),
      migrateKpiPanelFromLegacy: () => {
        if (get().kpiPanelMigrated) return;
        const legacy = migrateLegacyKpiPanelPrefs();
        set({
          ...legacy,
          kpiPanelMigrated: true,
        });
      },
    }),
    {
      name: 'pbooks-dashboard-preferences-v2',
      onRehydrateStorage: () => (state) => {
        state?.migrateKpiPanelFromLegacy();
      },
    }
  )
);

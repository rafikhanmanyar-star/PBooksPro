/**
 * Selective State Subscription Hooks
 * 
 * These hooks let components subscribe to specific slices of AppState,
 * avoiding re-renders when unrelated state changes.
 * 
 * Components using useAppContext() re-render on EVERY state change (155+ consumers).
 * These hooks use useSyncExternalStore to only trigger re-renders when the
 * selected slice actually changes (by reference).
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
    _getAppState,
    _getAppDispatch,
    _getInitialDataLoading,
    _getAppDataLoading,
    _getPageChunkLoading,
    _getBootstrapSoftFailure,
    _subscribeAppState,
    type BootstrapSoftFailureState,
} from '../context/appStateStore';
import { AppState, AppAction } from '../types';
import { useGatedStateSelector } from './useGatedSubscription';

/**
 * Subscribe to a specific slice of AppState.
 * Only triggers a re-render when the selected value changes (by reference).
 *
 * PERF-A2.3: Inside an inactive `PageActiveScope`, suspends the subscription and
 * returns the last snapshot (no rerenders). Header/Sidebar are outside scope — always live.
 *
 * IMPORTANT: The selector should return a value with a stable reference when
 * the underlying data hasn't changed. Selecting a single array (e.g. s => s.bills)
 * works perfectly. Avoid creating new objects/arrays in the selector.
 *
 * Usage:
 *   const transactions = useStateSelector(s => s.transactions);
 *   const bills = useStateSelector(s => s.bills);
 */
export function useStateSelector<T>(selector: (state: AppState) => T): T {
    return useGatedStateSelector(selector);
}

/**
 * @deprecated Use useStateSelector instead for true selective re-rendering.
 * This wrapper exists for backward compatibility.
 */
export function useStateSlice<T>(selector: (state: AppState) => T): T {
    return useStateSelector(selector);
}

/**
 * Get only the accounts array. Only re-renders when accounts change.
 */
export function useAccounts() {
    return useStateSelector(s => s.accounts);
}

/**
 * Get only the transactions array. Only re-renders when transactions change.
 */
export function useTransactions() {
    return useStateSelector(s => s.transactions);
}

/**
 * Get only the contacts array. Only re-renders when contacts change.
 */
export function useContacts() {
    return useStateSelector(s => s.contacts);
}

/**
 * Get only the invoices array. Only re-renders when invoices change.
 */
export function useInvoices() {
    return useStateSelector(s => s.invoices);
}

/**
 * Get only the bills array. Only re-renders when bills change.
 */
export function useBills() {
    return useStateSelector(s => s.bills);
}

/**
 * Get only the categories array. Only re-renders when categories change.
 */
export function useCategories() {
    return useStateSelector(s => s.categories);
}

/**
 * Get only the projects array. Only re-renders when projects change.
 */
export function useProjects() {
    return useStateSelector(s => s.projects);
}

/**
 * Get only the buildings array. Only re-renders when buildings change.
 */
export function useBuildings() {
    return useStateSelector(s => s.buildings);
}

/**
 * Get only the properties array. Only re-renders when properties change.
 */
export function useProperties() {
    return useStateSelector(s => s.properties);
}

/**
 * Get only the units array. Only re-renders when units change.
 */
export function useUnits() {
    return useStateSelector(s => s.units);
}

/**
 * Get only the rentalAgreements array. Only re-renders when rentalAgreements change.
 */
export function useRentalAgreements() {
    return useStateSelector(s => s.rentalAgreements);
}

/**
 * Get only the vendors array. Only re-renders when vendors change.
 */
export function useVendors() {
    return useStateSelector(s => s.vendors);
}

export function useQuotations() {
    return useStateSelector(s => s.quotations);
}

export function useProjectAgreements() {
    return useStateSelector(s => s.projectAgreements);
}

export function useSalesReturns() {
    return useStateSelector(s => s.salesReturns);
}

export function useProjectReceivedAssets() {
    return useStateSelector(s => s.projectReceivedAssets);
}

export function useContracts() {
    return useStateSelector(s => s.contracts);
}

export function useBudgets() {
    return useStateSelector(s => s.budgets);
}

export function useDocuments() {
    return useStateSelector(s => s.documents);
}

export function useCurrentUser() {
    return useStateSelector(s => s.currentUser);
}

export function usePersonalTransactions() {
    return useStateSelector(s => s.personalTransactions);
}

export function usePersonalCategories() {
    return useStateSelector(s => s.personalCategories);
}

export function useInstallmentPlans() {
    return useStateSelector(s => s.installmentPlans);
}

export function usePlanAmenities() {
    return useStateSelector(s => s.planAmenities);
}

export function usePmCycleAllocations() {
    return useStateSelector(s => s.pmCycleAllocations);
}

export function usePrintSettings() {
    return useStateSelector(s => s.printSettings);
}

/** Payroll payment modals: accounts, categories, projects, buildings, transactions, current user. */
export function usePayrollPaymentState() {
    const accounts = useAccounts();
    const categories = useCategories();
    const projects = useProjects();
    const buildings = useBuildings();
    const transactions = useTransactions();
    const currentUser = useCurrentUser();
    return { accounts, categories, projects, buildings, transactions, currentUser };
}

/** Dashboard budget widgets: budgets, categories, projects, transactions, bills, invoices. */
export function useBudgetDashboardState() {
    const budgets = useBudgets();
    const categories = useCategories();
    const projects = useProjects();
    const transactions = useTransactions();
    const bills = useBills();
    const invoices = useInvoices();
    const defaultProjectId = useStateSelector((s) => s.defaultProjectId);
    return { budgets, categories, projects, transactions, bills, invoices, defaultProjectId };
}

/** Payroll hub: ledger reconciliation against payslip-linked transactions. */
export function usePayrollHubState() {
    const accounts = useAccounts();
    const transactions = useTransactions();
    const whatsAppMode = useWhatsAppMode();
    return { accounts, transactions, whatsAppMode };
}

/** KPI panel / drilldown: financial + rental slices used by KPI getData(). */
export function useKPIAppState(): AppState {
    const accounts = useAccounts();
    const categories = useCategories();
    const projects = useProjects();
    const transactions = useTransactions();
    const bills = useBills();
    const invoices = useInvoices();
    const buildings = useBuildings();
    const properties = useProperties();
    const contacts = useContacts();
    const rentalAgreements = useRentalAgreements();
    return useMemo(
        () => _getAppState(),
        [accounts, categories, projects, transactions, bills, invoices, buildings, properties, contacts, rentalAgreements]
    );
}

/** Settings page: entity catalogs + preferences. */
export function useSettingsPageState(): AppState {
    const accounts = useAccounts();
    const categories = useCategories();
    const projects = useProjects();
    const buildings = useBuildings();
    const properties = useProperties();
    const contacts = useContacts();
    const units = useUnits();
    const transactions = useTransactions();
    const projectAgreements = useProjectAgreements();
    const currentUser = useCurrentUser();
    const users = useUsers();
    const projectInvoiceSettings = useStateSelector((s) => s.projectInvoiceSettings);
    const showSystemTransactions = useStateSelector((s) => s.showSystemTransactions);
    const enableColorCoding = useStateSelector((s) => s.enableColorCoding);
    const enableBeepOnSave = useStateSelector((s) => s.enableBeepOnSave);
    const enableDatePreservation = useStateSelector((s) => s.enableDatePreservation);
    const whatsAppMode = useWhatsAppMode();
    const defaultProjectId = useStateSelector((s) => s.defaultProjectId);
    const rentalInvoiceSettings = useStateSelector((s) => s.rentalInvoiceSettings);
    const agreementSettings = useStateSelector((s) => s.agreementSettings);
    const projectAgreementSettings = useStateSelector((s) => s.projectAgreementSettings);
    const editingEntity = useStateSelector((s) => s.editingEntity);
    return useMemo(
        () => _getAppState(),
        [
            accounts,
            categories,
            projects,
            buildings,
            properties,
            contacts,
            units,
            transactions,
            projectAgreements,
            currentUser,
            users,
            projectInvoiceSettings,
            showSystemTransactions,
            enableColorCoding,
            enableBeepOnSave,
            enableDatePreservation,
            whatsAppMode,
            defaultProjectId,
            rentalInvoiceSettings,
            agreementSettings,
            projectAgreementSettings,
            editingEntity,
        ]
    );
}

/** Import / export wizard: broad entity coverage for full backup files. */
export function useImportExportState(): AppState {
    const accounts = useAccounts();
    const contacts = useContacts();
    const vendors = useVendors();
    const categories = useCategories();
    const projects = useProjects();
    const buildings = useBuildings();
    const properties = useProperties();
    const units = useUnits();
    const transactions = useTransactions();
    const invoices = useInvoices();
    const bills = useBills();
    const budgets = useBudgets();
    const contracts = useContracts();
    const quotations = useQuotations();
    const documents = useDocuments();
    return useMemo(
        () => _getAppState(),
        [
            accounts,
            contacts,
            vendors,
            categories,
            projects,
            buildings,
            properties,
            units,
            transactions,
            invoices,
            bills,
            budgets,
            contracts,
            quotations,
            documents,
        ]
    );
}

/** Personal finance tab + modals. */
export function usePersonalFinanceState() {
    const personalTransactions = usePersonalTransactions();
    const personalCategories = usePersonalCategories();
    const accounts = useAccounts();
    const currentUser = useCurrentUser();
    return { personalTransactions, personalCategories, accounts, currentUser };
}

/** Assets / contacts settings grids. */
export function useEntityCatalogState(): AppState {
    const projects = useProjects();
    const buildings = useBuildings();
    const properties = useProperties();
    const units = useUnits();
    const contacts = useContacts();
    const transactions = useTransactions();
    return useMemo(
        () => _getAppState(),
        [projects, buildings, properties, units, contacts, transactions]
    );
}

/** Marketing / project selling page. */
export function useMarketingPageState(): AppState {
    const projects = useProjects();
    const units = useUnits();
    const contacts = useContacts();
    const categories = useCategories();
    const invoices = useInvoices();
    const documents = useDocuments();
    const projectAgreements = useProjectAgreements();
    const installmentPlans = useInstallmentPlans();
    const planAmenities = usePlanAmenities();
    const currentUser = useCurrentUser();
    const users = useUsers();
    const agreementSettings = useStateSelector((s) => s.agreementSettings);
    const projectAgreementSettings = useStateSelector((s) => s.projectAgreementSettings);
    const projectInvoiceSettings = useStateSelector((s) => s.projectInvoiceSettings);
    const editingEntity = useStateSelector((s) => s.editingEntity);
    return useMemo(
        () => _getAppState(),
        [
            projects,
            units,
            contacts,
            categories,
            invoices,
            documents,
            projectAgreements,
            installmentPlans,
            planAmenities,
            currentUser,
            users,
            agreementSettings,
            projectAgreementSettings,
            projectInvoiceSettings,
            editingEntity,
        ]
    );
}

export function useTransactionLog() {
    return useStateSelector((s) => s.transactionLog);
}

export function useErrorLog() {
    return useStateSelector((s) => s.errorLog);
}

export function useEditingEntity() {
    return useStateSelector((s) => s.editingEntity);
}

export function useWarehouses() {
    return useStateSelector((s) => (s as AppState & { warehouses?: unknown[] }).warehouses ?? []);
}

export function useWhatsAppTemplates() {
    return useStateSelector(s => s.whatsAppTemplates);
}

export function useWhatsAppMode() {
    return useStateSelector(s => s.whatsAppMode);
}

export function useUsers() {
    return useStateSelector(s => s.users);
}

/**
 * Subscribe to all AppState slices. Use when a component reads many fields or passes full state to utilities.
 * Prefer narrower hooks (useAccounts, useFinancialReportAppState, etc.) in new code.
 */
export function useFullAppState(): AppState {
    const accounts = useAccounts();
    const transactions = useTransactions();
    const categories = useCategories();
    const bills = useBills();
    const invoices = useInvoices();
    const vendors = useVendors();
    const contacts = useContacts();
    const projects = useProjects();
    const buildings = useBuildings();
    const properties = useProperties();
    const units = useUnits();
    const rentalAgreements = useRentalAgreements();
    const projectAgreements = useProjectAgreements();
    const salesReturns = useSalesReturns();
    const projectReceivedAssets = useProjectReceivedAssets();
    const contracts = useContracts();
    const quotations = useQuotations();
    const budgets = useBudgets();
    const documents = useDocuments();
    const currentUser = useCurrentUser();
    const personalTransactions = usePersonalTransactions();
    const personalCategories = usePersonalCategories();
    const installmentPlans = useInstallmentPlans();
    const planAmenities = usePlanAmenities();
    const pmCycleAllocations = usePmCycleAllocations();
    const printSettings = usePrintSettings();
    const whatsAppTemplates = useWhatsAppTemplates();
    const whatsAppMode = useWhatsAppMode();
    const users = useUsers();
    const cashFlowCategoryMappings = useStateSelector((s) => s.cashFlowCategoryMappings);
    const agreementSettings = useStateSelector((s) => s.agreementSettings);
    const projectAgreementSettings = useStateSelector((s) => s.projectAgreementSettings);
    const rentalInvoiceSettings = useStateSelector((s) => s.rentalInvoiceSettings);
    const projectInvoiceSettings = useStateSelector((s) => s.projectInvoiceSettings);
    const dashboardConfig = useStateSelector((s) => s.dashboardConfig);
    const accountConsistency = useStateSelector((s) => s.accountConsistency);
    const recurringInvoiceTemplates = useStateSelector((s) => s.recurringInvoiceTemplates);
    const transactionLog = useStateSelector((s) => s.transactionLog);
    const errorLog = useStateSelector((s) => s.errorLog);
    const pmCostPercentage = useStateSelector((s) => s.pmCostPercentage);
    const defaultProjectId = useStateSelector((s) => s.defaultProjectId);
    const enableColorCoding = useStateSelector((s) => s.enableColorCoding);
    const showSystemTransactions = useStateSelector((s) => s.showSystemTransactions);
    return useMemo(
        () => _getAppState(),
        [
            accounts,
            transactions,
            categories,
            bills,
            invoices,
            vendors,
            contacts,
            projects,
            buildings,
            properties,
            units,
            rentalAgreements,
            projectAgreements,
            salesReturns,
            projectReceivedAssets,
            contracts,
            quotations,
            budgets,
            documents,
            currentUser,
            personalTransactions,
            personalCategories,
            installmentPlans,
            planAmenities,
            pmCycleAllocations,
            printSettings,
            whatsAppTemplates,
            whatsAppMode,
            users,
            cashFlowCategoryMappings,
            agreementSettings,
            projectAgreementSettings,
            rentalInvoiceSettings,
            projectInvoiceSettings,
            dashboardConfig,
            accountConsistency,
            recurringInvoiceTemplates,
            transactionLog,
            errorLog,
            pmCostPercentage,
            defaultProjectId,
            enableColorCoding,
            showSystemTransactions,
        ]
    );
}

/**
 * Project-management screens: agreements, units, contracts, sales returns, received assets, PM config.
 */
export function useProjectReportAppState(): AppState {
    const projects = useProjects();
    const units = useUnits();
    const contacts = useContacts();
    const categories = useCategories();
    const invoices = useInvoices();
    const bills = useBills();
    const transactions = useTransactions();
    const accounts = useAccounts();
    const projectAgreements = useProjectAgreements();
    const salesReturns = useSalesReturns();
    const projectReceivedAssets = useProjectReceivedAssets();
    const contracts = useContracts();
    const vendors = useVendors();
    const installmentPlans = useInstallmentPlans();
    const planAmenities = usePlanAmenities();
    const pmCycleAllocations = usePmCycleAllocations();
    const pmCostPercentage = useStateSelector((s) => s.pmCostPercentage);
    const defaultProjectId = useStateSelector((s) => s.defaultProjectId);
    const currentUser = useCurrentUser();
    const projectAgreementSettings = useStateSelector((s) => s.projectAgreementSettings);
    const projectInvoiceSettings = useStateSelector((s) => s.projectInvoiceSettings);
    const enableColorCoding = useStateSelector((s) => s.enableColorCoding);
    const enableDatePreservation = useStateSelector((s) => s.enableDatePreservation);
    return useMemo(
        () => _getAppState(),
        [
            projects,
            units,
            contacts,
            categories,
            invoices,
            bills,
            transactions,
            accounts,
            projectAgreements,
            salesReturns,
            projectReceivedAssets,
            contracts,
            vendors,
            installmentPlans,
            planAmenities,
            pmCycleAllocations,
            pmCostPercentage,
            defaultProjectId,
            currentUser,
            projectAgreementSettings,
            projectInvoiceSettings,
            enableColorCoding,
            enableDatePreservation,
        ]
    );
}

/**
 * Get dispatch without subscribing to state changes.
 * Uses module-level dispatch ref, so this hook never causes re-renders.
 */
export function useDispatchOnly(): React.Dispatch<AppAction> {
    const dispatchRef = useRef(_getAppDispatch());
    return dispatchRef.current;
}

/**
 * Subscribe to isInitialDataLoading flag without subscribing to full state.
 * Only re-renders when the flag changes (typically once during init).
 */
export function useInitialDataLoading(): boolean {
    const getSnapshot = useCallback(() => _getInitialDataLoading(), []);
    return useSyncExternalStore(_subscribeAppState, getSnapshot);
}

/** True while SQLite/API hydration or lazy page chunks are still loading. */
export function useAppDataLoading(): boolean {
    const getSnapshot = useCallback(() => _getAppDataLoading(), []);
    return useSyncExternalStore(_subscribeAppState, getSnapshot);
}

/** Non-blocking bootstrap soft-failure banner (PERF-P3 overlay recovery). */
export function useBootstrapSoftFailure(): BootstrapSoftFailureState {
    const getSnapshot = useCallback(() => _getBootstrapSoftFailure(), []);
    return useSyncExternalStore(_subscribeAppState, getSnapshot);
}

/** True while a lazy route chunk is loading (Suspense fallback mounted). */
export function usePageChunkLoading(): boolean {
    const getSnapshot = useCallback(() => _getPageChunkLoading(), []);
    return useSyncExternalStore(_subscribeAppState, getSnapshot);
}

/**
 * Subscribe to financial-report slices only (not personal tasks, UI prefs, etc.).
 * Re-renders when any underlying slice changes; returns full AppState for local compute engines.
 */
export function useFinancialReportAppState(): AppState {
    const accounts = useAccounts();
    const transactions = useTransactions();
    const categories = useCategories();
    const bills = useBills();
    const invoices = useInvoices();
    const vendors = useVendors();
    const contacts = useContacts();
    const projects = useProjects();
    const projectAgreements = useStateSelector((s) => s.projectAgreements);
    const rentalAgreements = useRentalAgreements();
    const projectReceivedAssets = useStateSelector((s) => s.projectReceivedAssets);
    const units = useUnits();
    const cashFlowCategoryMappings = useStateSelector((s) => s.cashFlowCategoryMappings);
    return useMemo(
        () => _getAppState(),
        [
            accounts,
            transactions,
            categories,
            bills,
            invoices,
            vendors,
            contacts,
            projects,
            projectAgreements,
            rentalAgreements,
            projectReceivedAssets,
            units,
            cashFlowCategoryMappings,
        ]
    );
}

/**
 * Subscribe to rental-report slices only (portfolio tree, owner income, security deposit, receivables).
 */
export function useRentalReportAppState(): AppState {
    const buildings = useBuildings();
    const properties = useProperties();
    const contacts = useContacts();
    const transactions = useTransactions();
    const categories = useCategories();
    const bills = useBills();
    const invoices = useInvoices();
    const rentalAgreements = useRentalAgreements();
    const units = useUnits();
    const projects = useProjects();
    const agreementSettings = useStateSelector((s) => s.agreementSettings);
    const rentalInvoiceSettings = useStateSelector((s) => s.rentalInvoiceSettings);
    const currentUser = useCurrentUser();
    const enableColorCoding = useStateSelector((s) => s.enableColorCoding);
    const enableDatePreservation = useStateSelector((s) => s.enableDatePreservation);
    const whatsAppTemplates = useStateSelector((s) => s.whatsAppTemplates);
    const whatsAppMode = useStateSelector((s) => s.whatsAppMode);
    return useMemo(
        () => _getAppState(),
        [
            buildings,
            properties,
            contacts,
            transactions,
            categories,
            bills,
            invoices,
            rentalAgreements,
            units,
            projects,
            agreementSettings,
            rentalInvoiceSettings,
            currentUser,
            enableColorCoding,
            enableDatePreservation,
            whatsAppTemplates,
            whatsAppMode,
        ]
    );
}

export {
    selectAccounts,
    selectBills,
    selectBuildings,
    selectCategories,
    selectContacts,
    selectContracts,
    selectCurrentPage,
    selectCurrentUser,
    selectDefaultProjectId,
    selectEnableColorCoding,
    selectInitialTabs,
    selectInstallmentPlans,
    selectInvoices,
    selectProjectAgreements,
    selectProjects,
    selectProperties,
    selectRentalAgreements,
    selectShowSystemTransactions,
    selectTransactions,
    selectUnits,
    selectUsers,
    selectVendors,
    selectWhatsAppMode,
    selectWhatsAppTemplates,
} from './appStateSelectors';

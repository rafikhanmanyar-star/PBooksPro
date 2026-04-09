
import React, { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import Tabs from '../ui/Tabs';
import { ICONS, CURRENCY } from '../../constants';
import SettingsDetailPage from './SettingsDetailPage';
import { useKpis } from '../../context/KPIContext';
import ErrorLogViewer from './ErrorLogViewer';
import TransactionLogViewer from './TransactionLogViewer';
import MessagingTemplatesForm from './MessagingTemplatesForm';
import PrintTemplateForm from './PrintTemplateForm';
import WhatsAppConfigForm from './WhatsAppConfigForm';
import WhatsAppMenuForm from './WhatsAppMenuForm';
import HelpSection from './HelpSection';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import { Project, ContactType, TransactionType, AccountType, ProjectAgreementStatus, AgreementSettings, InvoiceSettings, ProfitLossSubType } from '../../types';
import SettingsLedgerModal from './SettingsLedgerModal';
import DatabaseAnalyzer from './DatabaseAnalyzer';
import UpdateCheck from './UpdateCheck';
import { CompanyManagementSection } from '../company/CompanyManagementSection';
import DbHealthPanel from '../diagnostics/DbHealthPanel';
import ManualJournalEntrySection from './ManualJournalEntrySection';
import PropertyTransferModal from './PropertyTransferModal';
import LicenseManagement from '../license/LicenseManagement';
import { Property } from '../../types';
import ClearTransactionsModal from './ClearTransactionsModal';
import { dataManagementApi } from '../../services/api/repositories/dataManagementApi';
import { getDatabaseService } from '../../services/database/databaseService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useCompanyOptional } from '../../context/CompanyContext';
import { useSpellCheckerOptional, SPELLCHECK_LANGUAGE_OPTIONS } from '../../context/SpellCheckerContext';
import { useTheme } from '../../context/ThemeContext';
import { getDisplayTimeZone, setDisplayTimeZone } from '../../utils/dateUtils';
import { persistUserDisplayTimezone } from '../../services/userDisplayTimezonePersist';

const UserManagement = lazy(() => import('./UserManagement'));
const BackupRestorePage = lazy(() => import('./BackupRestorePage'));
const ContactsManagement = lazy(() => import('./ContactsManagement'));
const AssetsManagement = lazy(() => import('./AssetsManagement'));

const PL_CLASSIFICATION_LABELS: Record<ProfitLossSubType, string> = {
    revenue: 'Revenue',
    cost_of_sales: 'Cost of sales',
    operating_expense: 'Operating expense',
    other_income: 'Other income',
    finance_cost: 'Finance costs',
    tax: 'Tax',
};

interface TableRowData {
    id: string;
    [key: string]: any;
    originalItem: any;
    entityKind?: string;
    level?: number;
}

interface ColumnDef {
    key: string;
    label: string;
    isNumeric?: boolean;
    render?: (value: any, row: any) => React.ReactNode;
}

/** City/region label from IANA id (e.g. `America/New_York` → `New York`) for searchable display. */
function ianaTimeZoneCityLabel(iana: string): string {
    return (iana.split('/').pop() || iana).replace(/_/g, ' ');
}

const SettingsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { user: authUser } = useAuth();
    const { showConfirm, showToast, showAlert } = useNotification();
    const { setVisibleKpiIds } = useKpis();
    const { isOffline } = useOffline();
    const companyCtx = useCompanyOptional();
    const spellCtx = useSpellCheckerOptional();
    const { theme, setTheme } = useTheme();

    // Detect Mobile
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [activeCategory, setActiveCategory] = useState('preferences');

    // Custom Event Listeners
    useEffect(() => {
        const handleOpenData = () => setActiveCategory('data');
        window.addEventListener('open-data-management-section', handleOpenData);
        return () => window.removeEventListener('open-data-management-section', handleOpenData);
    }, []);

    useEffect(() => {
        const handleOpenBackup = () => setActiveCategory('backup');
        window.addEventListener('open-backup-restore-section', handleOpenBackup);
        return () => window.removeEventListener('open-backup-restore-section', handleOpenBackup);
    }, []);

    // Close dropdown and reset filter when navigating away from accounts view
    useEffect(() => {
        if (activeCategory !== 'accounts') {
            setIsAddNewMenuOpen(false);
            setAccountsTypeFilter('all');
        }
    }, [activeCategory]);

    const [searchQuery, setSearchQuery] = useState('');
    type AccountsFilterType = 'all' | 'bank' | 'expense' | 'income' | 'equity';
    const [accountsTypeFilter, setAccountsTypeFilter] = useState<AccountsFilterType>('all');
    const [isErrorLogOpen, setIsErrorLogOpen] = useState(false);
    const [isTransactionLogOpen, setIsTransactionLogOpen] = useState(false);
    const [activePreferenceModal, setActivePreferenceModal] = useState<'messaging' | 'print' | 'whatsapp' | 'whatsapp-menu' | null>(null);
    const [activePreferenceTab, setActivePreferenceTab] = useState<string>('General');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'asc' });
    const [ledgerModalState, setLedgerModalState] = useState<{ isOpen: boolean; entityId: string; entityType: 'account' | 'category' | 'contact' | 'project' | 'building' | 'property' | 'unit'; entityName: string } | null>(null);
    const [propertyToTransfer, setPropertyToTransfer] = useState<Property | null>(null);
    const [isAddNewMenuOpen, setIsAddNewMenuOpen] = useState(false);
    const [isClearTransactionsModalOpen, setIsClearTransactionsModalOpen] = useState(false);
    const [displayTz, setDisplayTz] = useState<string>(() => getDisplayTimeZone() ?? 'auto');

    useEffect(() => {
        const sync = () => setDisplayTz(getDisplayTimeZone() ?? 'auto');
        window.addEventListener('pbooks-display-timezone-change', sync);
        return () => window.removeEventListener('pbooks-display-timezone-change', sync);
    }, []);

    const ianaTimeZones = useMemo(() => {
        try {
            if (typeof Intl !== 'undefined' && typeof (Intl as any).supportedValuesOf === 'function') {
                return [...((Intl as any).supportedValuesOf('timeZone') as string[])].sort();
            }
        } catch {
            /* ignore */
        }
        return [] as string[];
    }, []);

    const displayTimeZoneComboItems = useMemo(() => {
        const auto = { id: 'auto', name: 'Use device (browser local time)' };
        return [
            auto,
            ...ianaTimeZones.map((tz) => ({
                id: tz,
                name: `${ianaTimeZoneCityLabel(tz)} · ${tz}`,
            })),
        ];
    }, [ianaTimeZones]);

    // Check if user is admin - use AuthContext user (cloud auth), AppContext currentUser (local), or CompanyContext (local-only company login)
    const isAdmin = authUser?.role === 'Admin' || state.currentUser?.role === 'Admin' || companyCtx?.authenticatedUser?.role === 'SUPER_ADMIN';

    // User Management: visible when admin (cloud/local) OR when in local-only mode with a company open (user created company and is logged in)
    const showUserManagement = isAdmin || (isLocalOnlyMode() && !!companyCtx?.activeCompany);

    // Grouped Categories for Sidebar
    const categoryGroups = [
        ...(isLocalOnlyMode() ? [{
            title: 'Company',
            items: [
                { id: 'company-manage', label: 'Company Management', icon: ICONS.briefcase || '🏢' },
                { id: 'db-health', label: 'Database Health', icon: ICONS.archive },
            ]
        }] : []),
        {
            title: 'General',
            items: [
                { id: 'preferences', label: 'Preferences', icon: ICONS.settings },
                { id: 'license', label: 'License & Subscription', icon: ICONS.lock || '🔒' },
                ...(showUserManagement ? [
                    { id: 'users', label: 'User Management', icon: ICONS.users },
                ] : []),
                { id: 'backup', label: 'Backup & Restore', icon: ICONS.download },
                { id: 'data', label: 'Data Management', icon: ICONS.trash },
                { id: 'help', label: 'Help & Guide', icon: ICONS.fileText },
            ]
        },
        {
            title: 'Financial',
            items: [
                { id: 'accounts', label: 'Chart of Accounts', icon: ICONS.wallet },
                ...(isLocalOnlyMode() ? [{ id: 'gl-journal', label: 'Journal entry (GL)', icon: ICONS.fileText }] : []),
            ]
        },
        {
            title: 'Assets',
            items: [
                { id: 'assets', label: 'Assets', icon: ICONS.archive },
            ]
        },
        {
            title: 'Contacts',
            items: [
                { id: 'contacts', label: 'Contacts', icon: ICONS.addressBook },
            ]
        }
    ];

    const flatCategories = categoryGroups.flatMap(g => g.items);

    const settingCategories = useMemo(() => {
        return flatCategories;
    }, [showUserManagement, flatCategories]);

    // --- Data Preparation Logic (Preserved) ---
    const columnConfig: Record<string, ColumnDef[]> = {
        accounts: [
            {
                key: 'name', label: 'Name', render: (val, row) => (
                    <div style={{ paddingLeft: `${(row.level || 0) * 20}px` }} className="flex items-center gap-2">
                        {row.level && row.level > 0 ? <span className="text-slate-300">└</span> : null}
                        {val}
                    </div>
                )
            },
            { key: 'type', label: 'Type' },
            {
                key: 'plClassification',
                label: 'P&L classification',
                render: (val, row) =>
                    row.entityKind !== 'CATEGORY' ? (
                        <span className="text-slate-400">—</span>
                    ) : val === 'Default (inferred)' ? (
                        <span className="text-slate-500 italic">Default (inferred)</span>
                    ) : (
                        val
                    ),
            },
            { key: 'isSystem', label: 'System', render: (val) => val ? 'Yes' : 'No' },
            { key: 'balance', label: 'Balance', isNumeric: true }
        ],
        projects: [
            {
                key: 'name', label: 'Name', render: (val, row) => (
                    <div className="flex items-center gap-2">
                        {row.originalItem.color && <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: row.originalItem.color }}></div>}
                        <span className="font-medium text-slate-700">{val}</span>
                    </div>
                )
            },
            { key: 'description', label: 'Description' },
            { key: 'installmentPlan', label: 'Installments' },
            { key: 'balance', label: 'Balance', isNumeric: true }
        ],
        buildings: [
            {
                key: 'name', label: 'Name', render: (val, row) => (
                    <div className="flex items-center gap-2">
                        {row.originalItem.color && <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: row.originalItem.color }}></div>}
                        <span className="font-medium text-slate-700">{val}</span>
                    </div>
                )
            },
            { key: 'description', label: 'Description' },
            { key: 'balance', label: 'Balance', isNumeric: true }
        ],
        properties: [{ key: 'name', label: 'Name' }, { key: 'building', label: 'Building' }, { key: 'owner', label: 'Owner' }, { key: 'serviceCharge', label: 'Svc Charge', isNumeric: true }, { key: 'balance', label: 'Balance', isNumeric: true }],
        units: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'area', label: 'Area (sq ft)', isNumeric: true }, { key: 'floor', label: 'Floor' }, { key: 'project', label: 'Project' }, { key: 'owner', label: 'Owner' }, { key: 'salePrice', label: 'Price', isNumeric: true }, { key: 'balance', label: 'Balance', isNumeric: true }]
    };

    const TABLE_CATEGORIES = ['accounts', 'projects', 'buildings', 'properties', 'units'] as const;
    const isTableViewCategory = TABLE_CATEGORIES.includes(activeCategory as typeof TABLE_CATEGORIES[number]);

    const tableData = useMemo<TableRowData[]>(() => {
        if (!isTableViewCategory) return [];

        const balances = new Map<string, number>();

        state.transactions.forEach(tx => {
            let amount = tx.amount;
            if (tx.type === TransactionType.EXPENSE) amount = -amount;
            if (tx.categoryId) balances.set(tx.categoryId, (balances.get(tx.categoryId) || 0) + tx.amount);
            if (tx.projectId) balances.set(tx.projectId, (balances.get(tx.projectId) || 0) + amount);
            if (tx.buildingId) balances.set(tx.buildingId, (balances.get(tx.buildingId) || 0) + amount);
            if (tx.propertyId) balances.set(tx.propertyId, (balances.get(tx.propertyId) || 0) + amount);
            if (tx.unitId) balances.set(tx.unitId, (balances.get(tx.unitId) || 0) + amount);
            if (tx.contactId) balances.set(tx.contactId, (balances.get(tx.contactId) || 0) + amount);
        });

        state.projectAgreements.forEach(pa => {
            if (pa.status === ProjectAgreementStatus.CANCELLED) return;
            const addBalance = (catId: string | undefined, val: number) => {
                if (catId && val > 0) balances.set(catId, (balances.get(catId) || 0) + val);
            };
            addBalance(pa.customerDiscountCategoryId, pa.customerDiscount);
            addBalance(pa.floorDiscountCategoryId, pa.floorDiscount);
            addBalance(pa.lumpSumDiscountCategoryId, pa.lumpSumDiscount);
            addBalance(pa.miscDiscountCategoryId, pa.miscDiscount);
        });

        if (activeCategory === 'accounts') {
            const accountMap = new Map<string, any>();
            state.accounts.forEach(acc => accountMap.set(acc.id, { ...acc, children: [], balance: acc.balance }));
            state.categories.filter(cat => !cat.isHidden).forEach(cat => accountMap.set(cat.id, { ...cat, children: [], balance: balances.get(cat.id) || 0 }));
            const rootItems: any[] = [];
            accountMap.forEach(item => {
                const parentId = (item as any).parentAccountId || (item as any).parentCategoryId;
                if (parentId && accountMap.has(parentId)) {
                    accountMap.get(parentId).children.push(item);
                } else {
                    rootItems.push(item);
                }
            });
            const calculateTotalBalance = (item: any): number => {
                let total = item.balance || 0;
                if (item.children && item.children.length > 0) {
                    item.children.forEach((child: any) => { total += calculateTotalBalance(child); });
                }
                item.totalBalance = total;
                return total;
            };
            rootItems.forEach(item => calculateTotalBalance(item));
            const flattened: TableRowData[] = [];
            const flatten = (items: any[], level = 0) => {
                items.sort((a, b) => {
                    if (a.type !== b.type) {
                        const typeOrder: Record<string, number> = {
                            [AccountType.BANK]: 0, [AccountType.ASSET]: 1, [AccountType.LIABILITY]: 2,
                            [AccountType.EQUITY]: 3, [TransactionType.INCOME]: 4, [TransactionType.EXPENSE]: 5
                        };
                        return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
                    }
                    return a.name.localeCompare(b.name);
                });
                items.forEach(item => {
                    let displayBalance = item.totalBalance;
                    if (item.type === AccountType.LIABILITY || item.type === AccountType.EQUITY) displayBalance = -displayBalance;
                    const entityKind: 'ACCOUNT' | 'CATEGORY' = 'balance' in item && !('parentCategoryId' in item) ? 'ACCOUNT' : 'CATEGORY';
                    const plSub = (item as { plSubType?: ProfitLossSubType }).plSubType;
                    const plClassification =
                        entityKind === 'CATEGORY'
                            ? (plSub ? (PL_CLASSIFICATION_LABELS[plSub] ?? plSub) : 'Default (inferred)')
                            : '—';
                    flattened.push({
                        id: item.id,
                        name: item.name,
                        type: item.type || (item.entityKind === 'CATEGORY' ? 'Category' : AccountType.ASSET),
                        isSystem: !!item.isPermanent,
                        balance: displayBalance,
                        entityKind,
                        plClassification,
                        originalItem: item,
                        level
                    });
                    if (item.children.length > 0) flatten(item.children, level + 1);
                });
            };
            flatten(rootItems);
            let finalData = flattened;
            if (accountsTypeFilter !== 'all') {
                finalData = finalData.filter(item => {
                    const type = item.type;
                    if (accountsTypeFilter === 'bank') return type === AccountType.BANK || type === AccountType.CASH;
                    if (accountsTypeFilter === 'expense') return type === TransactionType.EXPENSE;
                    if (accountsTypeFilter === 'income') return type === TransactionType.INCOME;
                    if (accountsTypeFilter === 'equity') return type === AccountType.EQUITY;
                    return true;
                });
            }
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                finalData = finalData.filter(item => item.name.toLowerCase().includes(q));
            }
            if (sortConfig.key !== 'default') {
                finalData.sort((a, b) => {
                    const aVal = a[sortConfig.key];
                    const bVal = b[sortConfig.key];
                    if (typeof aVal === 'string' && typeof bVal === 'string') return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                });
            }
            return finalData;
        }


        // Other entities
        else {
            let data: TableRowData[] = [];
            if (activeCategory === 'projects') {
                data = state.projects.map(p => ({
                    id: p.id, name: p.name, description: p.description || '-', installmentPlan: p.installmentConfig ? 'Yes' : 'No',
                    balance: balances.get(p.id) || 0, originalItem: p
                }));
            } else if (activeCategory === 'buildings') {
                data = state.buildings.map(b => ({
                    id: b.id, name: b.name, description: b.description || '-', balance: balances.get(b.id) || 0, originalItem: b
                }));
            } else if (activeCategory === 'properties') {
                data = state.properties.map(p => ({
                    id: p.id, name: p.name, building: state.buildings.find(b => b.id === p.buildingId)?.name || 'Unknown',
                    owner: state.contacts.find(c => c.id === p.ownerId)?.name || 'Unknown', serviceCharge: p.monthlyServiceCharge || 0,
                    description: p.description || '-', balance: balances.get(p.id) || 0, originalItem: p
                }));
            } else if (activeCategory === 'units') {
                data = state.units.map(u => ({
                    id: u.id, name: u.name, project: state.projects.find(p => p.id === u.projectId)?.name || 'Unknown',
                    owner: state.contacts.find(c => c.id === u.contactId)?.name || '-', salePrice: u.salePrice || 0,
                    description: u.description || '-', balance: balances.get(u.id) || 0, originalItem: u
                }));
            }
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                data = data.filter(item => Object.values(item).some(val => typeof val === 'string' && val.toLowerCase().includes(q)));
            }
            const effectiveSortKey = sortConfig.key === 'default' ? 'name' : sortConfig.key;
            return data.sort((a, b) => {
                const aVal = a[effectiveSortKey];
                const bVal = b[effectiveSortKey];
                if (typeof aVal === 'string' && typeof bVal === 'string') return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
    }, [state, activeCategory, searchQuery, sortConfig, accountsTypeFilter, isTableViewCategory]);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const handleAddNew = (specificType?: string) => {
        let type = specificType || '';
        if (!type) {
            switch (activeCategory) {
                case 'accounts': type = 'ACCOUNT'; break;
                case 'projects': type = 'PROJECT'; break;
                case 'buildings': type = 'BUILDING'; break;
                case 'properties': type = 'PROPERTY'; break;
                case 'units': type = 'UNIT'; break;
            }
        }
        if (type) {
            dispatch({ type: 'SET_EDITING_ENTITY', payload: { type, id: '' } });
            setIsAddNewMenuOpen(false);
        }
    };

    const handleEdit = (e: React.MouseEvent, item: TableRowData) => {
        e.stopPropagation();
        let type = '';
        switch (activeCategory) {
            case 'accounts': type = item.entityKind === 'CATEGORY' ? 'CATEGORY' : 'ACCOUNT'; break;
            case 'projects': type = 'PROJECT'; break;
            case 'buildings': type = 'BUILDING'; break;
            case 'properties': type = 'PROPERTY'; break;
            case 'units': type = 'UNIT'; break;
        }
        if (type) dispatch({ type: 'SET_EDITING_ENTITY', payload: { type, id: item.id } });
    };

    const handleTransferProperty = (e: React.MouseEvent, item: TableRowData) => {
        e.stopPropagation();
        const property = state.properties.find(p => p.id === item.id);
        if (property) setPropertyToTransfer(property);
    };

    const handleRowClick = (item: TableRowData) => {
        let entityType: any = null;
        if (activeCategory === 'accounts') entityType = item.entityKind === 'CATEGORY' ? 'category' : 'account';
        else if (activeCategory === 'projects') entityType = 'project';
        else if (activeCategory === 'buildings') entityType = 'building';
        else if (activeCategory === 'properties') entityType = 'property';
        else if (activeCategory === 'units') entityType = 'unit';
        if (entityType) setLedgerModalState({ isOpen: true, entityId: item.id, entityType, entityName: item.name });
    };

    const handleResetDashboard = () => {
        if (confirm('Reset dashboard layout to default KPIs?')) {
            const DEFAULT_VISIBLE_KPIS = ['totalBalance', 'accountsReceivable', 'accountsPayable', 'outstandingLoan'];
            setVisibleKpiIds(DEFAULT_VISIBLE_KPIS);
        }
    };

    const handleClearTransactions = async () => {
        try {
            console.log('🗑️ Starting clear transactions process...');

            const dbService = getDatabaseService();
            if (!dbService.isReady()) {
                showAlert('Local database is not ready. Please try again.', { title: 'Error' });
                throw new Error('Database not ready');
            }

            if (isLocalOnlyMode()) {
                // Local-only: clear only local SQLite; no API
                console.log('💾 Clearing transactions from local database...');
                dbService.clearTransactionData();
                console.log('✅ Local database cleared');
            } else {
                // With API: clear cloud first, then local
                console.log('📡 Clearing transactions from cloud database...');
                const result = await dataManagementApi.clearTransactions();
                console.log('✅ Cloud database cleared:', result.details);
                console.log('💾 Clearing transactions from local database...');
                dbService.clearTransactionData();
                console.log('✅ Local database cleared');
            }

            // Update in-memory state
            console.log('🔄 Updating application state...');
            dispatch({ type: 'RESET_TRANSACTIONS' });
            console.log('✅ Application state updated');

            showToast(
                isLocalOnlyMode()
                    ? 'Successfully cleared transaction data from local database.'
                    : 'Successfully cleared transaction data from local and cloud databases.',
                'success'
            );
        } catch (error: any) {
            console.error('❌ Error clearing transactions:', error);
            showAlert(
                error?.message || 'Failed to clear transactions. Please try again.',
                { title: 'Error' }
            );
            throw error; // Re-throw so modal knows operation failed
        }
    };

    const handleFactoryReset = async () => {
        if (await showConfirm('FACTORY RESET WARNING: This will wipe ALL data and return the app to a fresh install state. \n\nAre you absolutely sure?', { title: 'Factory Reset', confirmLabel: 'Wipe Everything', cancelLabel: 'Cancel' })) {
            dispatch({ type: 'LOAD_SAMPLE_DATA' });
            showToast('App has been reset.', 'success');
        }
    };

    const SortHeader: React.FC<{ label: string; sortKey: string; align?: string }> = ({ label, sortKey, align = 'left' }) => (
        <th className={`px-4 py-3 text-${align} text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors select-none sticky top-0 bg-white z-10 border-b border-slate-200`} onClick={() => handleSort(sortKey)}>
            <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {label}
                {sortConfig.key === sortKey && <span className="text-indigo-600 font-bold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
            </div>
        </th>
    );

    const renderTable = () => {
        const columns = columnConfig[activeCategory] || [];
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
                <div className="overflow-x-auto flex-grow">
                    <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-white">
                            <tr>
                                {columns.map(col => <SortHeader key={col.key} label={col.label} sortKey={col.key} align={col.isNumeric ? 'right' : 'left'} />)}
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-white z-10 border-b border-slate-200">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-50">
                            {tableData.map((item, index) => {
                                const isAccountsTable = activeCategory === 'accounts';
                                return (
                                    <tr key={item.id} onClick={() => handleRowClick(item)} className={`cursor-pointer transition-all duration-200 group hover:bg-indigo-50/30 ${isAccountsTable && index % 2 !== 0 ? 'bg-slate-50/50' : ''}`}>
                                        {columns.map(col => (
                                            <td key={col.key} className={`px-4 py-3 whitespace-nowrap text-sm ${col.isNumeric ? 'text-right' : 'text-slate-700'}`}>
                                                {col.render ? col.render(item[col.key], item) : (col.isNumeric ? <span className={`font-semibold ${item[col.key] >= 0 ? 'text-slate-700' : 'text-rose-600'}`}>{CURRENCY} {(item[col.key] || 0).toLocaleString()}</span> : item[col.key])}
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                            <div className={`flex justify-end gap-2 transition-opacity ${activeCategory === 'properties' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                <button onClick={(e) => handleEdit(e, item)} className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 p-1.5 rounded-md transition-colors" title="Edit"><div className="w-4 h-4">{ICONS.edit}</div></button>
                                                {activeCategory === 'properties' && (
                                                    <button onClick={(e) => handleTransferProperty(e, item)} className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-md transition-colors" title="Transfer ownership"><div className="w-4 h-4">{ICONS.arrowRight}</div></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {tableData.length === 0 && <tr><td colSpan={columns.length + 1} className="px-4 py-12 text-center text-slate-400">No items found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // ID Sequence Block
    const IDSequenceSettingsBlock: React.FC<{ title: string, settings: AgreementSettings | InvoiceSettings, type: string }> = ({ title, settings, type }) => {
        const [localSettings, setLocalSettings] = useState(settings);
        const handleChange = (field: string, val: string | number) => setLocalSettings(prev => ({ ...prev, [field]: val }));
        const handleSave = () => {
            const payload = { ...localSettings, nextNumber: parseInt(String(localSettings.nextNumber)) || 1, padding: parseInt(String(localSettings.padding)) || 4 };
            dispatch({ type: type as any, payload });
            showToast(`${title} updated!`, 'success');
        };
        const idPrefix = type.toLowerCase().replace(/_/g, '-').replace(/update-|-settings/g, '');
        return (
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-slate-700">{title}</h4>
                    <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500">
                        {localSettings.prefix}{String(localSettings.nextNumber).padStart(localSettings.padding, '0')}
                    </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <Input id={`${idPrefix}-prefix`} name={`${idPrefix}-prefix`} label="Prefix" value={localSettings.prefix} onChange={e => handleChange('prefix', e.target.value)} className="text-sm" />
                    <Input id={`${idPrefix}-next-num`} name={`${idPrefix}-next-num`} label="Next #" type="number" value={localSettings.nextNumber.toString()} onChange={e => handleChange('nextNumber', e.target.value)} className="text-sm" />
                    <Input id={`${idPrefix}-padding`} name={`${idPrefix}-padding`} label="Padding" type="number" value={localSettings.padding.toString()} onChange={e => handleChange('padding', e.target.value)} className="text-sm" />
                </div>
                <Button variant="secondary" onClick={handleSave} className="mt-1 w-full">Update Sequence</Button>
            </div>
        );
    };

    const preferenceTabs = ['General', 'ID Sequences', 'Communication', 'Tools'];

    const renderToggle = (label: string, description: string, checked: boolean, onChange: (val: boolean) => void) => (
        <div className="flex items-center justify-between p-5 bg-white rounded-xl border border-slate-200 shadow-sm transition-all hover:border-indigo-200">
            <div className="pr-4">
                <p className="font-semibold text-slate-800 text-lg">{label}</p>
                <p className="text-sm text-slate-500 mt-1">{description}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" aria-label={label} />
                <div className="w-12 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
        </div>
    );

    const renderGeneralSettings = () => (
        <div className="space-y-4">
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-semibold text-slate-800 mb-1">Appearance</h4>
                <p className="text-sm text-slate-500 mb-4">Choose light or dark theme. The same setting is available from the header (moon / sun). Your choice is saved on this device.</p>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setTheme('light')}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${theme === 'light' ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                    >
                        Light
                    </button>
                    <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${theme === 'dark' ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                    >
                        Dark
                    </button>
                    <span className="text-xs text-slate-500">Header: {theme === 'dark' ? '☀️' : '🌙'} toggles the same setting.</span>
                </div>
            </div>
            {spellCtx?.isElectronSpell && (
                <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div>
                        <h4 className="font-semibold text-slate-800 text-lg">Spelling (desktop app)</h4>
                        <p className="text-sm text-slate-500 mt-1">
                            Uses the built-in offline dictionary. Right-click a highlighted word for suggestions or to add it to your dictionary. Settings are stored on this computer.
                        </p>
                    </div>
                    {renderToggle(
                        'Enable spell checking',
                        'Underline misspelled words in text fields and show suggestions in the right-click menu.',
                        spellCtx.settings.spellcheckEnabled,
                        (val) => void spellCtx.updateSettings({ spellcheckEnabled: val })
                    )}
                    {renderToggle(
                        'Auto-correct common typos',
                        'Fixes a small set of common mistakes when you press Space or leave a field (e.g. teh → the). Does not call the network.',
                        spellCtx.settings.autocorrectEnabled,
                        (val) => void spellCtx.updateSettings({ autocorrectEnabled: val })
                    )}
                    <div className="pt-1">
                        <label htmlFor="spellchecker-language" className="block text-sm font-medium text-slate-700 mb-2">
                            Spell check language
                        </label>
                        <select
                            id="spellchecker-language"
                            className="block w-full max-w-md border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                            value={spellCtx.settings.spellcheckerLanguage}
                            onChange={(e) => void spellCtx.updateSettings({ spellcheckerLanguage: e.target.value })}
                            disabled={spellCtx.loading}
                            aria-label="Spell check language"
                        >
                            {SPELLCHECK_LANGUAGE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
            {renderToggle('Show System Transactions', 'Display automated system entries (like service charge deductions) in the main ledger.', state.showSystemTransactions, (val) => dispatch({ type: 'TOGGLE_SYSTEM_TRANSACTIONS', payload: val }))}
            {renderToggle('Enable Color Coding', 'Use project/building specific colors in lists and forms for better visual distinction.', state.enableColorCoding, (val) => dispatch({ type: 'TOGGLE_COLOR_CODING', payload: val }))}
            {renderToggle('Enable Beep on Save', 'Play a sound notification when transactions or records are saved successfully.', state.enableBeepOnSave, (val) => dispatch({ type: 'TOGGLE_BEEP_ON_SAVE', payload: val }))}
            {renderToggle('Date Preservation', 'Remember the last used date in forms to speed up data entry for past records.', state.enableDatePreservation, (val) => dispatch({ type: 'TOGGLE_DATE_PRESERVATION', payload: val }))}

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-semibold text-slate-800 mb-1">Date display time zone</h4>
                <p className="text-sm text-slate-500 mb-2">
                    When dates are stored with a time from the server (for example UTC), the app picks the calendar day in this time zone so lists and forms match what you selected (fixes a one-day shift in many regions).
                    {typeof Intl !== 'undefined' && Intl.DateTimeFormat ? (
                        <span className="block mt-1 text-xs text-slate-600">
                            This device: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                        </span>
                    ) : null}
                </p>
                <label htmlFor="display-timezone" className="block text-sm font-medium text-slate-700 mb-2">
                    Calendar dates
                </label>
                <p className="text-xs text-slate-500 mb-2">Type a city or region (e.g. Dubai, Tokyo) or part of the zone name to filter.</p>
                <div className="max-w-lg">
                    <ComboBox
                        id="display-timezone"
                        name="displayTimezone"
                        label=""
                        items={displayTimeZoneComboItems}
                        selectedId={displayTz}
                        onSelect={async (item) => {
                            if (!item) return;
                            const v = item.id;
                            const zoneVal = v === 'auto' ? null : v;
                            setDisplayTz(v);
                            setDisplayTimeZone(zoneVal);
                            try {
                                await persistUserDisplayTimezone(zoneVal, {
                                    companyId: companyCtx?.activeCompany?.id,
                                    userId: companyCtx?.authenticatedUser?.id ?? authUser?.id,
                                });
                                showToast('Time zone saved.', 'success');
                            } catch (e) {
                                showToast('Saved on this device; could not save to the database.', 'warning');
                            }
                        }}
                        placeholder="Search by city or time zone..."
                        allowAddNew={false}
                        entityType="report"
                        compact
                        className="max-w-lg"
                    />
                </div>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-semibold text-slate-800 mb-2">WhatsApp sending</h4>
                <p className="text-sm text-slate-500 mb-4">Choose how WhatsApp actions work across the app: use the in-app chat panel (API) or open WhatsApp so you can send the message yourself (manual).</p>
                <div className="space-y-3" role="radiogroup" aria-label="WhatsApp sending mode">
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors">
                        <input
                            type="radio"
                            name="whatsapp-mode"
                            value="api"
                            checked={state.whatsAppMode === 'api'}
                            onChange={() => dispatch({ type: 'SET_WHATSAPP_MODE', payload: 'api' })}
                            className="mt-1 rounded-full text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                        <div>
                            <span className="font-medium text-slate-800">WhatsApp API</span>
                            <p className="text-xs text-slate-500 mt-0.5">Use WhatsApp Business API and the in-app chat panel to send and receive messages.</p>
                        </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors">
                        <input
                            type="radio"
                            name="whatsapp-mode"
                            value="manual"
                            checked={state.whatsAppMode === 'manual'}
                            onChange={() => dispatch({ type: 'SET_WHATSAPP_MODE', payload: 'manual' })}
                            className="mt-1 rounded-full text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                        <div>
                            <span className="font-medium text-slate-800">Manual WhatsApp</span>
                            <p className="text-xs text-slate-500 mt-0.5">Create the message and open WhatsApp (desktop or web) so you can send it yourself.</p>
                        </div>
                    </label>
                </div>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-semibold text-slate-800 mb-2">Default Project</h4>
                <p className="text-sm text-slate-500 mb-4">Set a default project that will be automatically selected in all forms.</p>
                <ComboBox
                    label=""
                    items={[{ id: '', name: 'None (No Default)' }, ...state.projects]}
                    selectedId={state.defaultProjectId || ''}
                    onSelect={(item) => dispatch({ type: 'UPDATE_DEFAULT_PROJECT', payload: item?.id || undefined })}
                    placeholder="Select default project..."
                    allowAddNew={false}
                />
            </div>
        </div>
    );

    const RentalInvoiceSettingsBlock: React.FC = () => {
        const settings = state.rentalInvoiceSettings || { prefix: 'INV-', nextNumber: 1, padding: 5, autoSendInvoiceWhatsApp: false };
        const [localSettings, setLocalSettings] = useState(settings);
        const handleChange = (field: string, val: string | number | boolean) => setLocalSettings(prev => ({ ...prev, [field]: val }));
        const handleSave = () => {
            const payload = { ...localSettings, nextNumber: parseInt(String(localSettings.nextNumber)) || 1, padding: parseInt(String(localSettings.padding)) || 4 };
            dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload });
            showToast('Rental Invoices updated!', 'success');
        };
        return (
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-slate-700">Rental Invoices</h4>
                    <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500">
                        {localSettings.prefix}{String(localSettings.nextNumber).padStart(localSettings.padding, '0')}
                    </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <Input id="rental-inv-prefix" name="rental-inv-prefix" label="Prefix" value={localSettings.prefix} onChange={e => handleChange('prefix', e.target.value)} className="text-sm" />
                    <Input id="rental-inv-next-num" name="rental-inv-next-num" label="Next #" type="number" value={localSettings.nextNumber.toString()} onChange={e => handleChange('nextNumber', e.target.value)} className="text-sm" />
                    <Input id="rental-inv-padding" name="rental-inv-padding" label="Padding" type="number" value={localSettings.padding.toString()} onChange={e => handleChange('padding', e.target.value)} className="text-sm" />
                </div>
                <div className="mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!localSettings.autoSendInvoiceWhatsApp}
                            onChange={e => handleChange('autoSendInvoiceWhatsApp', e.target.checked)}
                            className="rounded text-accent focus:ring-accent h-4 w-4"
                        />
                        <span className="text-sm font-medium text-slate-700">Auto-send invoice via WhatsApp when created</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-1 ml-6">When enabled, newly created rental/security deposit invoices are sent to the tenant via WhatsApp automatically.</p>
                </div>
                <Button variant="secondary" onClick={handleSave} className="mt-1 w-full">Update Settings</Button>
            </div>
        );
    };

    const renderIDSequences = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <IDSequenceSettingsBlock title="Rental Agreements" settings={state.agreementSettings} type="UPDATE_AGREEMENT_SETTINGS" />
            <RentalInvoiceSettingsBlock />
            <IDSequenceSettingsBlock title="Project Agreements" settings={state.projectAgreementSettings} type="UPDATE_PROJECT_AGREEMENT_SETTINGS" />
            <IDSequenceSettingsBlock title="Project Invoices" settings={state.projectInvoiceSettings || { prefix: 'P-INV-', nextNumber: 1, padding: 5 }} type="UPDATE_PROJECT_INVOICE_SETTINGS" />
        </div>
    );

    const renderActionCard = (title: string, desc: string, icon: React.ReactNode, onClick: () => void, colorClass = "indigo") => (
        <button onClick={onClick} className={`p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-${colorClass}-300 transition-all text-left group h-full w-full`}>
            <div className="flex items-center gap-4 mb-3">
                <div className={`p-3 bg-${colorClass}-50 rounded-lg text-${colorClass}-600 group-hover:text-${colorClass}-800 transition-colors`}>
                    {icon}
                </div>
                <h4 className={`font-bold text-lg text-slate-700 group-hover:text-${colorClass}-700`}>{title}</h4>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
        </button>
    );

    const renderCommunicationBranding = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderActionCard('Messaging Templates', 'Configure WhatsApp templates for invoices, receipts, and greetings.', <div className="w-6 h-6">{ICONS.whatsapp}</div>, () => setActivePreferenceModal('messaging'))}
            {renderActionCard('WhatsApp Integration', 'Configure WhatsApp Business API credentials and settings.', <div className="w-6 h-6">{ICONS.whatsapp}</div>, () => setActivePreferenceModal('whatsapp'))}
            {renderActionCard('Print Settings', 'Customize company details, logo, and footer for printed reports.', <div className="w-6 h-6">{ICONS.fileText}</div>, () => setActivePreferenceModal('print'))}
            {renderActionCard('WhatsApp Menu', 'Design auto-reply menus for incoming WhatsApp messages.', <div className="w-6 h-6">{ICONS.whatsapp}</div>, () => setActivePreferenceModal('whatsapp-menu'))}
        </div>
    );

    const renderToolsUtilities = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderActionCard('Reset Dashboard', 'Restore dashboard widgets to default layout.', <div className="w-6 h-6">{ICONS.barChart}</div>, handleResetDashboard, 'amber')}
        </div>
    );

    const renderPreferences = () => (
        <div className="flex flex-col">
            <div className="flex-shrink-0">
                <Tabs variant="browser" tabs={preferenceTabs} activeTab={activePreferenceTab} onTabClick={setActivePreferenceTab} />
            </div>
            <div className="bg-white rounded-b-lg -mt-px animate-in fade-in slide-in-from-bottom-2 duration-300 p-6">
                {activePreferenceTab === 'General' && renderGeneralSettings()}
                {activePreferenceTab === 'ID Sequences' && renderIDSequences()}
                {activePreferenceTab === 'Communication' && renderCommunicationBranding()}
                {activePreferenceTab === 'Tools' && renderToolsUtilities()}
            </div>
        </div>
    );

    const renderDataManagement = () => (
        <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <UpdateCheck />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><div className="w-5 h-5">{ICONS.trendingUp}</div></div>
                        Database Health
                    </h4>
                    <DatabaseAnalyzer />
                </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h4 className="font-bold text-slate-800 mb-4 text-lg">Transaction Audits & Logs</h4>
                <button onClick={() => setIsTransactionLogOpen(true)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all text-left flex items-center justify-between group">
                    <div>
                        <span className="font-semibold text-slate-700 block">View Transaction Log</span>
                        <span className="text-xs text-slate-500">Track history, deleted items, and restore data.</span>
                    </div>
                    <div className="text-slate-400 group-hover:text-indigo-600 shift-x-1 transition-transform">→</div>
                </button>
            </div>

            <div className="bg-white rounded-xl border border-rose-100 shadow-sm p-6">
                <h3 className="font-bold text-lg mb-4 text-rose-800 flex items-center gap-2">{ICONS.alertTriangle} Danger Zone</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isAdmin && (
                        <button onClick={() => setIsClearTransactionsModalOpen(true)} className="p-4 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 hover:border-rose-300 transition-all text-left group">
                            <div className="font-bold text-rose-700 mb-1 flex items-center gap-2">{ICONS.trash} Clear Transactions</div>
                            <p className="text-xs text-rose-600/80 leading-relaxed">Deletes all financial data but keeps your entity structure (Accounts, Projects, etc.) intact.</p>
                            <p className="text-xs text-rose-500 mt-2 font-semibold">⚠️ Admin Only</p>
                        </button>
                    )}
                    <button onClick={handleFactoryReset} className="p-4 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-900 transition-all text-left group">
                        <div className="font-bold text-white mb-1 flex items-center gap-2">{ICONS.alertTriangle} Factory Reset</div>
                        <p className="text-xs text-slate-400 leading-relaxed">Completely wipes ALL data and restores the application to a fresh install state.</p>
                    </button>
                </div>
            </div>
        </div>
    );

    const showDetail = !!state.editingEntity;

    if (showDetail) {
        return (
            <div className="p-6 bg-slate-50 h-full overflow-auto">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
                    <SettingsDetailPage goBack={() => { }} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-full bg-slate-50 overflow-hidden font-sans">
            {/* SIDEBAR */}
            <div className={`w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col flex-shrink-0 z-20 transition-all duration-300`}>
                <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between md:block">
                    <div>
                        <h1 className="text-xl md:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 tracking-tight">Settings</h1>
                        <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1 uppercase tracking-wider">Control Panel</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto md:overflow-y-auto p-2 md:p-4 flex flex-row md:flex-col gap-2 md:space-y-8 overflow-x-auto no-scrollbar">
                    {categoryGroups.map((group, groupIdx) => {
                        const visibleItems = group.items.filter(item => settingCategories.some(cat => cat.id === item.id));
                        if (visibleItems.length === 0) return null;

                        return (
                            <div key={groupIdx} className="flex flex-row md:flex-col gap-1 md:gap-0">
                                <h3 className="hidden md:block px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{group.title}</h3>
                                <div className="flex flex-row md:flex-col gap-1">
                                    {visibleItems.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => { setActiveCategory(item.id); setSearchQuery(''); }}
                                            className={`whitespace-nowrap flex items-center gap-2 md:gap-3 px-3 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-medium transition-all duration-200 group ${activeCategory === item.id ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                                        >
                                            <div className={`transition-transform duration-200 ${activeCategory === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>{item.icon}</div>
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
                {/* Offline Banner */}
                {isOffline && (
                    <div className="px-8 py-4 bg-amber-50 border-b-2 border-amber-200">
                        <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                                <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-amber-900">
                                    Settings changes are disabled while offline
                                </p>
                                <p className="text-xs text-amber-700 mt-0.5">
                                    You can view settings, but changes won't be saved until you're back online.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className={`px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 bg-slate-50/95 backdrop-blur z-30 ${activeCategory === 'contacts' || activeCategory === 'assets' ? 'py-2' : 'py-6'}`}>
                    {activeCategory !== 'contacts' && activeCategory !== 'assets' && (
                        <div>
                            <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{flatCategories.find(c => c.id === activeCategory)?.label}</h2>
                            <p className="text-slate-500 text-sm mt-1">Manage your {flatCategories.find(c => c.id === activeCategory)?.label.toLowerCase()} preferences and data.</p>
                        </div>
                    )}
                    {(activeCategory === 'contacts' || activeCategory === 'assets') && <div></div>}

                    <div className="flex items-center gap-3">
                        {isTableViewCategory && activeCategory !== 'contacts' && (
                            <>
                                <div className="relative group">
                                    <Input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search..."
                                        className="w-64 bg-white border-slate-200 shadow-sm focus:ring-2 focus:ring-indigo-100 transition-all rounded-lg pl-10"
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                        <div className="w-4 h-4">{ICONS.fileText}</div>
                                    </div>
                                    {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><div className="w-4 h-4">{ICONS.x}</div></button>}
                                </div>
                                {activeCategory === 'accounts' ? (
                                    <div className="relative">
                                        <Button
                                            onClick={() => setIsAddNewMenuOpen(!isAddNewMenuOpen)}
                                            disabled={isOffline}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 border-0 rounded-lg px-4 py-2.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div className="w-5 h-5">{ICONS.plus}</div>
                                            <span className="font-semibold">Add New</span>
                                            <div className="w-4 h-4">{ICONS.chevronDown}</div>
                                        </Button>
                                        {isAddNewMenuOpen && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-40"
                                                    onClick={() => setIsAddNewMenuOpen(false)}
                                                />
                                                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50 py-1">
                                                    <button
                                                        onClick={() => handleAddNew('ACCOUNT')}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition-colors"
                                                    >
                                                        <div className="w-4 h-4">{ICONS.wallet}</div>
                                                        <span>Account</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleAddNew('CATEGORY_INCOME')}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 transition-colors"
                                                    >
                                                        <div className="w-4 h-4">{ICONS.arrowUp}</div>
                                                        <span>Income Category</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleAddNew('CATEGORY_EXPENSE')}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2 transition-colors"
                                                    >
                                                        <div className="w-4 h-4">{ICONS.arrowDown}</div>
                                                        <span>Expense Category</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <Button onClick={() => handleAddNew()} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 border-0 rounded-lg px-4 py-2.5 flex items-center gap-2">
                                        <div className="w-5 h-5">{ICONS.plus}</div>
                                        <span className="font-semibold">Add New</span>
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Content Body */}
                <div className={`flex-1 ${activeCategory === 'contacts' || activeCategory === 'assets' ? 'overflow-hidden' : 'overflow-y-auto'} px-8 ${activeCategory === 'contacts' || activeCategory === 'assets' ? 'pb-0' : 'pb-10'}`}>
                    <div className={`w-full ${activeCategory === 'contacts' || activeCategory === 'assets' ? 'h-full' : 'max-w-7xl'} mx-auto animate-in fade-in duration-500`}>
                        {activeCategory === 'accounts' && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                {([
                                    { id: 'all' as const, label: 'All' },
                                    { id: 'bank' as const, label: 'Bank Accounts' },
                                    { id: 'expense' as const, label: 'Expense' },
                                    { id: 'income' as const, label: 'Income' },
                                    { id: 'equity' as const, label: 'Equity' },
                                ]).map(({ id, label }) => (
                                    <button
                                        key={id}
                                        onClick={() => setAccountsTypeFilter(id)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                            accountsTypeFilter === id
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {isTableViewCategory ? renderTable() : null}
                        {activeCategory === 'users' && (
                            <Suspense fallback={<div className="flex items-center justify-center py-12 text-slate-400">Loading...</div>}>
                                <UserManagement />
                            </Suspense>
                        )}
                        {activeCategory === 'preferences' && renderPreferences()}
                        {activeCategory === 'license' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <LicenseManagement />
                            </div>
                        )}
                        {activeCategory === 'backup' && (
                            <Suspense fallback={<div className="flex items-center justify-center py-12 text-slate-400">Loading...</div>}>
                                <BackupRestorePage />
                            </Suspense>
                        )}
                        {activeCategory === 'data' && renderDataManagement()}
                        {activeCategory === 'help' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <HelpSection />
                            </div>
                        )}
                        {activeCategory === 'contacts' && (
                            <Suspense fallback={<div className="flex items-center justify-center py-12 text-slate-400">Loading...</div>}>
                                <ContactsManagement />
                            </Suspense>
                        )}
                        {activeCategory === 'assets' && (
                            <Suspense fallback={<div className="flex items-center justify-center py-12 text-slate-400">Loading...</div>}>
                                <AssetsManagement />
                            </Suspense>
                        )}
                        {activeCategory === 'company-manage' && isLocalOnlyMode() && companyCtx && (
                            <CompanyManagementSection />
                        )}
                        {activeCategory === 'db-health' && isLocalOnlyMode() && (
                            <DbHealthPanel />
                        )}
                        {activeCategory === 'gl-journal' && isLocalOnlyMode() && (
                            <ManualJournalEntrySection />
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ErrorLogViewer isOpen={isErrorLogOpen} onClose={() => setIsErrorLogOpen(false)} />
            <TransactionLogViewer isOpen={isTransactionLogOpen} onClose={() => setIsTransactionLogOpen(false)} />


            {ledgerModalState && (
                <SettingsLedgerModal isOpen={ledgerModalState.isOpen} onClose={() => setLedgerModalState(null)} entityId={ledgerModalState.entityId} entityType={ledgerModalState.entityType} entityName={ledgerModalState.entityName} />
            )}

            {propertyToTransfer && (
                <PropertyTransferModal isOpen={!!propertyToTransfer} onClose={() => setPropertyToTransfer(null)} property={propertyToTransfer} />
            )}

            <Modal isOpen={activePreferenceModal === 'messaging'} onClose={() => setActivePreferenceModal(null)} title="Messaging Templates" size="xl">
                <MessagingTemplatesForm />
            </Modal>

            <Modal isOpen={activePreferenceModal === 'whatsapp'} onClose={() => setActivePreferenceModal(null)} title="WhatsApp Integration" size="xl">
                <WhatsAppConfigForm onClose={() => setActivePreferenceModal(null)} />
            </Modal>

            <Modal isOpen={activePreferenceModal === 'print'} onClose={() => setActivePreferenceModal(null)} title="Print Settings" size="xl">
                <PrintTemplateForm />
            </Modal>

            <Modal isOpen={activePreferenceModal === 'whatsapp-menu'} onClose={() => setActivePreferenceModal(null)} title="WhatsApp Auto-Reply Menu" size="xl">
                <WhatsAppMenuForm />
            </Modal>

            <ClearTransactionsModal
                isOpen={isClearTransactionsModalOpen}
                onClose={() => setIsClearTransactionsModalOpen(false)}
                onConfirm={handleClearTransactions}
            />

        </div>
    );
};

export default SettingsPage;

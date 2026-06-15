
import { useDispatchOnly, useSettingsPageState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import Tabs from '../ui/Tabs';
import { ICONS, CURRENCY } from '../../constants';
import SettingsDetailPage from './SettingsDetailPage';
import NavSectionLabel from '../layout/NavSectionLabel';
import { useKpis } from '../../context/KPIContext';
import ErrorLogViewer from './ErrorLogViewer';
import TransactionLogViewer from './TransactionLogViewer';
import MessagingTemplatesForm, { type MessagingTemplatesFormHandle } from './MessagingTemplatesForm';
import PrintTemplateForm from './PrintTemplateForm';
import WhatsAppConfigForm from './WhatsAppConfigForm';
import WhatsAppMenuForm from './WhatsAppMenuForm';
import CustomerSuccessCenter from '../customerSuccess/CustomerSuccessCenter';
import { consumeHelpDeepLink, type HelpDeepLink } from '../../shared/moduleHelp/moduleHelpContent';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import { Project, ContactType, TransactionType, AccountType, ProjectAgreementStatus, AgreementSettings, InvoiceSettings, ProfitLossSubType } from '../../types';
import SettingsLedgerModal from './SettingsLedgerModal';
import DatabaseAnalyzer from './DatabaseAnalyzer';
import UpdateCheck from './UpdateCheck';
import AboutSection from './AboutSection';
import { useFeatures } from '../../hooks/useFeatures';
import { navigateToSettingsHome } from '../../utils/appNavigation';
import { CompanyManagementSection } from '../company/CompanyManagementSection';
import DbHealthPanel from '../diagnostics/DbHealthPanel';
import ManualJournalEntrySection from './ManualJournalEntrySection';
import InterfaceModeSettingsSection from './InterfaceModeSettingsSection';
import ProcurementSettingsSection from './ProcurementSettingsSection';
import AccountingPeriodsSection from './AccountingPeriodsSection';
import PermissionManagementSection from './PermissionManagementSection';
import EnterpriseAuditViewer from './EnterpriseAuditViewer';
import { usePermissions } from '../../hooks/usePermissions';
import CustomerBillingPortal from '../billing/CustomerBillingPortal';
import AdminSubscriptionDashboard from '../billing/AdminSubscriptionDashboard';
import AdminMonitoringDashboard from '../monitoring/AdminMonitoringDashboard';
import AdminReferralDashboard from '../referrals/AdminReferralDashboard';
import { useOnboardingOptional } from '../../context/OnboardingContext';
import { Property } from '../../types';
import ClearTransactionsModal from './ClearTransactionsModal';
import { dataManagementApi } from '../../services/api/repositories/dataManagementApi';
import { getDatabaseService } from '../../services/legacy-sqlite/databaseService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useCompanyOptional } from '../../context/CompanyContext';
import { useSpellCheckerOptional, SPELLCHECK_LANGUAGE_OPTIONS } from '../../context/SpellCheckerContext';
import { useTheme } from '../../context/ThemeContext';
import { useViewport } from '../../context/ViewportContext';
import { getDisplayTimeZone, setDisplayTimeZone } from '../../utils/dateUtils';
import { persistUserDisplayTimezone } from '../../services/userDisplayTimezonePersist';

const UserManagement = lazy(() => import('./UserManagement'));
const BackupRestorePage = lazy(() => import('./BackupRestorePage'));
const PrivacyCenter = lazy(() => import('./PrivacyCenter'));
const MfaSettingsSection = lazy(() => import('./MfaSettingsSection'));
const ContactsManagement = lazy(() => import('./ContactsManagement'));
const AssetsManagement = lazy(() => import('./AssetsManagement'));

const PL_CLASSIFICATION_LABELS: Record<ProfitLossSubType, string> = {
    revenue: 'Revenue',
    cost_of_sales: 'Cost of sales',
    operating_expense: 'Operating expense',
    other_income: 'Other income',
    finance_cost: 'Finance costs',
    tax: 'Tax' };

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
        const state = useSettingsPageState();
    const {
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
        procurementSettings,
        editingEntity } = state;
    const dispatch = useDispatchOnly();
    const { user: authUser, tenant: authTenant } = useAuth();
    const { showConfirm, showToast, showAlert } = useNotification();
    const { setVisibleKpiIds } = useKpis();
    const { isOffline } = useOffline();
    const companyCtx = useCompanyOptional();
    const spellCtx = useSpellCheckerOptional();
    const { theme, preference, setPreference } = useTheme();
    const { features, isLoading: featuresLoading } = useFeatures();

    const { isMobileViewport: isMobile } = useViewport();

    const [activeCategory, setActiveCategory] = useState('preferences');
    const [helpDeepLink, setHelpDeepLink] = useState<HelpDeepLink | null>(null);

    useEffect(() => {
        const pending = sessionStorage.getItem('openSettingsCategory');
        if (pending) {
            sessionStorage.removeItem('openSettingsCategory');
            setActiveCategory(pending);
        }
        const articleLink = consumeHelpDeepLink();
        if (articleLink) {
            setHelpDeepLink(articleLink);
            setActiveCategory('help');
        }
    }, []);

    useEffect(() => {
        const handleOpenTab = (event: Event) => {
            const categoryId = (event as CustomEvent<{ categoryId?: string }>).detail?.categoryId;
            if (categoryId) setActiveCategory(categoryId);
        };
        window.addEventListener('open-settings-tab', handleOpenTab);
        return () => window.removeEventListener('open-settings-tab', handleOpenTab);
    }, []);

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

    useEffect(() => {
        if (featuresLoading) return;
        if (activeCategory === 'application-update' && !features.applicationUpdates) {
            setActiveCategory('preferences');
            navigateToSettingsHome();
        }
    }, [activeCategory, features.applicationUpdates, featuresLoading]);

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
    const messagingTemplatesFormRef = useRef<MessagingTemplatesFormHandle>(null);
    const closeMessagingTemplatesModal = useCallback(() => setActivePreferenceModal(null), []);
    const [activePreferenceTab, setActivePreferenceTab] = useState<string>('General');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'asc' });
    const [ledgerModalState, setLedgerModalState] = useState<{ isOpen: boolean; entityId: string; entityType: 'account' | 'category' | 'contact' | 'project' | 'building' | 'property' | 'unit'; entityName: string } | null>(null);
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
                name: `${ianaTimeZoneCityLabel(tz)} · ${tz}` })),
        ];
    }, [ianaTimeZones]);

    const perms = usePermissions();
    const onboarding = useOnboardingOptional();

    const showUserManagement =
        perms.canManageUsers || perms.canReadUsers || (isLocalOnlyMode() && !!companyCtx?.activeCompany);
    const showPermissionManagement = perms.canReadPermissions || isLocalOnlyMode();
    const showBillingPortal =
        !isLocalOnlyMode() && (perms.canReadBilling || perms.canManageBilling || perms.canReadUsers || perms.canManageUsers);

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
                ...(showBillingPortal
                  ? [{ id: 'license', label: 'License & Subscription', icon: ICONS.lock || '🔒' }]
                  : []),
                ...(onboarding?.canManage
                  ? [{ id: 'setup-wizard', label: 'Setup Wizard', icon: ICONS.fileText || '📋' }]
                  : []),
                ...(perms.enterpriseRole === 'super_admin' && !isLocalOnlyMode()
                  ? [
                      { id: 'admin-subscriptions', label: 'Subscription Admin', icon: ICONS.briefcase || '📊' },
                      { id: 'admin-monitoring', label: 'Monitoring', icon: ICONS.activity || '📡' },
                      { id: 'admin-referrals', label: 'Referral Admin', icon: ICONS.users || '👥' },
                    ]
                  : []),
                ...(showUserManagement ? [
                    { id: 'users', label: 'User Management', icon: ICONS.users },
                ] : []),
                ...(showPermissionManagement ? [
                    { id: 'permissions', label: 'Permissions', icon: ICONS.lock },
                ] : []),
                ...(perms.canReadAuditLogs && !isLocalOnlyMode()
                  ? [{ id: 'audit-trail', label: 'Audit Trail', icon: ICONS.fileText }]
                  : []),
                ...(!isLocalOnlyMode()
                  ? [{ id: 'privacy', label: 'Privacy Center', icon: ICONS.shield || '🛡️' }]
                  : []),
                ...(!isLocalOnlyMode()
                  ? [{ id: 'mfa', label: 'Two-Factor Auth', icon: ICONS.lock || '🔐' }]
                  : []),
                { id: 'backup', label: 'Backup Center', icon: ICONS.download },
                { id: 'data', label: 'Data Management', icon: ICONS.trash },
                { id: 'about', label: 'About', icon: ICONS.info },
                { id: 'help', label: 'Customer Success', icon: ICONS.fileText },
            ]
        },
        {
            title: 'Financial',
            items: [
                { id: 'accounts', label: 'Chart of Accounts', icon: ICONS.wallet },
                ...(!isLocalOnlyMode() ? [{ id: 'accounting-periods', label: 'Accounting Periods', icon: ICONS.lock }] : []),
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
    }, [showUserManagement, showPermissionManagement, showBillingPortal, perms.canReadAuditLogs, flatCategories]);

    // --- Data Preparation Logic (Preserved) ---
    const columnConfig: Record<string, ColumnDef[]> = {
        accounts: [
            {
                key: 'name', label: 'Name', render: (val, row) => (
                    <div style={{ paddingLeft: `${(row.level || 0) * 20}px` }} className="flex items-center gap-2">
                        {row.level && row.level > 0 ? <span className="text-app-muted">└</span> : null}
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
                        <span className="text-app-muted">—</span>
                    ) : val === 'Default (inferred)' ? (
                        <span className="text-app-muted italic">Default (inferred)</span>
                    ) : (
                        val
                    ) },
            { key: 'isSystem', label: 'System', render: (val) => val ? 'Yes' : 'No' },
            { key: 'balance', label: 'Balance', isNumeric: true }
        ],
        projects: [
            {
                key: 'name', label: 'Name', render: (val, row) => (
                    <div className="flex items-center gap-2">
                        {row.originalItem.color && <div className="w-3 h-3 rounded-full shadow-ds-card" style={{ backgroundColor: row.originalItem.color }}></div>}
                        <span className="font-medium text-app-text">{val}</span>
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
                        {row.originalItem.color && <div className="w-3 h-3 rounded-full shadow-ds-card" style={{ backgroundColor: row.originalItem.color }}></div>}
                        <span className="font-medium text-app-text">{val}</span>
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

        transactions.forEach(tx => {
            let amount = tx.amount;
            if (tx.type === TransactionType.EXPENSE) amount = -amount;
            if (tx.categoryId) balances.set(tx.categoryId, (balances.get(tx.categoryId) || 0) + tx.amount);
            if (tx.projectId) balances.set(tx.projectId, (balances.get(tx.projectId) || 0) + amount);
            if (tx.buildingId) balances.set(tx.buildingId, (balances.get(tx.buildingId) || 0) + amount);
            if (tx.propertyId) balances.set(tx.propertyId, (balances.get(tx.propertyId) || 0) + amount);
            if (tx.unitId) balances.set(tx.unitId, (balances.get(tx.unitId) || 0) + amount);
            if (tx.contactId) balances.set(tx.contactId, (balances.get(tx.contactId) || 0) + amount);
        });

        projectAgreements.forEach(pa => {
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
            accounts.forEach(acc => accountMap.set(acc.id, { ...acc, children: [], balance: acc.balance }));
            categories.filter(cat => !cat.isHidden).forEach(cat => accountMap.set(cat.id, { ...cat, children: [], balance: balances.get(cat.id) || 0 }));
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
                data = projects.map(p => ({
                    id: p.id, name: p.name, description: p.description || '-', installmentPlan: p.installmentConfig ? 'Yes' : 'No',
                    balance: balances.get(p.id) || 0, originalItem: p
                }));
            } else if (activeCategory === 'buildings') {
                data = buildings.map(b => ({
                    id: b.id, name: b.name, description: b.description || '-', balance: balances.get(b.id) || 0, originalItem: b
                }));
            } else if (activeCategory === 'properties') {
                data = properties.map(p => ({
                    id: p.id, name: p.name, building: buildings.find(b => b.id === p.buildingId)?.name || 'Unknown',
                    owner: contacts.find(c => c.id === p.ownerId)?.name || 'Unknown', serviceCharge: p.monthlyServiceCharge || 0,
                    description: p.description || '-', balance: balances.get(p.id) || 0, originalItem: p
                }));
            } else if (activeCategory === 'units') {
                data = units.map(u => ({
                    id: u.id, name: u.name, project: projects.find(p => p.id === u.projectId)?.name || 'Unknown',
                    owner: contacts.find(c => c.id === u.contactId)?.name || '-', salePrice: u.salePrice || 0,
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
    }, [currentUser, transactions, projectAgreements, accounts, categories, projects, buildings, properties, contacts, units, projectInvoiceSettings, showSystemTransactions, enableColorCoding, enableBeepOnSave, enableDatePreservation, whatsAppMode, defaultProjectId, rentalInvoiceSettings, agreementSettings, projectAgreementSettings, editingEntity, activeCategory, searchQuery, sortConfig, accountsTypeFilter, isTableViewCategory]);

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
        if (!(await showConfirm(
            'FACTORY RESET WARNING: This will wipe ALL data and return the app to a fresh install state. \n\nAre you absolutely sure?',
            { title: 'Factory Reset', confirmLabel: 'Wipe Everything', cancelLabel: 'Cancel' }
        ))) {
            return;
        }

        try {
            const tenantId = authTenant?.id;

            if (isLocalOnlyMode()) {
                const dbService = getDatabaseService();
                if (!dbService.isReady()) {
                    showAlert('Local database is not ready. Please try again.', { title: 'Error' });
                    return;
                }
                dbService.clearAllData(tenantId);
            } else {
                await dataManagementApi.factoryReset();
                const dbService = getDatabaseService();
                if (dbService.isReady()) {
                    dbService.clearAllData(tenantId);
                }
            }

            dispatch({ type: 'LOAD_SAMPLE_DATA' });
            showToast(
                isLocalOnlyMode()
                    ? 'Organization data has been reset locally.'
                    : 'Organization data has been reset on the server.',
                'success'
            );
            setTimeout(() => window.location.reload(), 800);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to reset organization data.';
            console.error('Factory reset failed:', error);
            showAlert(message, { title: 'Factory Reset Failed' });
        }
    };

    const SortHeader: React.FC<{ label: string; sortKey: string; align?: string }> = ({ label, sortKey, align = 'left' }) => (
        <th className={`px-4 py-3 text-${align} text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-table-hover transition-colors select-none sticky top-0 bg-app-table-header z-10 border-b border-app-border`} onClick={() => handleSort(sortKey)}>
            <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {label}
                {sortConfig.key === sortKey && <span className="text-ds-primary font-bold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
            </div>
        </th>
    );

    const renderTable = () => {
        const columns = columnConfig[activeCategory] || [];
        return (
            <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card overflow-hidden flex flex-col max-h-[70vh]">
                <div className="overflow-x-auto flex-grow">
                    <table className="min-w-full divide-y divide-app-border">
                        <thead className="bg-app-table-header">
                            <tr>
                                {columns.map(col => <SortHeader key={col.key} label={col.label} sortKey={col.key} align={col.isNumeric ? 'right' : 'left'} />)}
                                <th className="px-4 py-3 text-right text-xs font-semibold text-app-muted uppercase tracking-wider sticky top-0 bg-app-table-header z-10 border-b border-app-border">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-app-card divide-y divide-app-border">
                            {tableData.map((item, index) => {
                                const isAccountsTable = activeCategory === 'accounts';
                                return (
                                    <tr key={item.id} onClick={() => handleRowClick(item)} className={`cursor-pointer transition-all duration-200 group hover:bg-app-table-hover ${isAccountsTable && index % 2 !== 0 ? 'bg-app-surface-2/40' : ''}`}>
                                        {columns.map(col => (
                                            <td key={col.key} className={`px-4 py-3 whitespace-nowrap text-sm ${col.isNumeric ? 'text-right' : 'text-app-text'}`}>
                                                {col.render ? col.render(item[col.key], item) : (col.isNumeric ? <span className={`font-semibold ${item[col.key] >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>{CURRENCY} {(item[col.key] || 0).toLocaleString()}</span> : item[col.key])}
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                            <div className={`flex justify-end gap-2 transition-opacity ${activeCategory === 'properties' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                <button onClick={(e) => handleEdit(e, item)} className="text-ds-primary hover:text-app-text bg-app-highlight hover:bg-app-highlight p-1.5 rounded-md transition-colors" title="Edit"><div className="w-4 h-4">{ICONS.edit}</div></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {tableData.length === 0 && <tr><td colSpan={columns.length + 1} className="px-4 py-12 text-center text-app-muted">No items found.</td></tr>}
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
            <div className="p-5 bg-app-card border border-app-border rounded-xl shadow-ds-card hover:shadow-md transition-shadow">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-app-text">{title}</h4>
                    <span className="text-xs font-mono bg-app-surface-2 px-2 py-1 rounded text-app-muted">
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

    const ProjectInvoiceSettingsBlock: React.FC = () => {
        const settings = projectInvoiceSettings || {
            prefix: 'P-INV-',
            nextNumber: 1,
            padding: 5,
            autoSendBillPaymentWhatsApp: false };
        const [localSettings, setLocalSettings] = useState(settings);
        const handleChange = (field: string, val: string | number | boolean) =>
            setLocalSettings((prev) => ({ ...prev, [field]: val }));
        const handleSave = () => {
            const payload = {
                ...localSettings,
                nextNumber: parseInt(String(localSettings.nextNumber)) || 1,
                padding: parseInt(String(localSettings.padding)) || 4 };
            dispatch({ type: 'UPDATE_PROJECT_INVOICE_SETTINGS', payload });
            showToast('Project Invoices updated!', 'success');
        };
        return (
            <div className="p-5 bg-app-card border border-app-border rounded-xl shadow-ds-card hover:shadow-md transition-shadow">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-app-text">Project Invoices</h4>
                    <span className="text-xs font-mono bg-app-surface-2 px-2 py-1 rounded text-app-muted">
                        {localSettings.prefix}
                        {String(localSettings.nextNumber).padStart(localSettings.padding, '0')}
                    </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <Input
                        id="project-inv-prefix"
                        name="project-inv-prefix"
                        label="Prefix"
                        value={localSettings.prefix}
                        onChange={(e) => handleChange('prefix', e.target.value)}
                        className="text-sm"
                    />
                    <Input
                        id="project-inv-next-num"
                        name="project-inv-next-num"
                        label="Next #"
                        type="number"
                        value={localSettings.nextNumber.toString()}
                        onChange={(e) => handleChange('nextNumber', e.target.value)}
                        className="text-sm"
                    />
                    <Input
                        id="project-inv-padding"
                        name="project-inv-padding"
                        label="Padding"
                        type="number"
                        value={localSettings.padding.toString()}
                        onChange={(e) => handleChange('padding', e.target.value)}
                        className="text-sm"
                    />
                </div>
                <div className="mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!localSettings.autoSendBillPaymentWhatsApp}
                            onChange={(e) => handleChange('autoSendBillPaymentWhatsApp', e.target.checked)}
                            className="rounded text-accent focus:ring-accent h-4 w-4"
                        />
                        <span className="text-sm font-medium text-app-text">
                            Offer WhatsApp after project bill payment
                        </span>
                    </label>
                    <p className="text-xs text-app-muted mt-1 ml-6">
                        When enabled, recording a payment against a project or contract bill (vendor or contact with a
                        mobile number) prompts to send the bill payment message from Communication → Messaging Templates.
                    </p>
                </div>
                <Button variant="secondary" onClick={handleSave} className="mt-1 w-full">
                    Update Settings
                </Button>
            </div>
        );
    };

    const preferenceTabs = ['General', 'Procurement', 'ID Sequences', 'Communication', 'Tools'];

    const renderToggle = (label: string, description: string, checked: boolean, onChange: (val: boolean) => void) => (
        <div className="flex items-center justify-between p-5 bg-app-card rounded-xl border border-app-border shadow-ds-card transition-all hover:border-ds-primary/40">
            <div className="pr-4">
                <p className="font-semibold text-app-text text-lg">{label}</p>
                <p className="text-sm text-app-muted mt-1">{description}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" aria-label={label} />
                <div className="w-12 h-7 bg-app-surface-2 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-app-border after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-ds-primary"></div>
            </label>
        </div>
    );

    const renderGeneralSettings = () => (
        <div className="space-y-4">
            <div className="p-5 bg-app-card rounded-xl border border-app-border shadow-ds-card">
                <h4 className="font-semibold text-app-text mb-1">Appearance</h4>
                <p className="text-sm text-app-muted mb-4">Choose light, dark, or match your device (system). Saved on this device and synced via storage events across tabs.</p>
                <div className="flex flex-wrap items-center gap-3">
                    {(['light', 'dark', 'system'] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setPreference(mode)}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors capitalize ${preference === mode ? 'border-ds-primary bg-app-highlight text-app-text' : 'border-app-border bg-app-card text-app-text hover:border-app-border'}`}
                        >
                            {mode === 'light' ? '☀ Light' : mode === 'dark' ? '🌙 Dark' : '⚙ System'}
                        </button>
                    ))}
                    <span className="text-xs text-app-muted">Active: {theme} {preference === 'system' ? '(system)' : ''}</span>
                </div>
            </div>
            {spellCtx?.isElectronSpell && (
                <div className="p-5 bg-app-card rounded-xl border border-app-border shadow-ds-card space-y-4">
                    <div>
                        <h4 className="font-semibold text-app-text text-lg">Spelling (desktop app)</h4>
                        <p className="text-sm text-app-muted mt-1">
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
                        <label htmlFor="spellchecker-language" className="block text-sm font-medium text-app-text mb-2">
                            Spell check language
                        </label>
                        <select
                            id="spellchecker-language"
                            className="block w-full max-w-md border border-app-border rounded-lg px-3 py-2 text-sm text-app-text bg-app-card focus:ring-2 focus:ring-ds-primary/50 focus:border-ds-primary"
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
            {renderToggle('Show System Transactions', 'Display automated system entries (like service charge deductions) in the main ledger.', showSystemTransactions, (val) => dispatch({ type: 'TOGGLE_SYSTEM_TRANSACTIONS', payload: val }))}
            {renderToggle('Enable Color Coding', 'Use project/building specific colors in lists and forms for better visual distinction.', enableColorCoding, (val) => dispatch({ type: 'TOGGLE_COLOR_CODING', payload: val }))}
            {renderToggle('Enable Beep on Save', 'Play a sound notification when transactions or records are saved successfully.', enableBeepOnSave, (val) => dispatch({ type: 'TOGGLE_BEEP_ON_SAVE', payload: val }))}
            {renderToggle('Date Preservation', 'Remember the last used date in forms to speed up data entry for past records.', enableDatePreservation, (val) => dispatch({ type: 'TOGGLE_DATE_PRESERVATION', payload: val }))}

            {!isLocalOnlyMode() && (
                <InterfaceModeSettingsSection />
            )}

            <div className="p-5 bg-app-card rounded-xl border border-app-border shadow-ds-card">
                <h4 className="font-semibold text-app-text mb-1">Date display time zone</h4>
                <p className="text-sm text-app-muted mb-2">
                    When dates are stored with a time from the server (for example UTC), the app picks the calendar day in this time zone so lists and forms match what you selected (fixes a one-day shift in many regions).
                    {typeof Intl !== 'undefined' && Intl.DateTimeFormat ? (
                        <span className="block mt-1 text-xs text-app-muted">
                            This device: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                        </span>
                    ) : null}
                </p>
                <label htmlFor="display-timezone" className="block text-sm font-medium text-app-text mb-2">
                    Calendar dates
                </label>
                <p className="text-xs text-app-muted mb-2">Type a city or region (e.g. Dubai, Tokyo) or part of the zone name to filter.</p>
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
                                    userId: companyCtx?.authenticatedUser?.id ?? authUser?.id });
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

            <div className="p-5 bg-app-card rounded-xl border border-app-border shadow-ds-card">
                <h4 className="font-semibold text-app-text mb-2">WhatsApp sending</h4>
                <p className="text-sm text-app-muted mb-4">Choose how WhatsApp actions work across the app: use the in-app chat panel (API) or open WhatsApp so you can send the message yourself (manual).</p>
                <div className="space-y-3" role="radiogroup" aria-label="WhatsApp sending mode">
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-app-border hover:border-ds-primary/40 transition-colors">
                        <input
                            type="radio"
                            name="whatsapp-mode"
                            value="api"
                            checked={whatsAppMode === 'api'}
                            onChange={() => dispatch({ type: 'SET_WHATSAPP_MODE', payload: 'api' })}
                            className="mt-1 rounded-full text-ds-primary focus:ring-ds-primary h-4 w-4"
                        />
                        <div>
                            <span className="font-medium text-app-text">WhatsApp API</span>
                            <p className="text-xs text-app-muted mt-0.5">Use WhatsApp Business API and the in-app chat panel to send and receive messages.</p>
                        </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-app-border hover:border-ds-primary/40 transition-colors">
                        <input
                            type="radio"
                            name="whatsapp-mode"
                            value="manual"
                            checked={whatsAppMode === 'manual'}
                            onChange={() => dispatch({ type: 'SET_WHATSAPP_MODE', payload: 'manual' })}
                            className="mt-1 rounded-full text-ds-primary focus:ring-ds-primary h-4 w-4"
                        />
                        <div>
                            <span className="font-medium text-app-text">Manual WhatsApp</span>
                            <p className="text-xs text-app-muted mt-0.5">Create the message and open WhatsApp (desktop or web) so you can send it yourself.</p>
                        </div>
                    </label>
                </div>
            </div>

            <div className="p-5 bg-app-card rounded-xl border border-app-border shadow-ds-card">
                <h4 className="font-semibold text-app-text mb-2">Default Project</h4>
                <p className="text-sm text-app-muted mb-4">Set a default project that will be automatically selected in all forms.</p>
                <ComboBox
                    label=""
                    items={[{ id: '', name: 'None (No Default)' }, ...projects]}
                    selectedId={defaultProjectId || ''}
                    onSelect={(item) => dispatch({ type: 'UPDATE_DEFAULT_PROJECT', payload: item?.id || undefined })}
                    placeholder="Select default project..."
                    allowAddNew={false}
                />
            </div>
        </div>
    );

    const RentalInvoiceSettingsBlock: React.FC = () => {
        const settings = rentalInvoiceSettings || { prefix: 'INV-', nextNumber: 1, padding: 5, autoSendInvoiceWhatsApp: false };
        const [localSettings, setLocalSettings] = useState(settings);
        const handleChange = (field: string, val: string | number | boolean) => setLocalSettings(prev => ({ ...prev, [field]: val }));
        const handleSave = () => {
            const payload = { ...localSettings, nextNumber: parseInt(String(localSettings.nextNumber)) || 1, padding: parseInt(String(localSettings.padding)) || 4 };
            dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload });
            showToast('Rental Invoices updated!', 'success');
        };
        return (
            <div className="p-5 bg-app-card border border-app-border rounded-xl shadow-ds-card hover:shadow-md transition-shadow">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-app-text">Rental Invoices</h4>
                    <span className="text-xs font-mono bg-app-surface-2 px-2 py-1 rounded text-app-muted">
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
                        <span className="text-sm font-medium text-app-text">Auto-send invoice via WhatsApp when created</span>
                    </label>
                    <p className="text-xs text-app-muted mt-1 ml-6">When enabled, newly created rental/security deposit invoices are sent to the tenant via WhatsApp automatically.</p>
                </div>
                <Button variant="secondary" onClick={handleSave} className="mt-1 w-full">Update Settings</Button>
            </div>
        );
    };

    const renderIDSequences = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <IDSequenceSettingsBlock title="Rental Agreements" settings={agreementSettings} type="UPDATE_AGREEMENT_SETTINGS" />
            <RentalInvoiceSettingsBlock />
            <IDSequenceSettingsBlock title="Project Agreements" settings={projectAgreementSettings} type="UPDATE_PROJECT_AGREEMENT_SETTINGS" />
            <ProjectInvoiceSettingsBlock />
        </div>
    );

    const renderActionCard = (title: string, desc: string, icon: React.ReactNode, onClick: () => void, colorClass = "indigo") => (
        <button onClick={onClick} className={`p-6 bg-app-card border border-app-border rounded-xl shadow-ds-card hover:shadow-md hover:border-${colorClass}-300 transition-all text-left group h-full w-full`}>
            <div className="flex items-center gap-4 mb-3">
                <div className={`p-3 bg-${colorClass}-50 rounded-lg text-${colorClass}-600 group-hover:text-${colorClass}-800 transition-colors`}>
                    {icon}
                </div>
                <h4 className={`font-bold text-lg text-app-text group-hover:text-${colorClass}-700`}>{title}</h4>
            </div>
            <p className="text-sm text-app-muted leading-relaxed">{desc}</p>
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
            <div className="bg-app-card rounded-b-lg -mt-px animate-in fade-in slide-in-from-bottom-2 duration-300 p-6">
                {activePreferenceTab === 'General' && renderGeneralSettings()}
                {activePreferenceTab === 'Procurement' && (
                    <ProcurementSettingsSection settings={procurementSettings ?? {
                        enableQuotationValidationGlobally: true,
                        showWarningOnly: true,
                        varianceApprovalThreshold: 10,
                    }} />
                )}
                {activePreferenceTab === 'ID Sequences' && renderIDSequences()}
                {activePreferenceTab === 'Communication' && renderCommunicationBranding()}
                {activePreferenceTab === 'Tools' && renderToolsUtilities()}
            </div>
        </div>
    );

    const renderDataManagement = () => (
        <div className="space-y-6">
            {features.applicationUpdates && (
                <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-6">
                    <UpdateCheck />
                </div>
            )}

            {features.offlineMode && (
                <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-6">
                    <h4 className="font-bold text-app-text mb-4 flex items-center gap-2">
                        <div className="p-2 bg-[color:var(--badge-paid-bg)] text-ds-success rounded-lg"><div className="w-5 h-5">{ICONS.trendingUp}</div></div>
                        Database Health
                    </h4>
                    <DatabaseAnalyzer />
                </div>
            )}

            {perms.canReadAuditLogs && (
            <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-6">
                <h4 className="font-bold text-app-text mb-4 text-lg">Transaction Audits & Logs</h4>
                <button onClick={() => setIsTransactionLogOpen(true)} className="w-full p-4 bg-app-bg border border-app-border rounded-xl hover:bg-app-highlight hover:border-ds-primary/40 transition-all text-left flex items-center justify-between group">
                    <div>
                        <span className="font-semibold text-app-text block">View Transaction Log</span>
                        <span className="text-xs text-app-muted">Track history, deleted items, and restore data.</span>
                    </div>
                    <div className="text-app-muted group-hover:text-ds-primary shift-x-1 transition-transform">→</div>
                </button>
            </div>
            )}

            <div className="bg-app-card rounded-xl border border-ds-danger/30 shadow-ds-card p-6">
                <h3 className="font-bold text-lg mb-4 text-ds-danger flex items-center gap-2">{ICONS.alertTriangle} Danger Zone</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {perms.canManageUsers && (
                        <button onClick={() => setIsClearTransactionsModalOpen(true)} className="p-4 bg-[color:var(--badge-unpaid-bg)] border border-ds-danger/30 rounded-xl hover:bg-app-table-hover hover:border-ds-danger/50 transition-all text-left group">
                            <div className="font-bold text-ds-danger mb-1 flex items-center gap-2">{ICONS.trash} Clear Transactions</div>
                            <p className="text-xs text-app-text leading-relaxed">Deletes all financial data but keeps your entity structure (Accounts, Projects, etc.) intact.</p>
                            <p className="text-xs text-ds-warning mt-2 font-semibold">⚠️ Admin Only</p>
                        </button>
                    )}
                    {perms.canManageUsers && (
                        <button onClick={handleFactoryReset} className="p-4 bg-app-toolbar/40 border border-ds-danger/40 rounded-xl hover:bg-[color:var(--badge-unpaid-bg)] hover:border-ds-danger/60 transition-all text-left group">
                            <div className="font-bold text-ds-danger mb-1 flex items-center gap-2">{ICONS.alertTriangle} Factory Reset</div>
                            <p className="text-xs text-app-muted leading-relaxed">Completely wipes ALL data and restores the application to a fresh install state.</p>
                            <p className="text-xs text-ds-warning mt-2 font-semibold">⚠️ Admin Only</p>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    const showDetail = !!editingEntity;

    if (showDetail) {
        return (
            <div className="p-6 bg-app-bg h-full overflow-auto">
                <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border">
                    <SettingsDetailPage goBack={() => { }} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-full bg-app-bg overflow-hidden font-sans">
            {/* SIDEBAR */}
            <div className={`w-full md:w-64 bg-app-card border-b md:border-b-0 md:border-r border-app-border flex flex-col flex-shrink-0 z-20 transition-all duration-300`}>
                <div className="p-4 md:p-6 border-b border-app-border flex items-center justify-between md:block">
                    <div>
                        <h1 className="text-xl md:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-ds-primary to-violet-600 tracking-tight">Settings</h1>
                        <p className="text-[10px] md:text-xs text-app-muted font-medium mt-1 uppercase tracking-wider">Control Panel</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto md:overflow-y-auto p-2 md:p-4 flex flex-row md:flex-col gap-2 md:space-y-8 overflow-x-auto no-scrollbar">
                    {categoryGroups.map((group, groupIdx) => {
                        const visibleItems = group.items.filter(item => settingCategories.some(cat => cat.id === item.id));
                        if (visibleItems.length === 0) return null;

                        return (
                            <div key={groupIdx} className="flex flex-row md:flex-col gap-1 md:gap-0">
                                <NavSectionLabel as="h3" variant="section" className="hidden md:block mb-2">{group.title}</NavSectionLabel>
                                <div className="flex flex-row md:flex-col gap-1">
                                    {visibleItems.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => { setActiveCategory(item.id); setSearchQuery(''); }}
                                            data-tour={
                                                item.id === 'contacts'
                                                    ? 'settings-contacts'
                                                    : item.id === 'assets'
                                                      ? 'settings-assets'
                                                      : item.id === 'accounts'
                                                        ? 'settings-chart-of-accounts'
                                                        : undefined
                                            }
                                            className={`whitespace-nowrap flex items-center gap-2 md:gap-3 px-3 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-medium transition-all duration-200 group ${activeCategory === item.id ? 'bg-ds-primary text-white shadow-ds-card' : 'text-app-muted hover:bg-app-highlight hover:text-app-text'}`}
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
            <div className="flex-1 flex flex-col min-w-0 bg-app-bg">
                {/* Offline Banner */}
                {isOffline && (
                    <div className="px-8 py-4 bg-amber-50 border-b-2 border-amber-200">
                        <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                                <svg className="w-6 h-6 text-ds-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-ds-warning">
                                    Settings changes are disabled while offline
                                </p>
                                <p className="text-xs text-ds-warning mt-0.5">
                                    You can view settings, but changes won't be saved until you're back online.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className={`px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 bg-app-bg/95 backdrop-blur z-30 ${activeCategory === 'contacts' || activeCategory === 'assets' ? 'py-2' : 'py-6'}`}>
                    {activeCategory !== 'contacts' && activeCategory !== 'assets' && (
                        <div>
                            <h2 className="text-3xl font-bold text-app-text tracking-tight">{flatCategories.find(c => c.id === activeCategory)?.label}</h2>
                            <p className="text-app-muted text-sm mt-1">Manage your {flatCategories.find(c => c.id === activeCategory)?.label.toLowerCase()} preferences and data.</p>
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
                                        className="w-64 bg-app-card border-app-border shadow-ds-card focus:ring-2 focus:ring-ds-primary/20 transition-all rounded-lg pl-10"
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted group-focus-within:text-ds-primary transition-colors">
                                        <div className="w-4 h-4">{ICONS.fileText}</div>
                                    </div>
                                    {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-muted"><div className="w-4 h-4">{ICONS.x}</div></button>}
                                </div>
                                {activeCategory === 'accounts' ? (
                                    <div className="relative">
                                        <Button
                                            onClick={() => setIsAddNewMenuOpen(!isAddNewMenuOpen)}
                                            disabled={isOffline}
                                            className="bg-ds-primary hover:bg-ds-primary-hover text-white shadow-lg shadow-ds-primary/20 border-0 rounded-lg px-4 py-2.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                <div className="absolute right-0 mt-2 w-56 bg-app-popover rounded-lg shadow-xl border border-app-border z-50 py-1">
                                                    <button
                                                        onClick={() => handleAddNew('ACCOUNT')}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-app-text hover:bg-app-highlight hover:text-ds-primary flex items-center gap-2 transition-colors"
                                                    >
                                                        <div className="w-4 h-4">{ICONS.wallet}</div>
                                                        <span>Account</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleAddNew('CATEGORY_INCOME')}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-app-text hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 transition-colors"
                                                    >
                                                        <div className="w-4 h-4">{ICONS.arrowUp}</div>
                                                        <span>Income Category</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleAddNew('CATEGORY_EXPENSE')}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-app-text hover:bg-rose-50 hover:text-ds-danger flex items-center gap-2 transition-colors"
                                                    >
                                                        <div className="w-4 h-4">{ICONS.arrowDown}</div>
                                                        <span>Expense Category</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <Button onClick={() => handleAddNew()} className="bg-ds-primary hover:bg-ds-primary-hover text-white shadow-lg shadow-ds-primary/20 border-0 rounded-lg px-4 py-2.5 flex items-center gap-2">
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
                                                ? 'bg-ds-primary text-white shadow-ds-card'
                                                : 'bg-app-card border border-app-border text-app-muted hover:bg-app-highlight hover:border-app-border'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {isTableViewCategory ? renderTable() : null}
                        {activeCategory === 'users' && (
                            <Suspense fallback={<div className="flex items-center justify-center py-12 text-app-muted">Loading...</div>}>
                                <UserManagement />
                            </Suspense>
                        )}
                        {activeCategory === 'preferences' && renderPreferences()}
                        {activeCategory === 'license' && (
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden p-6">
                                <CustomerBillingPortal />
                            </div>
                        )}
                        {activeCategory === 'setup-wizard' && onboarding?.canManage && (
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden p-6 space-y-4">
                                <h2 className="text-lg font-semibold text-app-text">Organization setup wizard</h2>
                                <p className="text-sm text-app-muted">
                                  Resume guided onboarding for company profile, fiscal year, properties, and users.
                                  Progress is saved automatically.
                                </p>
                                {onboarding.state && (
                                  <p className="text-sm text-app-muted">
                                    Status: <span className="font-medium capitalize">{onboarding.state.status.replace('_', ' ')}</span>
                                    {' · '}
                                    {onboarding.state.progressPercent}% complete
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-3">
                                  <Button
                                    onClick={() => {
                                      try {
                                        sessionStorage.removeItem('pbooks_onboarding_dismissed_session');
                                      } catch {
                                        /* ignore */
                                      }
                                      onboarding.setOpen(true);
                                    }}
                                  >
                                    Resume wizard
                                  </Button>
                                  <Button variant="secondary" onClick={() => void onboarding.restart()}>
                                    Restart from beginning
                                  </Button>
                                </div>
                            </div>
                        )}
                        {activeCategory === 'admin-subscriptions' && (
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden p-6">
                                <AdminSubscriptionDashboard />
                            </div>
                        )}
                        {activeCategory === 'admin-monitoring' && (
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden p-6">
                                <AdminMonitoringDashboard />
                            </div>
                        )}
                        {activeCategory === 'admin-referrals' && (
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden p-6">
                                <AdminReferralDashboard />
                            </div>
                        )}
                        {activeCategory === 'backup' && (
                            <Suspense fallback={<div className="flex items-center justify-center py-12 text-app-muted">Loading...</div>}>
                                <BackupRestorePage />
                            </Suspense>
                        )}
                        {activeCategory === 'privacy' && !isLocalOnlyMode() && (
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden p-6">
                                <Suspense fallback={<div className="flex items-center justify-center py-12 text-app-muted">Loading...</div>}>
                                    <PrivacyCenter />
                                </Suspense>
                            </div>
                        )}
                        {activeCategory === 'mfa' && !isLocalOnlyMode() && (
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden p-6">
                                <Suspense fallback={<div className="flex items-center justify-center py-12 text-app-muted">Loading...</div>}>
                                    <MfaSettingsSection />
                                </Suspense>
                            </div>
                        )}
                        {activeCategory === 'data' && renderDataManagement()}
                        {activeCategory === 'application-update' && features.applicationUpdates && (
                            <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-6">
                                <UpdateCheck />
                            </div>
                        )}
                        {activeCategory === 'about' && <AboutSection />}
                        {activeCategory === 'help' && (
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden p-4 sm:p-6">
                                <CustomerSuccessCenter
                                    onOpenSettingsTab={setActiveCategory}
                                    initialSection={helpDeepLink?.section}
                                    initialArticleId={helpDeepLink?.articleId ?? null}
                                />
                            </div>
                        )}
                        {activeCategory === 'contacts' && (
                            <Suspense fallback={<div className="flex items-center justify-center py-12 text-app-muted">Loading...</div>}>
                                <ContactsManagement />
                            </Suspense>
                        )}
                        {activeCategory === 'assets' && (
                            <Suspense fallback={<div className="flex items-center justify-center py-12 text-app-muted">Loading...</div>}>
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
                        {activeCategory === 'permissions' && showPermissionManagement && (
                            <PermissionManagementSection />
                        )}
                        {activeCategory === 'audit-trail' && perms.canReadAuditLogs && !isLocalOnlyMode() && (
                            <EnterpriseAuditViewer key={authTenant?.id ?? 'no-tenant'} />
                        )}
                        {activeCategory === 'accounting-periods' && !isLocalOnlyMode() && (
                            <AccountingPeriodsSection isAdmin={perms.canManageUsers} />
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


            <Modal
                isOpen={activePreferenceModal === 'messaging'}
                onClose={() => {
                    const api = messagingTemplatesFormRef.current;
                    if (api) api.requestCloseWithDiscardConfirm(closeMessagingTemplatesModal);
                    else closeMessagingTemplatesModal();
                }}
                title="Messaging Templates"
                size="xl"
            >
                <MessagingTemplatesForm ref={messagingTemplatesFormRef} onClose={closeMessagingTemplatesModal} />
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

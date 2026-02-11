
import React, { useState, useMemo, useEffect } from 'react';
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
import { Project, ContactType, TransactionType, AccountType, ProjectAgreementStatus, AgreementSettings, InvoiceSettings } from '../../types';
import SettingsLedgerModal from './SettingsLedgerModal';
import UserManagement from './UserManagement';
import DatabaseAnalyzer from './DatabaseAnalyzer';
import UpdateCheck from './UpdateCheck';
import { ImportType } from '../../services/importService';
import BackupRestorePage from './BackupRestorePage';
import PropertyTransferModal from './PropertyTransferModal';
import MigratAIWizard from './MigratAIWizard';
import LicenseManagement from '../license/LicenseManagement';
import { Property } from '../../types';
import ClearTransactionsModal from './ClearTransactionsModal';
import ClearPosDataModal from './ClearPosDataModal';
import { dataManagementApi } from '../../services/api/repositories/dataManagementApi';
import { getDatabaseService } from '../../services/database/databaseService';
import { apiClient } from '../../services/api/client';
import ContactsManagement from './ContactsManagement';
import AssetsManagement from './AssetsManagement';
import TaskRolesPage from '../tasks/TaskRolesPage';

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

const SettingsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { user: authUser } = useAuth();
    const { showConfirm, showToast, showAlert } = useNotification();
    const { setVisibleKpiIds } = useKpis();
    const { isOffline } = useOffline();

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

    // Fetch current tenant supplier status
    useEffect(() => {
        const fetchSupplierStatus = async () => {
            if (isOffline) return;
            try {
                setIsCheckingSupplierStatus(true);
                const tenantInfo = await apiClient.get<{ is_supplier?: boolean }>('/tenants/me');
                const supplierStatus = !!tenantInfo.is_supplier;
                setIsSupplier(supplierStatus);
            } catch (error) {
                console.error('Error fetching supplier status:', error);
            } finally {
                setIsCheckingSupplierStatus(false);
            }
        };
        fetchSupplierStatus();
    }, [isOffline]);

    // Close dropdown when navigating away from accounts view
    useEffect(() => {
        if (activeCategory !== 'accounts') {
            setIsAddNewMenuOpen(false);
        }
    }, [activeCategory]);

    const [searchQuery, setSearchQuery] = useState('');
    const [isErrorLogOpen, setIsErrorLogOpen] = useState(false);
    const [isTransactionLogOpen, setIsTransactionLogOpen] = useState(false);
    const [activePreferenceModal, setActivePreferenceModal] = useState<'messaging' | 'print' | 'whatsapp' | 'whatsapp-menu' | null>(null);
    const [activePreferenceTab, setActivePreferenceTab] = useState<string>('General');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'asc' });
    const [ledgerModalState, setLedgerModalState] = useState<{ isOpen: boolean; entityId: string; entityType: 'account' | 'category' | 'contact' | 'project' | 'building' | 'property' | 'unit'; entityName: string } | null>(null);
    const [propertyToTransfer, setPropertyToTransfer] = useState<Property | null>(null);
    const [isSupplier, setIsSupplier] = useState<boolean>(false);
    const [isCheckingSupplierStatus, setIsCheckingSupplierStatus] = useState<boolean>(false);
    const [isUpgradingToSupplier, setIsUpgradingToSupplier] = useState<boolean>(false);
    const [isMigrationWizardOpen, setIsMigrationWizardOpen] = useState(false);
    const [isAddNewMenuOpen, setIsAddNewMenuOpen] = useState(false);
    const [isClearTransactionsModalOpen, setIsClearTransactionsModalOpen] = useState(false);
    const [isClearPosDataModalOpen, setIsClearPosDataModalOpen] = useState(false);

    // Check if user is admin - use AuthContext user (cloud auth) or fallback to AppContext currentUser (local)
    const isAdmin = authUser?.role === 'Admin' || state.currentUser?.role === 'Admin';

    // Grouped Categories for Sidebar
    const categoryGroups = [
        {
            title: 'General',
            items: [
                { id: 'preferences', label: 'Preferences', icon: ICONS.settings },
                { id: 'license', label: 'License & Subscription', icon: ICONS.lock || '🔒' },
                ...(isAdmin ? [
                    { id: 'users', label: 'Users & Access', icon: ICONS.users },
                    { id: 'taskRoles', label: 'Task Roles', icon: ICONS.userCheck || '✅' }
                ] : []),
                { id: 'backup', label: 'Backup & Restore', icon: ICONS.download },
                { id: 'data', label: 'Data Management', icon: ICONS.trash }, // Changed Icon
                { id: 'help', label: 'Help & Guide', icon: ICONS.fileText },
            ]
        },
        {
            title: 'Operations',
            items: [
                { id: 'projects', label: 'Projects & Tasks', icon: ICONS.briefcase },
            ]
        },
        {
            title: 'Financial',
            items: [
                { id: 'accounts', label: 'Chart of Accounts', icon: ICONS.wallet },
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
    }, [isAdmin, flatCategories]);

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

    const tableData = useMemo<TableRowData[]>(() => {
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
            state.categories.forEach(cat => accountMap.set(cat.id, { ...cat, children: [], balance: balances.get(cat.id) || 0 }));
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
                    flattened.push({
                        id: item.id,
                        name: item.name,
                        type: item.type || (item.entityKind === 'CATEGORY' ? 'Category' : AccountType.ASSET),
                        isSystem: !!item.isPermanent,
                        balance: displayBalance,
                        entityKind: 'balance' in item && !('parentCategoryId' in item) ? 'ACCOUNT' : 'CATEGORY',
                        originalItem: item,
                        level
                    });
                    if (item.children.length > 0) flatten(item.children, level + 1);
                });
            };
            flatten(rootItems);
            let finalData = flattened;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                finalData = flattened.filter(item => item.name.toLowerCase().includes(q));
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
    }, [state, activeCategory, searchQuery, sortConfig]);

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

            // Step 1: Clear from cloud database (server)
            console.log('📡 Clearing transactions from cloud database...');
            const result = await dataManagementApi.clearTransactions();
            console.log('✅ Cloud database cleared:', result.details);

            // Step 2: Clear from local database
            console.log('💾 Clearing transactions from local database...');
            const dbService = getDatabaseService();
            if (dbService.isReady()) {
                dbService.clearTransactionData();
                console.log('✅ Local database cleared');
            }

            // Step 3: Update in-memory state
            console.log('🔄 Updating application state...');
            dispatch({ type: 'RESET_TRANSACTIONS' });
            console.log('✅ Application state updated');

            showToast(
                `Successfully cleared ${result.details.recordsDeleted} transaction records from local and cloud databases.`,
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

    const handleClearPosData = async () => {
        try {
            console.log('🧹 Starting clear POS data process...');

            // Step 1: Clear from cloud database (server)
            console.log('📡 Clearing POS data from cloud database...');
            const result = await dataManagementApi.clearPosData();
            console.log('✅ Cloud POS data cleared:', result.details);

            // Step 2: Clear from local database
            console.log('💾 Clearing POS data from local database...');
            const dbService = getDatabaseService();
            if (dbService.isReady()) {
                dbService.clearPosData();
                console.log('✅ Local POS data cleared');
            }

            showToast(
                `Successfully cleared ${result.details.recordsDeleted} POS records from local and cloud databases.`,
                'success'
            );
        } catch (error: any) {
            console.error('❌ Error clearing POS data:', error);
            showAlert(
                error?.message || 'Failed to clear POS data. Please try again.',
                { title: 'Error' }
            );
            throw error;
        }
    };
    const handleFactoryReset = async () => {
        if (await showConfirm('FACTORY RESET WARNING: This will wipe ALL data and return the app to a fresh install state. \n\nAre you absolutely sure?', { title: 'Factory Reset', confirmLabel: 'Wipe Everything', cancelLabel: 'Cancel' })) {
            dispatch({ type: 'LOAD_SAMPLE_DATA' });
            showToast('App has been reset.', 'success');
        }
    };

    const handleUpgradeToSupplier = async () => {
        if (isSupplier) {
            await showAlert('This organization is already a supplier.');
            return;
        }

        const confirmed = await showConfirm(
            'Upgrade this organization to supplier? This will enable supplier features and allow you to participate in procurement-to-pay transactions. This action cannot be undone.',
            { title: 'Upgrade to Supplier', confirmLabel: 'Upgrade', cancelLabel: 'Cancel' }
        );

        if (!confirmed) return;

        try {
            setIsUpgradingToSupplier(true);
            await apiClient.put('/tenants/me', { isSupplier: true });
            setIsSupplier(true);
            showToast('Organization successfully upgraded to supplier!', 'success');
        } catch (error: any) {
            console.error('Error upgrading to supplier:', error);
            await showAlert(error.message || error.error || 'Failed to upgrade to supplier. Please try again.');
        } finally {
            setIsUpgradingToSupplier(false);
        }
    };

    const isTableViewCategory = !!columnConfig[activeCategory];
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
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => handleEdit(e, item)} className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 p-1.5 rounded-md transition-colors" title="Edit"><div className="w-4 h-4">{ICONS.edit}</div></button>
                                                {activeCategory === 'properties' && (
                                                    <button onClick={(e) => handleTransferProperty(e, item)} className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-md transition-colors" title="Transfer"><div className="w-4 h-4">{ICONS.arrowRight}</div></button>
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
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
                <div className="w-12 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
        </div>
    );

    const renderGeneralSettings = () => (
        <div className="space-y-4">
            {renderToggle('Show System Transactions', 'Display automated system entries (like service charge deductions) in the main ledger.', state.showSystemTransactions, (val) => dispatch({ type: 'TOGGLE_SYSTEM_TRANSACTIONS', payload: val }))}
            {renderToggle('Enable Color Coding', 'Use project/building specific colors in lists and forms for better visual distinction.', state.enableColorCoding, (val) => dispatch({ type: 'TOGGLE_COLOR_CODING', payload: val }))}
            {renderToggle('Enable Beep on Save', 'Play a sound notification when transactions or records are saved successfully.', state.enableBeepOnSave, (val) => dispatch({ type: 'TOGGLE_BEEP_ON_SAVE', payload: val }))}
            {renderToggle('Date Preservation', 'Remember the last used date in forms to speed up data entry for past records.', state.enableDatePreservation, (val) => dispatch({ type: 'TOGGLE_DATE_PRESERVATION', payload: val }))}

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

            {!isSupplier && (
                <div className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-200 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <h4 className="font-semibold text-indigo-900 mb-1 text-lg">Upgrade to Supplier</h4>
                            <p className="text-sm text-indigo-700 mb-4">
                                Enable supplier features to participate in procurement-to-pay transactions. As a supplier, you can receive purchase orders, send invoices, and manage your business relationships with buyers.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="primary"
                        onClick={handleUpgradeToSupplier}
                        disabled={isUpgradingToSupplier || isOffline}
                        className="w-full"
                    >
                        {isUpgradingToSupplier ? 'Upgrading...' : 'Upgrade to Supplier'}
                    </Button>
                </div>
            )}

            {isSupplier && (
                <div className="p-5 bg-green-50 rounded-xl border-2 border-green-200 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg text-green-600">
                            {ICONS.checkCircle}
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-green-900 mb-1">Supplier Status Active</h4>
                            <p className="text-sm text-green-700">
                                This organization is registered as a supplier and can participate in procurement-to-pay transactions.
                            </p>
                        </div>
                    </div>
                </div>
            )}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><div className="w-5 h-5">{ICONS.trendingUp}</div></div>
                        Database Health
                    </h4>
                    <DatabaseAnalyzer />
                </div>

                <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-100 shadow-sm p-6 relative overflow-hidden">
                    <div className="relative z-10">
                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">Data Migration</h4>
                        <p className="text-sm text-slate-600 mb-6">Import data from Excel or CSV with AI-powered mapping.</p>
                        <Button onClick={() => setIsMigrationWizardOpen(true)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md border-0">
                            Open Migration Wizard
                        </Button>
                    </div>
                    <div className="absolute -bottom-4 -right-4 text-indigo-100 opacity-50 transform rotate-12">
                        <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    </div>
                </div>
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
                    {isAdmin && (
                        <button onClick={() => setIsClearPosDataModalOpen(true)} className="p-4 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 hover:border-rose-300 transition-all text-left group">
                            <div className="font-bold text-rose-700 mb-1 flex items-center gap-2">{ICONS.trash} Clear POS Data</div>
                            <p className="text-xs text-rose-600/80 leading-relaxed">Deletes POS/Shop module data (products, inventory, sales, loyalty, branches/terminals).</p>
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
                        {isTableViewCategory ? renderTable() : null}
                        {activeCategory === 'users' && <UserManagement />}
                        {activeCategory === 'taskRoles' && <TaskRolesPage />}
                        {activeCategory === 'preferences' && renderPreferences()}
                        {activeCategory === 'license' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <LicenseManagement />
                            </div>
                        )}
                        {activeCategory === 'backup' && <BackupRestorePage />}
                        {activeCategory === 'data' && renderDataManagement()}
                        {activeCategory === 'help' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <HelpSection />
                            </div>
                        )}
                        {activeCategory === 'contacts' && <ContactsManagement />}
                        {activeCategory === 'assets' && <AssetsManagement />}
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

            <Modal isOpen={isMigrationWizardOpen} onClose={() => setIsMigrationWizardOpen(false)} title="Data Migration Wizard" size="xl">
                <div className="h-[80vh]">
                    <MigratAIWizard onClose={() => setIsMigrationWizardOpen(false)} />
                </div>
            </Modal>

            <ClearTransactionsModal
                isOpen={isClearTransactionsModalOpen}
                onClose={() => setIsClearTransactionsModalOpen(false)}
                onConfirm={handleClearTransactions}
            />

            <ClearPosDataModal
                isOpen={isClearPosDataModalOpen}
                onClose={() => setIsClearPosDataModalOpen(false)}
                onConfirm={handleClearPosData}
            />
        </div>
    );
};

export default SettingsPage;

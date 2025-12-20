
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import SettingsDetailPage from './SettingsDetailPage';
import { useKpis } from '../../context/KPIContext';
import { createBackup, restoreBackup } from '../../services/backupService';
import { exportToExcel } from '../../services/exportService';
import { useProgress } from '../../context/ProgressContext';
import ErrorLogViewer from './ErrorLogViewer';
import TransactionLogViewer from './TransactionLogViewer';
import MessagingTemplatesForm from './MessagingTemplatesForm';
import PrintTemplateForm from './PrintTemplateForm';
import InstallmentConfigForm from './InstallmentConfigForm';
import HelpSection from './HelpSection';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import { Project, ContactType, TransactionType, AccountType, ProjectAgreementStatus, AgreementSettings, InvoiceSettings, AppAction } from '../../types';
import SettingsLedgerModal from './SettingsLedgerModal';
import UserManagement from './UserManagement';
import DatabaseAnalyzer from './DatabaseAnalyzer';
import UpdateCheck from './UpdateCheck';
import { ImportType } from '../../services/importService';

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
    const { showConfirm, showToast } = useNotification();
    const progress = useProgress();
    const { setVisibleKpiIds } = useKpis();
    
    // Detect Mobile
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        
        window.addEventListener('resize', handleResize);
        
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const [activeCategory, setActiveCategory] = useState(isMobile ? 'data' : 'preferences');
    
    // Force active category to 'data' if on mobile and current is not allowed
    useEffect(() => {
        if (isMobile && activeCategory !== 'data') {
            setActiveCategory('data');
        }
    }, [isMobile]);

    const [searchQuery, setSearchQuery] = useState('');
    const [isErrorLogOpen, setIsErrorLogOpen] = useState(false);
    const [isTransactionLogOpen, setIsTransactionLogOpen] = useState(false);
    
    // Project Installment Configuration State
    const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
    const [projectToConfig, setProjectToConfig] = useState<Project | null>(null);
    
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Preference Modals
    const [activePreferenceModal, setActivePreferenceModal] = useState<'messaging' | 'print' | null>(null);

    // Table Sorting & Ledger Modal
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'asc' });
    const [ledgerModalState, setLedgerModalState] = useState<{ isOpen: boolean; entityId: string; entityType: 'account' | 'category' | 'contact' | 'project' | 'building' | 'property' | 'unit'; entityName: string } | null>(null);

    const isAdmin = state.currentUser?.role === 'Admin';

    const allCategories = [
        { id: 'preferences', label: 'My Preferences', icon: ICONS.settings },
        ...(isAdmin && !isMobile ? [{ id: 'users', label: 'User Management', icon: ICONS.users }] : []),
        { id: 'accounts', label: 'Chart of Accounts', icon: ICONS.wallet },
        { id: 'owners', label: 'Owners', icon: ICONS.briefcase },
        { id: 'tenants', label: 'Tenants', icon: ICONS.users },
        { id: 'brokers', label: 'Brokers', icon: ICONS.users },
        { id: 'friends', label: 'Friends & Family', icon: ICONS.users },
        
        { id: 'projects', label: 'Projects', icon: ICONS.archive },
        { id: 'buildings', label: 'Buildings', icon: ICONS.building },
        { id: 'properties', label: 'Rental Properties', icon: ICONS.home },
        { id: 'units', label: 'Project Units', icon: ICONS.building },
        
        { id: 'data', label: 'Data Management', icon: ICONS.download },
        { id: 'help', label: 'Help & Guide', icon: ICONS.fileText },
    ];

    const settingCategories = useMemo(() => {
        if (isMobile) {
            return allCategories.filter(c => c.id === 'data');
        }
        return allCategories;
    }, [isMobile, isAdmin]);

    // --- Column Configuration ---
    const columnConfig: Record<string, ColumnDef[]> = {
        accounts: [
            { key: 'name', label: 'Name', render: (val, row) => (
                <div style={{ paddingLeft: `${(row.level || 0) * 20}px` }} className="flex items-center gap-2">
                    {row.level && row.level > 0 ? <span className="text-slate-300">└</span> : null}
                    {val}
                </div>
            ) },
            { key: 'type', label: 'Type' },
            { key: 'isSystem', label: 'System', render: (val) => val ? 'Yes' : 'No' },
            { key: 'balance', label: 'Balance Total', isNumeric: true }
        ],
        owners: [
            { key: 'name', label: 'Name' },
            { key: 'type', label: 'Type' },
            { key: 'contactNo', label: 'Phone' },
            { key: 'balance', label: 'Balance Total', isNumeric: true }
        ],
        tenants: [
            { key: 'name', label: 'Name' },
            { key: 'type', label: 'Type' },
            { key: 'contactNo', label: 'Phone' },
            { key: 'balance', label: 'Balance Total', isNumeric: true }
        ],
        brokers: [
            { key: 'name', label: 'Name' },
            { key: 'type', label: 'Type' },
            { key: 'contactNo', label: 'Phone' },
            { key: 'balance', label: 'Balance Total', isNumeric: true }
        ],
        friends: [
            { key: 'name', label: 'Name' },
            { key: 'contactNo', label: 'Phone' },
            { key: 'balance', label: 'Balance Total', isNumeric: true }
        ],
        projects: [
            { key: 'name', label: 'Name', render: (val, row) => (
                <div className="flex items-center gap-2">
                    {row.originalItem.color && <div className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: row.originalItem.color }}></div>}
                    {val}
                </div>
            ) },
            { key: 'description', label: 'Description' },
            { key: 'installmentPlan', label: 'Installment Config' },
            { key: 'balance', label: 'Net Balance', isNumeric: true }
        ],
        buildings: [
            { key: 'name', label: 'Name', render: (val, row) => (
                <div className="flex items-center gap-2">
                    {row.originalItem.color && <div className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: row.originalItem.color }}></div>}
                    {val}
                </div>
            ) },
            { key: 'description', label: 'Description' },
            { key: 'balance', label: 'Net Balance', isNumeric: true }
        ],
        properties: [
            { key: 'name', label: 'Name' },
            { key: 'building', label: 'Building' },
            { key: 'owner', label: 'Owner' },
            { key: 'serviceCharge', label: 'Service Charge', isNumeric: true },
            { key: 'description', label: 'Description' },
            { key: 'balance', label: 'Net Balance', isNumeric: true }
        ],
        units: [
            { key: 'name', label: 'Name' },
            { key: 'project', label: 'Project' },
            { key: 'owner', label: 'Owner' },
            { key: 'salePrice', label: 'Sale Price', isNumeric: true },
            { key: 'description', label: 'Description' },
            { key: 'balance', label: 'Net Balance', isNumeric: true }
        ]
    };

    // --- Data Preparation ---
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
        } else {
            let data: TableRowData[] = [];
            if (['owners', 'tenants', 'brokers', 'friends'].includes(activeCategory)) {
                let contacts = state.contacts;
                if (activeCategory === 'owners') contacts = contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
                else if (activeCategory === 'tenants') contacts = contacts.filter(c => c.type === ContactType.TENANT);
                else if (activeCategory === 'brokers') contacts = contacts.filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER);
                else if (activeCategory === 'friends') contacts = contacts.filter(c => c.type === ContactType.FRIEND_FAMILY);
                data = contacts.map(contact => ({
                    id: contact.id, name: contact.name, type: contact.type, contactNo: contact.contactNo || '-',
                    balance: balances.get(contact.id) || 0, originalItem: contact
                }));
            } else if (activeCategory === 'projects') {
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
            switch(activeCategory) {
                case 'accounts': type = 'ACCOUNT'; break; 
                case 'owners': type = 'CONTACT_OWNER'; break;
                case 'tenants': type = 'CONTACT_TENANT'; break;
                case 'brokers': type = 'CONTACT_BROKER'; break;
                case 'friends': type = 'CONTACT_FRIEND'; break;
                case 'projects': type = 'PROJECT'; break;
                case 'buildings': type = 'BUILDING'; break;
                case 'properties': type = 'PROPERTY'; break;
                case 'units': type = 'UNIT'; break;
            }
        }
        if (type) dispatch({ type: 'SET_EDITING_ENTITY', payload: { type, id: '' } });
    };

    const handleEdit = (e: React.MouseEvent, item: TableRowData) => {
        e.stopPropagation();
        let type = '';
        switch(activeCategory) {
            case 'accounts': type = item.entityKind === 'CATEGORY' ? 'CATEGORY' : 'ACCOUNT'; break;
            case 'owners': type = 'CONTACT_OWNER'; break;
            case 'tenants': type = 'CONTACT_TENANT'; break;
            case 'brokers': type = 'CONTACT_BROKER'; break;
            case 'friends': type = 'CONTACT_FRIEND'; break;
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
        else if (['owners', 'tenants', 'brokers', 'friends'].includes(activeCategory)) entityType = 'contact';
        else if (activeCategory === 'projects') entityType = 'project';
        else if (activeCategory === 'buildings') entityType = 'building';
        else if (activeCategory === 'properties') entityType = 'property';
        else if (activeCategory === 'units') entityType = 'unit';
        if (entityType) setLedgerModalState({ isOpen: true, entityId: item.id, entityType, entityName: item.name });
    };

    const handleBackup = () => createBackup(progress, dispatch);
    const handleRestoreClick = () => fileInputRef.current?.click();
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) restoreBackup(file, dispatch, progress);
    };
    const handleImportExcel = () => dispatch({ type: 'SET_PAGE', payload: 'import' });
    const handleExportExcel = () => {
        const filename = `MyAccountant_Data_${new Date().toISOString().split('T')[0]}.xlsx`;
        exportToExcel(state, filename, progress, dispatch);
    };
    const handleResetDashboard = () => {
        if (confirm('Reset dashboard layout to default KPIs?')) {
            const DEFAULT_VISIBLE_KPIS = ['totalBalance', 'accountsReceivable', 'accountsPayable', 'outstandingLoan'];
            setVisibleKpiIds(DEFAULT_VISIBLE_KPIS);
        }
    };
    const handleClearTransactions = async () => {
        if (await showConfirm('Are you sure you want to delete ALL transactions, invoices, bills, and payslips? \n\nThis action is irreversible and will clear your financial ledger while keeping accounts, contacts, and project settings.', { title: 'Clear All Transactions', confirmLabel: 'Clear Data', cancelLabel: 'Cancel' })) {
            dispatch({ type: 'RESET_TRANSACTIONS' });
            showToast('All transactions have been cleared.', 'success');
        }
    };
    const handleFactoryReset = async () => {
         if (await showConfirm('FACTORY RESET WARNING: This will wipe ALL data (accounts, contacts, projects, transactions) and return the app to a fresh install state. \n\nAre you absolutely sure?', { title: 'Factory Reset', confirmLabel: 'Wipe Everything', cancelLabel: 'Cancel' })) {
            dispatch({ type: 'LOAD_SAMPLE_DATA' });
            showToast('App has been reset.', 'success');
         }
    };
    const handleSaveInstallmentConfig = (updatedProject: Project) => {
        dispatch({ type: 'UPDATE_PROJECT', payload: updatedProject });
        setProjectToConfig(null);
        showToast('Installment plan configured successfully.', 'success');
    };

    const isTableViewCategory = !!columnConfig[activeCategory];
    const SortHeader: React.FC<{ label: string; sortKey: string; align?: string }> = ({ label, sortKey, align = 'left' }) => (
        <th className={`px-4 py-3 text-${align} text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none sticky top-0 bg-slate-50 z-10 shadow-sm`} onClick={() => handleSort(sortKey)}>
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {label}
                {sortConfig.key === sortKey && <span className="text-accent">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
            </div>
        </th>
    );

    const renderTable = () => {
        const columns = columnConfig[activeCategory] || [];
        return (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
                <div className="overflow-x-auto flex-grow">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                {columns.map(col => <SortHeader key={col.key} label={col.label} sortKey={col.key} align={col.isNumeric ? 'right' : 'left'} />)}
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0 bg-gray-50 z-10">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {tableData.map((item) => (
                                <tr key={item.id} onClick={() => handleRowClick(item)} className="hover:bg-gray-50 cursor-pointer transition-colors group">
                                    {columns.map(col => (
                                        <td key={col.key} className={`px-4 py-3 whitespace-nowrap text-sm ${col.isNumeric ? 'text-right' : 'text-gray-700'}`}>
                                            {col.render ? col.render(item[col.key], item) : (col.isNumeric ? <span className={`font-bold ${item[col.key] >= 0 ? 'text-gray-700' : 'text-red-600'}`}>{CURRENCY} {(item[col.key] || 0).toLocaleString()}</span> : item[col.key])}
                                        </td>
                                    ))}
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={(e) => handleEdit(e, item)} className="text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 p-2 rounded-full transition-colors" title="Edit Settings"><div className="w-4 h-4">{ICONS.edit}</div></button>
                                    </td>
                                </tr>
                            ))}
                            {tableData.length === 0 && <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-500">No items found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // ID Sequence Block - same as before
    const IDSequenceSettingsBlock: React.FC<{ title: string, settings: AgreementSettings | InvoiceSettings, type: string }> = ({ title, settings, type }) => {
        const [localSettings, setLocalSettings] = useState(settings);
        const handleChange = (field: string, val: string | number) => setLocalSettings(prev => ({ ...prev, [field]: val }));
        const handleSave = () => {
            const payload = { ...localSettings, nextNumber: parseInt(String(localSettings.nextNumber)) || 1, padding: parseInt(String(localSettings.padding)) || 4 };
            dispatch({ type: type as any, payload }); // Cast type to allow dynamic string
            showToast(`${title} updated!`, 'success');
        };
        // Create unique prefix for IDs based on type to avoid duplicates
        const idPrefix = type.toLowerCase().replace(/_/g, '-').replace(/update-|-settings/g, '');
        return (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <h4 className="font-semibold text-slate-700 mb-3 text-sm">{title}</h4>
                <div className="grid grid-cols-3 gap-3 mb-3">
                    <Input 
                        id={`${idPrefix}-prefix`}
                        name={`${idPrefix}-prefix`}
                        label="Prefix" 
                        value={localSettings.prefix} 
                        onChange={e => handleChange('prefix', e.target.value)} 
                        className="text-sm py-1" 
                    />
                    <Input 
                        id={`${idPrefix}-next-num`}
                        name={`${idPrefix}-next-num`}
                        label="Next Num" 
                        type="number" 
                        value={localSettings.nextNumber.toString()} 
                        onChange={e => handleChange('nextNumber', e.target.value)} 
                        className="text-sm py-1" 
                    />
                    <Input 
                        id={`${idPrefix}-padding`}
                        name={`${idPrefix}-padding`}
                        label="Padding" 
                        type="number" 
                        value={localSettings.padding.toString()} 
                        onChange={e => handleChange('padding', e.target.value)} 
                        className="text-sm py-1" 
                    />
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Example: {localSettings.prefix}{String(localSettings.nextNumber).padStart(localSettings.padding, '0')}</span>
                    <Button size="sm" variant="secondary" onClick={handleSave} className="px-2 py-1 h-7 text-xs">Update</Button>
                </div>
            </div>
        );
    };

    const renderPreferences = () => (
        <div className="space-y-8 p-4 bg-white rounded-lg border border-slate-200">
            
            <section>
                <h3 className="font-semibold text-lg mb-4">General Settings</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="pr-4">
                            <p className="font-medium text-slate-800">Show System Transactions</p>
                            <p className="text-sm text-slate-500 mt-1">Display automated system entries (like service charge deductions) in the main ledger.</p>
                        </div>
                        <label htmlFor="show-system-transactions" className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                            <input 
                                id="show-system-transactions"
                                name="show-system-transactions"
                                type="checkbox" 
                                checked={state.showSystemTransactions} 
                                onChange={(e) => dispatch({ type: 'TOGGLE_SYSTEM_TRANSACTIONS', payload: e.target.checked })} 
                                className="sr-only peer" 
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="pr-4">
                            <p className="font-medium text-slate-800">Enable Color Coding</p>
                            <p className="text-sm text-slate-500 mt-1">Use project/building specific colors in lists and forms for better visual distinction.</p>
                        </div>
                        <label htmlFor="enable-color-coding" className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                            <input 
                                id="enable-color-coding"
                                name="enable-color-coding"
                                type="checkbox" 
                                checked={state.enableColorCoding} 
                                onChange={(e) => dispatch({ type: 'TOGGLE_COLOR_CODING', payload: e.target.checked })} 
                                className="sr-only peer" 
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="pr-4">
                            <p className="font-medium text-slate-800">Enable Beep on Save</p>
                            <p className="text-sm text-slate-500 mt-1">Play a sound notification when transactions or records are saved successfully.</p>
                        </div>
                        <label htmlFor="enable-beep-on-save" className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                            <input 
                                id="enable-beep-on-save"
                                name="enable-beep-on-save"
                                type="checkbox" 
                                checked={state.enableBeepOnSave} 
                                onChange={(e) => dispatch({ type: 'TOGGLE_BEEP_ON_SAVE', payload: e.target.checked })} 
                                className="sr-only peer" 
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                        </label>
                    </div>
                </div>
            </section>

            <div className="border-t border-slate-100" />

            <section>
                <h3 className="font-semibold text-lg mb-4">ID Sequences</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <IDSequenceSettingsBlock title="Rental Agreements" settings={state.agreementSettings} type="UPDATE_AGREEMENT_SETTINGS" />
                    <IDSequenceSettingsBlock title="Rental Invoices" settings={state.rentalInvoiceSettings || { prefix: 'INV-', nextNumber: 1, padding: 5 }} type="UPDATE_RENTAL_INVOICE_SETTINGS" />
                    <IDSequenceSettingsBlock title="Project Agreements" settings={state.projectAgreementSettings} type="UPDATE_PROJECT_AGREEMENT_SETTINGS" />
                    <IDSequenceSettingsBlock title="Project Invoices" settings={state.projectInvoiceSettings || { prefix: 'P-INV-', nextNumber: 1, padding: 5 }} type="UPDATE_PROJECT_INVOICE_SETTINGS" />
                </div>
            </section>

            <div className="border-t border-slate-100" />

            <section>
                <h3 className="font-semibold text-lg mb-4">Communication & Branding</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={() => setActivePreferenceModal('messaging')} className="p-4 bg-slate-50 border border-slate-200 rounded-lg hover:bg-white hover:border-accent/50 hover:shadow-md transition-all text-left group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white rounded-md shadow-sm text-indigo-600 group-hover:text-accent"><div className="w-6 h-6">{ICONS.whatsapp}</div></div>
                            <span className="font-semibold text-slate-700 group-hover:text-slate-900">Messaging Templates</span>
                        </div>
                        <p className="text-xs text-slate-500">Configure WhatsApp templates for invoices, receipts, and greetings.</p>
                    </button>

                    <button onClick={() => setActivePreferenceModal('print')} className="p-4 bg-slate-50 border border-slate-200 rounded-lg hover:bg-white hover:border-accent/50 hover:shadow-md transition-all text-left group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white rounded-md shadow-sm text-indigo-600 group-hover:text-accent"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg></div>
                            <span className="font-semibold text-slate-700 group-hover:text-slate-900">Print Settings</span>
                        </div>
                        <p className="text-xs text-slate-500">Customize company details, logo, and footer for printed reports.</p>
                    </button>
                </div>
            </section>

            <div className="border-t border-slate-100" />

            <section>
                <h3 className="font-semibold text-lg mb-4">Tools & Utilities</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={() => setIsProjectPickerOpen(true)} className="p-4 bg-slate-50 border border-slate-200 rounded-lg hover:bg-white hover:border-accent/50 hover:shadow-md transition-all text-left group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white rounded-md shadow-sm text-indigo-600 group-hover:text-accent"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><rect width="12" height="2" x="6" y="6"/><path d="M16 18h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/><path d="M16 14h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/></svg></div>
                            <span className="font-semibold text-slate-700 group-hover:text-slate-900">Installments Creation</span>
                        </div>
                        <p className="text-xs text-slate-500">Configure project installment plans (duration, down payment, frequency).</p>
                    </button>
                    
                    <button onClick={handleResetDashboard} className="p-4 bg-slate-50 border border-slate-200 rounded-lg hover:bg-white hover:border-amber-500/50 hover:shadow-md transition-all text-left group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white rounded-md shadow-sm text-amber-600 group-hover:text-amber-700">{ICONS.barChart}</div>
                            <span className="font-semibold text-slate-700 group-hover:text-slate-900">Reset Dashboard</span>
                        </div>
                        <p className="text-xs text-slate-500">Restore dashboard widgets to default layout.</p>
                    </button>
                </div>
            </section>
        </div>
    );

    const renderDataManagement = () => (
        <div className="space-y-6 p-4 bg-white rounded-lg border border-slate-200">
            {/* APPLICATION UPDATES FRAME */}
            <UpdateCheck />

            {/* SYSTEM BACKUP FRAME */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    System Backup
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={handleBackup} className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-sm transition-all text-left group">
                        <div className="font-semibold text-slate-700 group-hover:text-indigo-700 mb-1">Create Backup</div>
                        <p className="text-xs text-slate-500">Download database backup file.</p>
                    </button>

                    <button onClick={handleRestoreClick} className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-sm transition-all text-left group">
                        <div className="font-semibold text-slate-700 group-hover:text-indigo-700 mb-1">Restore Data</div>
                        <p className="text-xs text-slate-500">Restore from a backup file.</p>
                    </button>
                </div>
            </div>

            {/* DATABASE ANALYSIS FRAME */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    Database Analysis
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DatabaseAnalyzer />
                </div>
            </div>

            {/* EXCEL DATA FRAME */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                 <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Excel Data Tools
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={handleImportExcel} className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-sm transition-all text-left group">
                        <div className="font-semibold text-slate-700 group-hover:text-emerald-700 mb-1">Bulk Import</div>
                        <p className="text-xs text-slate-500">Bulk import accounts & transactions.</p>
                    </button>

                    <button onClick={handleExportExcel} className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-sm transition-all text-left group">
                        <div className="font-semibold text-slate-700 group-hover:text-emerald-700 mb-1">Export to Excel</div>
                        <p className="text-xs text-slate-500">Download all data as .xlsx file.</p>
                    </button>
                    
                     <button onClick={() => setIsTransactionLogOpen(true)} className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-sm transition-all text-left group sm:col-span-2">
                        <div className="font-semibold text-slate-700 group-hover:text-indigo-700 mb-1">Transaction Audit Log</div>
                        <p className="text-xs text-slate-500">View history and restore deleted items.</p>
                    </button>
                </div>
            </div>
            
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".db" />

            <div className="pt-6 border-t border-slate-100">
                <h3 className="font-semibold text-lg mb-4 text-rose-800 flex items-center gap-2">{ICONS.alertTriangle} Danger Zone</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={handleClearTransactions} className="p-4 bg-rose-50 border border-rose-100 rounded-lg hover:bg-rose-100 hover:border-rose-300 transition-all text-left group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white rounded-md shadow-sm text-rose-600 group-hover:text-rose-700">{ICONS.trash}</div>
                            <span className="font-semibold text-rose-800">Clear Transactions</span>
                        </div>
                        <p className="text-xs text-rose-700/80">Delete all financial entries. Keeps contacts/projects.</p>
                    </button>

                    <button onClick={handleFactoryReset} className="p-4 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-900 hover:shadow-md transition-all text-left group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-slate-700 rounded-md shadow-sm text-white">{ICONS.alertTriangle}</div>
                            <span className="font-semibold text-white">Factory Reset</span>
                        </div>
                        <p className="text-xs text-slate-400">Wipe ALL data and return to fresh install state.</p>
                    </button>
                </div>
            </div>
        </div>
    );

    const showDetail = !!state.editingEntity;

    return (
        <div className="flex flex-col md:flex-row h-full gap-4 md:gap-6">
            {showDetail ? (
                <div className="w-full">
                    <SettingsDetailPage goBack={() => {}} />
                </div>
            ) : (
                <>
                    {/* Sidebar / Mobile Tabs */}
                    <div className="w-full md:w-64 flex-shrink-0 flex md:flex-col overflow-x-auto md:overflow-visible md:overflow-y-auto gap-2 md:gap-1 pb-2 md:pb-4 border-b md:border-b-0 border-slate-200 mb-2 md:mb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                        {settingCategories.map(cat => (
                            <button
                                key={cat.id}
                                data-help-section={cat.id === 'help' ? 'true' : undefined}
                                onClick={() => { setActiveCategory(cat.id); setSearchQuery(''); }}
                                className={`
                                    flex items-center gap-2 md:gap-3 px-3 py-2 md:py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0
                                    ${activeCategory === cat.id 
                                        ? 'bg-indigo-50 text-accent ring-1 ring-indigo-100 md:ring-0' 
                                        : 'text-slate-600 hover:bg-slate-50 bg-white md:bg-transparent border md:border-0 border-slate-100'
                                    }
                                `}
                            >
                                <div className="w-4 h-4 md:w-5 md:h-5 opacity-70">{cat.icon}</div>
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Content Area */}
                    <div className="flex-grow flex flex-col h-full overflow-hidden">
                        <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 flex-shrink-0">
                            <h2 className="text-lg md:text-2xl font-bold text-slate-800 hidden md:block">{settingCategories.find(c => c.id === activeCategory)?.label}</h2>
                            
                            {(isTableViewCategory) && (
                                <div className="flex flex-col w-full sm:flex-row gap-2 sm:w-auto">
                                    <div className="relative flex-grow sm:w-64">
                                        <Input 
                                            id="settings-table-search"
                                            name="settings-table-search"
                                            placeholder="Search..." 
                                            value={searchQuery} 
                                            onChange={(e) => setSearchQuery(e.target.value)} 
                                            className="pr-8"
                                        />
                                        {searchQuery && (
                                            <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400">
                                                <div className="w-4 h-4">{ICONS.x}</div>
                                            </button>
                                        )}
                                    </div>
                                    
                                    <div className="flex gap-2 self-end sm:self-auto">
                                        {(() => {
                                            const importType =
                                                activeCategory === 'accounts' ? ImportType.ACCOUNTS :
                                                ['owners', 'tenants', 'brokers', 'friends'].includes(activeCategory) ? ImportType.CONTACTS :
                                                activeCategory === 'projects' ? ImportType.PROJECTS :
                                                activeCategory === 'buildings' ? ImportType.BUILDINGS :
                                                activeCategory === 'properties' ? ImportType.PROPERTIES :
                                                activeCategory === 'units' ? ImportType.UNITS :
                                                null;

                                            if (!importType) return null;

                                            return (
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => {
                                                        dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: importType });
                                                        dispatch({ type: 'SET_PAGE', payload: 'import' });
                                                    }}
                                                    className="whitespace-nowrap px-3"
                                                    title="Bulk Import"
                                                >
                                                    <div className="w-4 h-4 sm:mr-1">{ICONS.download}</div>
                                                    <span className="hidden sm:inline">Bulk Import</span>
                                                </Button>
                                            );
                                        })()}
                                        {activeCategory === 'accounts' ? (
                                            <>
                                                <Button onClick={() => handleAddNew('ACCOUNT')} className="whitespace-nowrap px-3">
                                                    <div className="w-4 h-4 sm:mr-1">{ICONS.plus}</div> <span className="hidden sm:inline">Account</span>
                                                </Button>
                                                <Button onClick={() => handleAddNew('CATEGORY')} className="whitespace-nowrap px-3" variant="secondary">
                                                    <div className="w-4 h-4 sm:mr-1">{ICONS.plus}</div> <span className="hidden sm:inline">Category</span>
                                                </Button>
                                            </>
                                        ) : (
                                            <Button onClick={() => handleAddNew()} className="whitespace-nowrap">
                                                <div className="w-4 h-4 sm:mr-2">{ICONS.plus}</div> <span className="hidden sm:inline">Add New</span>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex-grow overflow-y-auto">
                            {isTableViewCategory ? renderTable() : null}
                            {activeCategory === 'users' && <UserManagement />}
                            {activeCategory === 'preferences' && renderPreferences()}
                            {activeCategory === 'data' && renderDataManagement()}
                            {activeCategory === 'help' && <HelpSection />}
                        </div>
                    </div>
                </>
            )}

            <ErrorLogViewer isOpen={isErrorLogOpen} onClose={() => setIsErrorLogOpen(false)} />
            <TransactionLogViewer isOpen={isTransactionLogOpen} onClose={() => setIsTransactionLogOpen(false)} />
            
            <Modal isOpen={isProjectPickerOpen} onClose={() => setIsProjectPickerOpen(false)} title="Select Project to Configure">
                <div className="space-y-2 max-h-[60vh] overflow-y-auto p-2">
                    {state.projects.length > 0 ? state.projects.map(project => (
                        <button
                            key={project.id}
                            onClick={() => {
                                setProjectToConfig(project);
                                setIsProjectPickerOpen(false);
                            }}
                            className="w-full text-left p-3 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 transition-colors flex justify-between items-center group"
                        >
                            <span className="font-medium text-slate-700 group-hover:text-indigo-700">{project.name}</span>
                            <span className="text-slate-400 group-hover:text-indigo-500">{ICONS.chevronRight}</span>
                        </button>
                    )) : (
                        <p className="text-center text-slate-500 py-4">No projects found. Create a project first.</p>
                    )}
                </div>
                <div className="flex justify-end mt-4 pt-4 border-t">
                    <Button variant="secondary" onClick={() => setIsProjectPickerOpen(false)}>Cancel</Button>
                </div>
            </Modal>

            {projectToConfig && (
                <Modal isOpen={!!projectToConfig} onClose={() => setProjectToConfig(null)} title={`Configure: ${projectToConfig.name}`}>
                    <InstallmentConfigForm 
                        project={projectToConfig} 
                        onSave={handleSaveInstallmentConfig} 
                        onCancel={() => setProjectToConfig(null)} 
                    />
                </Modal>
            )}

            {ledgerModalState && (
                <SettingsLedgerModal 
                    isOpen={ledgerModalState.isOpen}
                    onClose={() => setLedgerModalState(null)}
                    entityId={ledgerModalState.entityId}
                    entityType={ledgerModalState.entityType}
                    entityName={ledgerModalState.entityName}
                />
            )}

            <Modal isOpen={activePreferenceModal === 'messaging'} onClose={() => setActivePreferenceModal(null)} title="Messaging Templates" size="xl">
                <div className="max-h-[70vh] overflow-y-auto p-1">
                    <MessagingTemplatesForm />
                </div>
                <div className="flex justify-end pt-4 border-t mt-4">
                    <Button variant="secondary" onClick={() => setActivePreferenceModal(null)}>Close</Button>
                </div>
            </Modal>

            <Modal isOpen={activePreferenceModal === 'print'} onClose={() => setActivePreferenceModal(null)} title="Print Settings" size="xl">
                <div className="max-h-[70vh] overflow-y-auto p-1">
                    <PrintTemplateForm />
                </div>
                <div className="flex justify-end pt-4 border-t mt-4">
                    <Button variant="secondary" onClick={() => setActivePreferenceModal(null)}>Close</Button>
                </div>
            </Modal>
        </div>
    );
};

export default SettingsPage;

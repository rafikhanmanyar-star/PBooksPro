
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Transaction, Category } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import ManualServiceChargeModal from './ManualServiceChargeModal';
import ServiceChargeUpdateModal from './ServiceChargeUpdateModal';
import PropertyForm from '../settings/PropertyForm';
import { useNotification } from '../../context/NotificationContext';
import DatePicker from '../ui/DatePicker';
import PayrollTreeView, { PayrollTreeNode } from '../payroll/PayrollTreeView'; // Reusing TreeView structure
import useLocalStorage from '../../hooks/useLocalStorage';
import ResizeHandle from '../ui/ResizeHandle';

type DateRangeOption = 'total' | 'thisMonth' | 'lastMonth' | 'custom';
type SortKey = 'month' | 'unit' | 'owner' | 'categoryName' | 'amount';

const MonthlyServiceChargesPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast, showAlert } = useNotification();
    
    // Toolbar State
    const [dateRange, setDateRange] = useState<DateRangeOption>('thisMonth');
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    });
    const [searchQuery, setSearchQuery] = useState('');

    // Modal States
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [isAddPropertyModalOpen, setIsAddPropertyModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Tree State
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [selectedTreeType, setSelectedTreeType] = useState<'building' | 'unit' | null>(null);

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'month', direction: 'desc' });

    // Sidebar Resizing
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('serviceCharges_sidebarWidth', 300);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // --- Helpers ---

    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const now = new Date();
        
        if (option === 'total') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (option === 'thisMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
        } else if (option === 'lastMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]);
        }
    };

    const handleCustomDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        setDateRange('custom');
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };
    
    // Sidebar Resize Handlers
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = sidebarWidth;

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth]);

    const handleResize = useCallback((e: MouseEvent) => {
        if (isResizing.current) {
            const delta = e.clientX - startX.current;
            const newWidth = Math.max(200, Math.min(600, startWidth.current + delta));
            setSidebarWidth(newWidth);
        }
    }, [setSidebarWidth]);

    const stopResize = useCallback(() => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    // --- Data Logic ---

    // Broad match for reading: Any Income category containing "Service Charge"
    const serviceIncomeCategoryIds = useMemo(() => {
        return state.categories
            .filter(c => c.type === TransactionType.INCOME && c.name.toLowerCase().includes('service charge'))
            .map(c => c.id);
    }, [state.categories]);

    const transactions = useMemo(() => {
        if (serviceIncomeCategoryIds.length === 0) return [];
        
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const targetIds = new Set(serviceIncomeCategoryIds);

        return state.transactions.filter(tx => {
            if (tx.type !== TransactionType.INCOME || !tx.categoryId || !targetIds.has(tx.categoryId)) return false;
            const date = new Date(tx.date);
            return date >= start && date <= end;
        });
    }, [state.transactions, serviceIncomeCategoryIds, startDate, endDate]);

    // --- Tree Data ---
    const treeData = useMemo<PayrollTreeNode[]>(() => {
        // Structure: Building -> Unit (Property)
        const buildingMap = new Map<string, PayrollTreeNode>();

        state.buildings.forEach(b => {
            buildingMap.set(b.id, {
                id: b.id,
                name: b.name,
                type: 'building' as any, // Casting to reuse type
                children: [],
                count: 0
            });
        });
        
        // Add unassigned if needed
        buildingMap.set('unassigned', {
            id: 'unassigned',
            name: 'Unassigned',
            type: 'building' as any,
            children: [],
            count: 0
        });

        state.properties.forEach(p => {
            const bId = p.buildingId || 'unassigned';
            const buildingNode = buildingMap.get(bId);
            if (buildingNode) {
                buildingNode.children.push({
                    id: p.id,
                    name: p.name,
                    type: 'staff' as any, // Reusing 'staff' as 'unit' visually
                    children: []
                });
                buildingNode.count = (buildingNode.count || 0) + 1;
            }
        });

        return Array.from(buildingMap.values())
            .filter(b => b.children.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name));

    }, [state.buildings, state.properties]);

    // --- Grid Data ---
    const gridData = useMemo(() => {
        let data = transactions.map(tx => {
            const property = state.properties.find(p => p.id === tx.propertyId);
            const owner = state.contacts.find(c => c.id === (tx.contactId || property?.ownerId));
            const category = state.categories.find(c => c.id === tx.categoryId);
            
            let monthStr = 'Invalid Date';
            if (tx.date) {
                const dateObj = new Date(tx.date);
                if (!isNaN(dateObj.getTime())) {
                    monthStr = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
                }
            }

            return {
                id: tx.id,
                date: tx.date,
                month: monthStr,
                unit: property?.name || 'Unknown Unit',
                owner: owner?.name || 'Unknown Owner',
                categoryName: category?.name || 'Service Charge',
                amount: tx.amount,
                transaction: tx,
                propertyId: tx.propertyId,
                buildingId: tx.buildingId || property?.buildingId
            };
        });

        // Filter by Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            data = data.filter(d => 
                d.unit.toLowerCase().includes(q) || 
                d.owner.toLowerCase().includes(q) || 
                d.month.toLowerCase().includes(q) ||
                d.categoryName.toLowerCase().includes(q)
            );
        }

        // Filter by Tree
        if (selectedTreeId) {
            if (selectedTreeType === 'building') { // Building Selected
                data = data.filter(d => d.buildingId === selectedTreeId);
            } else { // Unit Selected (type 'staff' from reused tree)
                data = data.filter(d => d.propertyId === selectedTreeId);
            }
        }

        return data.sort((a, b) => {
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];

            // Special handling for month sort to use actual date
            if (sortConfig.key === 'month') {
                valA = new Date(a.date).getTime();
                valB = new Date(b.date).getTime();
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    }, [transactions, state.properties, state.contacts, state.categories, searchQuery, selectedTreeId, selectedTreeType, sortConfig]);

    // --- Actions ---

    const handleBulkRun = async () => {
        let rentalIncomeCategory = state.categories.find(c => c.id === 'cat-rent-income' || c.name === 'Rental Income');
        // For creation, we prefer the standard 'Service Charge Income' category
        let svcCat = state.categories.find(c => c.name === 'Service Charge Income');
        
        let cashAccount = state.accounts.find(a => a.name === 'Cash') || state.accounts[0];

        const catsToCreate: Category[] = [];
        
        if (!rentalIncomeCategory) {
             showAlert("Critical Error: 'Rental Income' category not found.");
             return;
        }

        if (!svcCat) {
             const newCat: Category = { 
                 id: 'cat-service-charge', 
                 name: 'Service Charge Income', 
                 type: TransactionType.INCOME, 
                 isPermanent: true, 
                 isRental: true, 
                 description: 'Income from monthly building service charges.' 
             };
             catsToCreate.push(newCat);
             svcCat = newCat;
        }

        if (catsToCreate.length > 0) catsToCreate.forEach(cat => dispatch({ type: 'ADD_CATEGORY', payload: cat }));
        if (!cashAccount) { showAlert("No accounts found."); return; }

        const propertiesWithCharges = state.properties.filter(p => (p.monthlyServiceCharge || 0) > 0);
        
        if (propertiesWithCharges.length === 0) {
            showAlert('No properties have a "Monthly Service Charge" configured in Settings.', { title: "No Charges Configured" });
            return;
        }

        const confirmed = await showConfirm(
            `Run auto-deduction for ${propertiesWithCharges.length} properties?\n\nThis transfers funds from Owner Rental Income to Building Service Fund.`,
            { title: "Run Service Charges", confirmLabel: "Run Process" }
        );

        if (confirmed) {
            setIsProcessing(true);
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                const today = new Date().toISOString().split('T')[0];
                const currentMonthPrefix = today.substring(0, 7); 
                const newTxs: Transaction[] = [];
                let count = 0;
                const baseTimestamp = Date.now();

                for (let i = 0; i < propertiesWithCharges.length; i++) {
                    const property = propertiesWithCharges[i];
                    if (!property.ownerId) continue;

                    const alreadyApplied = state.transactions.some(tx => 
                        tx.propertyId === property.id &&
                        tx.categoryId === svcCat!.id &&
                        tx.date.startsWith(currentMonthPrefix)
                    );

                    if (alreadyApplied) continue;

                    const amount = property.monthlyServiceCharge || 0;
                    
                    const debitTx: Transaction = {
                        id: `bm-debit-${baseTimestamp}-${i}`,
                        type: TransactionType.INCOME, 
                        amount: -amount, 
                        date: today,
                        description: `Service Charge Deduction for ${property.name}`,
                        accountId: cashAccount.id, 
                        categoryId: rentalIncomeCategory.id, 
                        propertyId: property.id,
                        buildingId: property.buildingId,
                        contactId: property.ownerId,
                        isSystem: true,
                    };

                    const creditTx: Transaction = {
                        id: `bm-credit-${baseTimestamp}-${i}`,
                        type: TransactionType.INCOME,
                        amount: amount, 
                        date: today,
                        description: `Service Charge Allocation for ${property.name}`,
                        accountId: cashAccount.id,
                        categoryId: svcCat!.id, 
                        propertyId: property.id,
                        buildingId: property.buildingId,
                        isSystem: true,
                    };
                    
                    newTxs.push(debitTx, creditTx);
                    count++;
                }

                if (newTxs.length > 0) {
                    dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: newTxs });
                    showToast(`Successfully applied charges to ${count} properties.`, 'success');
                } else {
                    showToast('No new charges to apply (all up to date).', 'info');
                }

            } catch (error) {
                console.error(error);
                showAlert("An error occurred during processing.");
            } finally {
                setIsProcessing(false);
            }
        }
    };

    // Handle adding new property
    const handlePropertySubmit = (propertyData: any) => {
        const newId = Date.now().toString();
        dispatch({ type: 'ADD_PROPERTY', payload: { ...propertyData, id: newId } });
        setIsAddPropertyModalOpen(false);
        showToast(`Property "${propertyData.name}" added successfully.`);
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Top Toolbar */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between flex-shrink-0">
                
                <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
                    {/* Date Filter */}
                    <div className="flex bg-slate-100 p-1 rounded-lg flex-shrink-0">
                        {(['total', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                    dateRange === opt 
                                    ? 'bg-white text-accent shadow-sm font-bold' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                }`}
                            >
                                {opt === 'total' ? 'All Time' : opt.replace(/([A-Z])/g, ' $1')}
                            </button>
                        ))}
                    </div>

                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} />
                            <span className="text-slate-400">-</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} />
                        </div>
                    )}
                    
                    {/* Search */}
                    <div className="relative w-full sm:w-48">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <span className="h-4 w-4">{ICONS.search}</span>
                        </div>
                        <Input 
                            placeholder="Search..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="pl-9 py-1.5 text-sm"
                        />
                    </div>
                </div>

                <div className="flex gap-2 flex-wrap w-full lg:w-auto justify-end">
                    <Button variant="secondary" onClick={() => setIsAddPropertyModalOpen(true)}>
                        Add Property
                    </Button>
                    <Button variant="secondary" onClick={() => setIsManualModalOpen(true)}>
                        Manual Deduction
                    </Button>
                    <Button 
                        onClick={handleBulkRun}
                        disabled={isProcessing}
                        className={isProcessing ? 'opacity-70 cursor-not-allowed' : ''}
                    >
                        {isProcessing ? 'Processing...' : 'Run Auto Deduction'}
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-grow flex flex-col md:flex-row gap-4 overflow-hidden min-h-0">
                
                {/* Left Tree View */}
                <div 
                    className="hidden md:flex flex-col h-full flex-shrink-0"
                    style={{ width: sidebarWidth }}
                >
                    <div className="font-bold text-slate-700 mb-2 px-1">Properties</div>
                    <PayrollTreeView 
                        treeData={treeData} 
                        selectedId={selectedTreeId} 
                        onSelect={(id, type) => {
                            if (selectedTreeId === id) {
                                setSelectedTreeId(null);
                                setSelectedTreeType(null);
                            } else {
                                setSelectedTreeId(id);
                                setSelectedTreeType(type as any);
                            }
                        }} 
                    />
                </div>

                {/* Resizer Handle */}
                <div className="hidden md:block h-full">
                    <ResizeHandle onMouseDown={startResizing} />
                </div>

                {/* Right Data Grid */}
                <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex-grow overflow-y-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('month')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Month <SortIcon column="month"/></th>
                                    <th onClick={() => handleSort('unit')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Unit <SortIcon column="unit"/></th>
                                    <th onClick={() => handleSort('owner')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Owner <SortIcon column="owner"/></th>
                                    <th onClick={() => handleSort('categoryName')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Category <SortIcon column="categoryName"/></th>
                                    <th onClick={() => handleSort('amount')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Amount <SortIcon column="amount"/></th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-600">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {gridData.length > 0 ? gridData.map((row) => (
                                    <tr key={row.id} onClick={() => setEditingTransaction(row.transaction)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">{row.month}</td>
                                        <td className="px-4 py-3 text-slate-800 font-medium">{row.unit}</td>
                                        <td className="px-4 py-3 text-slate-600">{row.owner}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">{row.categoryName}</td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">{CURRENCY} {row.amount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button className="text-indigo-600 hover:text-indigo-900 text-xs font-semibold">Edit</button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                                            No service charges found for selected criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 border-t border-slate-200 bg-slate-50 text-right text-sm font-bold text-slate-700">
                        Total: {CURRENCY} {gridData.reduce((sum, row) => sum + row.amount, 0).toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isAddPropertyModalOpen} onClose={() => setIsAddPropertyModalOpen(false)} title="Add New Property">
                <PropertyForm 
                    onSubmit={handlePropertySubmit} 
                    onCancel={() => setIsAddPropertyModalOpen(false)} 
                    contacts={state.contacts}
                    buildings={state.buildings}
                    properties={state.properties}
                />
            </Modal>

            <ManualServiceChargeModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} />
            
            {editingTransaction && (
                <ServiceChargeUpdateModal 
                    isOpen={!!editingTransaction} 
                    onClose={() => setEditingTransaction(null)} 
                    transaction={editingTransaction} 
                />
            )}
        </div>
    );
};

export default MonthlyServiceChargesPage;


import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Payslip, PayslipStatus, TransactionType, Transaction } from '../../types';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import PayslipDetailModal from './PayslipDetailModal';
import PayslipPaymentModal from './PayslipPaymentModal';
import PayslipBulkPaymentModal from './PayslipBulkPaymentModal';
import Select from '../ui/Select';
import Input from '../ui/Input';
import PayrollTreeView, { PayrollTreeNode } from './PayrollTreeView';
import { formatDate } from '../../utils/dateUtils';

interface PayslipManagementProps {
    payrollType?: 'Rental' | 'Project';
}

type FilterType = 'all' | 'this_month' | 'last_month' | 'month' | 'date';
type SortKey = 'date' | 'employeeName' | 'particulars' | 'payable' | 'paid' | 'balance' | 'status';

interface PayrollLedgerItem {
    id: string;
    originalId: string;
    type: 'PAYSLIP' | 'PAYMENT' | 'ADVANCE' | 'BULK_PAYMENT';
    date: string;
    month: string;
    staffId?: string;
    staffName: string;
    description: string;
    payable: number; // Amount added (Salary)
    paid: number;    // Amount deducted (Payment/Advance)
    balance: number; // Running balance or item balance
    status: string;
    item?: Payslip | Transaction;
    children?: PayrollLedgerItem[]; // For bulk payments
}

const PayslipManagement: React.FC<PayslipManagementProps> = ({ payrollType }) => {
    const { state } = useAppContext();
    
    // Filter State
    const [filterType, setFilterType] = useState<FilterType>('this_month');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [selectedDate, setSelectedDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Tree Selection State
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [selectedTreeType, setSelectedTreeType] = useState<'project' | 'building' | 'staff' | null>(null);
    
    // Sorting & Expanding
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Modals
    const [viewPayslipId, setViewPayslipId] = useState<string | null>(null);
    const [paymentPayslipId, setPaymentPayslipId] = useState<string | null>(null);
    const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);

    // Bulk Selection State
    const [selectedPayslipIds, setSelectedPayslipIds] = useState<Set<string>>(new Set());

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const staffDueAmounts = useMemo(() => {
        const payslipPayments = new Map<string, number>();
        state.transactions.forEach(tx => {
            if (tx.payslipId && tx.type === TransactionType.EXPENSE) {
                payslipPayments.set(tx.payslipId, (payslipPayments.get(tx.payslipId) || 0) + tx.amount);
            }
        });

        const dues = new Map<string, number>();
        const allPayslips = [...state.projectPayslips, ...state.rentalPayslips];
        
        allPayslips.forEach(p => {
            if (p.status === PayslipStatus.PAID) return;
            const paid = p.paidAmount || payslipPayments.get(p.id) || 0;
            const due = Math.max(0, p.netSalary - paid);
            if (due > 0) {
                dues.set(p.staffId, (dues.get(p.staffId) || 0) + due);
            }
        });
        return dues;
    }, [state.transactions, state.projectPayslips, state.rentalPayslips]);

    const treeData = useMemo<PayrollTreeNode[]>(() => {
        const nodes: PayrollTreeNode[] = [];

        // 1. Projects
        if (!payrollType || payrollType === 'Project') {
            state.projects.forEach(proj => {
                const projectStaff = state.projectStaff.filter(s => s.projectId === proj.id);
                const historicalPayslips = state.projectPayslips.filter(p => p.projectId === proj.id);
                
                if (projectStaff.length > 0 || historicalPayslips.length > 0) {
                    let projectTotalDue = 0;
                    const relevantStaffIds = new Set([
                        ...projectStaff.map(s => s.id),
                        ...historicalPayslips.map(p => p.staffId)
                    ]);

                    const children = Array.from(relevantStaffIds).map((staffId: string) => {
                        const contact = state.contacts.find(c => c.id === staffId);
                        const due = staffDueAmounts.get(staffId) || 0;
                        projectTotalDue += due;

                        return {
                            id: staffId,
                            name: contact?.name || 'Unknown Staff',
                            type: 'staff' as const,
                            amount: due,
                            children: []
                        };
                    }).sort((a, b) => a.name.localeCompare(b.name));

                    nodes.push({
                        id: proj.id,
                        name: proj.name,
                        type: 'project',
                        count: children.length,
                        amount: projectTotalDue,
                        children
                    });
                }
            });
        }
        
        // 2. Buildings
        if (!payrollType || payrollType === 'Rental') {
             state.buildings.forEach(bldg => {
                const buildingStaff = state.rentalStaff.filter(s => s.buildingId === bldg.id);
                const historicalPayslips = state.rentalPayslips.filter(p => p.buildingId === bldg.id);

                if (buildingStaff.length > 0 || historicalPayslips.length > 0) {
                    let buildingTotalDue = 0;
                    const relevantStaffIds = new Set([
                        ...buildingStaff.map(s => s.id),
                        ...historicalPayslips.map(p => p.staffId)
                    ]);
                    
                    const children = Array.from(relevantStaffIds).map((staffId: string) => {
                        const contact = state.contacts.find(c => c.id === staffId);
                        const due = staffDueAmounts.get(staffId) || 0;
                        buildingTotalDue += due;

                        return {
                            id: staffId,
                            name: contact?.name || 'Unknown Staff',
                            type: 'staff' as const,
                            amount: due,
                            children: []
                        };
                    }).sort((a, b) => a.name.localeCompare(b.name));

                    nodes.push({
                        id: bldg.id,
                        name: bldg.name,
                        type: 'building',
                        count: children.length,
                        amount: buildingTotalDue,
                        children
                    });
                }
            });
        }

        return nodes.sort((a, b) => a.name.localeCompare(b.name));
    }, [state, payrollType, staffDueAmounts]);

    // --- Ledger Construction ---
    const ledgerData = useMemo(() => {
        let items: PayrollLedgerItem[] = [];
        
        const relevantPayslips = payrollType === 'Rental' ? (state.rentalPayslips || []) : 
                                 payrollType === 'Project' ? (state.projectPayslips || []) : 
                                 [...(state.rentalPayslips || []), ...(state.projectPayslips || [])];
        
        const relevantPayslipIds = new Set(relevantPayslips.map(p => p.id));
        const salaryAdvanceCategory = state.categories.find(c => c.name === 'Salary Advance');

        // 1. Add Payslips (Payable)
        relevantPayslips.forEach(p => {
            const staff = state.contacts.find(c => c.id === p.staffId);
            items.push({
                id: `pay-${p.id}`,
                originalId: p.id,
                type: 'PAYSLIP',
                date: p.issueDate,
                month: p.month,
                staffId: p.staffId,
                staffName: staff?.name || 'Unknown',
                description: `Salary for ${p.month}`,
                payable: p.netSalary,
                paid: 0,
                balance: 0, // Calculated later
                status: p.status,
                item: p
            });
        });

        // 2. Add Payments & Advances (Consolidated by Batch)
        const batchMap = new Map<string, Transaction[]>();
        
        // First pass: Organize transactions by batch
        state.transactions.forEach(tx => {
            if (tx.type !== TransactionType.EXPENSE) return;
            
            // Check relevance
            let isRelevant = false;
            if (tx.payslipId && relevantPayslipIds.has(tx.payslipId)) isRelevant = true;
            else if (salaryAdvanceCategory && tx.categoryId === salaryAdvanceCategory.id) {
                const staff = [...state.projectStaff, ...state.rentalStaff].find(s => s.id === tx.contactId);
                if (staff) {
                    if (payrollType === 'Project' && staff.projectId) isRelevant = true;
                    else if (payrollType === 'Rental' && staff.buildingId) isRelevant = true;
                    else if (!payrollType) isRelevant = true;
                }
            }

            if (isRelevant) {
                if (tx.batchId) {
                    if (!batchMap.has(tx.batchId)) batchMap.set(tx.batchId, []);
                    batchMap.get(tx.batchId)!.push(tx);
                } else {
                    // Non-batched
                    const staff = state.contacts.find(c => c.id === tx.contactId);
                    const type = (salaryAdvanceCategory && tx.categoryId === salaryAdvanceCategory.id) ? 'ADVANCE' : 'PAYMENT';
                    items.push({
                        id: `tx-${tx.id}`,
                        originalId: tx.id,
                        type,
                        date: tx.date,
                        month: tx.date.slice(0, 7),
                        staffId: tx.contactId,
                        staffName: staff?.name || 'Unknown',
                        description: tx.description || (type === 'ADVANCE' ? 'Salary Advance' : 'Payment'),
                        payable: 0,
                        paid: tx.amount,
                        balance: 0,
                        status: 'Paid',
                        item: tx
                    });
                }
            }
        });

        // Second pass: Create Bulk Items
        batchMap.forEach((txs, batchId) => {
            const totalAmount = txs.reduce((sum, t) => sum + t.amount, 0);
            const template = txs[0];
            const uniqueStaffNames = Array.from(new Set(txs.map(t => state.contacts.find(c => c.id === t.contactId)?.name))).filter(Boolean);
            
            // Create Children
            const children: PayrollLedgerItem[] = txs.map(tx => {
                 const staff = state.contacts.find(c => c.id === tx.contactId);
                 const type = (salaryAdvanceCategory && tx.categoryId === salaryAdvanceCategory.id) ? 'ADVANCE' : 'PAYMENT';
                 return {
                    id: `tx-child-${tx.id}`,
                    originalId: tx.id,
                    type,
                    date: tx.date,
                    month: tx.date.slice(0, 7),
                    staffId: tx.contactId,
                    staffName: staff?.name || 'Unknown',
                    description: tx.description || (type === 'ADVANCE' ? 'Salary Advance' : 'Payment'),
                    payable: 0,
                    paid: tx.amount,
                    balance: 0,
                    status: 'Paid',
                    item: tx
                };
            });

            items.push({
                id: `batch-${batchId}`,
                originalId: batchId,
                type: 'BULK_PAYMENT',
                date: template.date,
                month: template.date.slice(0, 7),
                staffId: uniqueStaffNames.length === 1 ? txs[0].contactId : undefined, // If mixed, undefined
                staffName: uniqueStaffNames.length === 1 ? uniqueStaffNames[0]! : 'Multiple Staff',
                description: `Bulk Payment (${txs.length} items)`,
                payable: 0,
                paid: totalAmount,
                balance: 0,
                status: 'Paid',
                children
            });
        });

        // 3. Filter
        if (selectedTreeId) {
             if (selectedTreeType === 'staff') {
                 // For staff view, we need to unwrap bulk payments relevant to this staff
                 const newItems: PayrollLedgerItem[] = [];
                 items.forEach(item => {
                     if (item.type === 'PAYSLIP') {
                         if (item.staffId === selectedTreeId) newItems.push(item);
                     } else if (item.type === 'BULK_PAYMENT' && item.children) {
                         // Find child belonging to this staff
                         const relevantChildren = item.children.filter(c => c.staffId === selectedTreeId);
                         relevantChildren.forEach(child => newItems.push(child));
                     } else {
                         if (item.staffId === selectedTreeId) newItems.push(item);
                     }
                 });
                 items = newItems;

            } else if (selectedTreeType === 'project') {
                items = items.filter(i => {
                    if (i.type === 'PAYSLIP') return (i.item as Payslip).projectId === selectedTreeId;
                    if (i.type === 'BULK_PAYMENT') return i.children?.some(c => (c.item as Transaction).projectId === selectedTreeId);
                    return (i.item as Transaction).projectId === selectedTreeId;
                });
            } else if (selectedTreeType === 'building') {
                items = items.filter(i => {
                    if (i.type === 'PAYSLIP') return (i.item as Payslip).buildingId === selectedTreeId;
                    if (i.type === 'BULK_PAYMENT') return i.children?.some(c => (c.item as Transaction).buildingId === selectedTreeId);
                    return (i.item as Transaction).buildingId === selectedTreeId;
                });
            }
        }

        if (filterType === 'this_month') {
             const today = new Date();
             const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
             items = items.filter(i => i.date.startsWith(currentMonthStr));
        } else if (filterType === 'last_month') {
             const today = new Date();
             today.setMonth(today.getMonth() - 1);
             const lastMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
             items = items.filter(i => i.date.startsWith(lastMonthStr));
        } else if (filterType === 'month') {
             const filterStr = `${selectedYear}-${selectedMonth}`;
             items = items.filter(i => i.date.startsWith(filterStr));
        } else if (filterType === 'date' && selectedDate) {
             items = items.filter(i => i.date.startsWith(selectedDate));
        }

        if (searchQuery) {
             const lowerQ = searchQuery.toLowerCase();
             items = items.filter(i => i.staffName.toLowerCase().includes(lowerQ) || i.description.toLowerCase().includes(lowerQ));
        }
        
        // 4. Calculate Balances & Sort
        if (selectedTreeType === 'staff') {
            // Specific Staff: Chronological Ledger with Running Balance
            items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            let runningBalance = 0;
            
            if (filterType === 'all') {
                items.forEach(item => {
                    runningBalance += (item.payable - item.paid);
                    item.balance = runningBalance;
                });
                // If sort config is descending, we reverse for display but keep calculated balance
                if (sortConfig.key === 'date' && sortConfig.direction === 'desc') {
                    items.reverse();
                }
            } else {
                 items.forEach(item => {
                    if (item.type === 'PAYSLIP') {
                         const p = item.item as Payslip;
                         item.balance = p.netSalary - (p.paidAmount || 0);
                    } else {
                         item.balance = 0; 
                    }
                 });
                 // Apply standard sort
                 items.sort((a, b) => sortConfig.direction === 'asc' 
                    ? new Date(a.date).getTime() - new Date(b.date).getTime()
                    : new Date(b.date).getTime() - new Date(a.date).getTime()
                 );
            }

        } else {
            // Multiple Staff: Show item-specific balance
            items.forEach(item => {
                 if (item.type === 'PAYSLIP') {
                      const p = item.item as Payslip;
                      item.balance = p.netSalary - (p.paidAmount || 0);
                 } else {
                      item.balance = 0; // Informational row
                 }
            });

            // Standard Sort
            items.sort((a, b) => {
                let valA: any = '';
                let valB: any = '';

                switch (sortConfig.key) {
                    case 'date': valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); break;
                    case 'employeeName': valA = a.staffName.toLowerCase(); valB = b.staffName.toLowerCase(); break;
                    case 'particulars': valA = a.description.toLowerCase(); valB = b.description.toLowerCase(); break;
                    case 'payable': valA = a.payable; valB = b.payable; break;
                    case 'paid': valA = a.paid; valB = b.paid; break;
                    case 'balance': valA = a.balance; valB = b.balance; break;
                    case 'status': valA = a.status.toLowerCase(); valB = b.status.toLowerCase(); break;
                }

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        
        return items;
    }, [state, payrollType, filterType, selectedYear, selectedMonth, selectedDate, searchQuery, selectedTreeId, selectedTreeType, sortConfig]);
    
    // --- Selection Logic ---
    const handleToggleSelect = (id: string) => {
        const newSet = new Set(selectedPayslipIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedPayslipIds(newSet);
    };

    const handleSelectAll = () => {
        const payslipIds = ledgerData.filter(i => i.type === 'PAYSLIP').map(i => i.originalId);
        if (selectedPayslipIds.size === payslipIds.length) {
            setSelectedPayslipIds(new Set());
        } else {
            setSelectedPayslipIds(new Set(payslipIds));
        }
    };

    const handlePaymentSuccess = () => {
        setPaymentPayslipId(null);
        setIsBulkPayModalOpen(false);
        setSelectedPayslipIds(new Set()); // CLEAR SELECTION
    };

    const selectedPayslipObjects = useMemo(() => 
        state.projectPayslips.concat(state.rentalPayslips).filter(p => selectedPayslipIds.has(p.id))
    , [selectedPayslipIds, state.projectPayslips, state.rentalPayslips]);

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">{sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
    );

    const getFilterLabel = () => {
        switch(filterType) {
            case 'this_month': return 'This Month';
            case 'last_month': return 'Last Month';
            case 'month': return `${new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`;
            case 'all': return 'All History';
            default: return 'Custom';
        }
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                <div className="flex flex-wrap gap-3 items-center w-full xl:w-auto">
                     <div className="flex bg-slate-100 p-1 rounded-lg">
                         <button onClick={() => setFilterType('this_month')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterType === 'this_month' ? 'bg-white shadow-sm text-accent' : 'text-slate-600 hover:bg-slate-200'}`}>This Month</button>
                         <button onClick={() => setFilterType('last_month')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterType === 'last_month' ? 'bg-white shadow-sm text-accent' : 'text-slate-600 hover:bg-slate-200'}`}>Last Month</button>
                         <button onClick={() => setFilterType('month')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterType === 'month' ? 'bg-white shadow-sm text-accent' : 'text-slate-600 hover:bg-slate-200'}`}>Select Month</button>
                         <button onClick={() => setFilterType('all')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterType === 'all' ? 'bg-white shadow-sm text-accent' : 'text-slate-600 hover:bg-slate-200'}`}>All</button>
                     </div>

                     {filterType === 'month' && (
                        <div className="flex gap-2 animate-fade-in">
                            <Select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-24 py-1.5 text-sm">
                                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </Select>
                            <Select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-32 py-1.5 text-sm">
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={String(m).padStart(2, '0')}>
                                        {new Date(0, m - 1).toLocaleString('default', { month: 'long' })}
                                    </option>
                                ))}
                            </Select>
                        </div>
                     )}
                     
                     <div className="relative flex-grow xl:flex-grow-0 xl:w-64">
                         <Input placeholder="Search staff..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="py-1.5 text-sm pl-8" />
                         <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"><div className="w-4 h-4">{ICONS.search}</div></div>
                     </div>
                </div>
                
                <div className="flex gap-2">
                    {selectedPayslipIds.size > 0 && (
                        <Button onClick={() => setIsBulkPayModalOpen(true)} className="whitespace-nowrap animate-fade-in">
                            Pay Selected ({selectedPayslipIds.size})
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex-grow flex flex-col md:flex-row gap-4 overflow-hidden min-h-0">
                <div className="w-full md:w-1/4 min-w-[250px] hidden md:flex flex-col h-full">
                    <div className="font-bold text-slate-700 mb-2 px-1 flex justify-between items-center">
                        <span>Organization</span>
                        {selectedTreeId && (
                            <button onClick={() => setSelectedTreeId(null)} className="text-xs text-accent hover:underline">Clear</button>
                        )}
                    </div>
                    <PayrollTreeView treeData={treeData} selectedId={selectedTreeId} onSelect={(id, type) => { if(selectedTreeId===id){setSelectedTreeId(null);setSelectedTreeType(null);}else{setSelectedTreeId(id);setSelectedTreeType(type);} }} />
                </div>

                <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex-grow overflow-y-auto">
                         <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 w-10 text-center">
                                        <input 
                                            type="checkbox" 
                                            className="rounded text-accent focus:ring-accent"
                                            checked={ledgerData.filter(i => i.type === 'PAYSLIP').length > 0 && selectedPayslipIds.size === ledgerData.filter(i => i.type === 'PAYSLIP').length}
                                            onChange={handleSelectAll}
                                        />
                                    </th>
                                    <th onClick={() => handleSort('date')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                                    <th onClick={() => handleSort('employeeName')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Employee <SortIcon column="employeeName"/></th>
                                    <th onClick={() => handleSort('particulars')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars"/></th>
                                    <th onClick={() => handleSort('payable')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Payable <SortIcon column="payable"/></th>
                                    <th onClick={() => handleSort('paid')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Paid <SortIcon column="paid"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Net Balance <SortIcon column="balance"/></th>
                                    <th onClick={() => handleSort('status')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Status <SortIcon column="status"/></th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {ledgerData.length > 0 ? ledgerData.map(item => {
                                    const isPaid = item.status === 'Paid';
                                    const isPayslip = item.type === 'PAYSLIP';
                                    const isBulk = item.type === 'BULK_PAYMENT';
                                    const isExpanded = isBulk && expandedIds.has(item.id);
                                    
                                    return (
                                        <React.Fragment key={item.id}>
                                            <tr 
                                                className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                                                    item.type === 'ADVANCE' ? 'bg-amber-50/30' : 
                                                    isBulk ? (isExpanded ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'bg-slate-50 border-l-4 border-slate-200') : ''
                                                }`} 
                                                onClick={() => {
                                                    if (isPayslip) setViewPayslipId(item.originalId);
                                                    if (isBulk) toggleExpand(item.id);
                                                }}
                                            >
                                                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                    {isPayslip && (
                                                        <input 
                                                            type="checkbox" 
                                                            className="rounded text-accent focus:ring-accent"
                                                            checked={selectedPayslipIds.has(item.originalId)}
                                                            onChange={() => handleToggleSelect(item.originalId)}
                                                            disabled={isPaid}
                                                        />
                                                    )}
                                                    {isBulk && (
                                                         <button 
                                                            onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                                                            className={`w-6 h-6 flex items-center justify-center mx-auto text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-all transform ${isExpanded ? 'rotate-90' : ''}`}
                                                         >
                                                             {ICONS.chevronRight}
                                                         </button>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatDate(item.date)}</td>
                                                <td className={`px-4 py-3 font-medium ${isBulk ? 'text-indigo-700 font-bold' : 'text-slate-800'}`}>{item.staffName}</td>
                                                <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={item.description}>{item.description}</td>
                                                
                                                <td className="px-4 py-3 text-right font-medium text-emerald-600">
                                                    {item.payable > 0 ? `${CURRENCY} ${item.payable.toLocaleString()}` : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-rose-600">
                                                    {item.paid > 0 ? `${CURRENCY} ${item.paid.toLocaleString()}` : '-'}
                                                </td>
                                                
                                                <td className={`px-4 py-3 text-right font-bold ${item.balance > 0 ? 'text-slate-800' : 'text-emerald-600'}`}>
                                                    {item.balance !== 0 ? `${CURRENCY} ${Math.abs(item.balance).toLocaleString()}` : '-'}
                                                    {item.balance < 0 && <span className="text-[10px] ml-1 font-normal text-slate-400">(Adv)</span>}
                                                </td>
                                                
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                                                        item.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 
                                                        item.status === 'Partially Paid' ? 'bg-amber-100 text-amber-800' : 
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                     {isPayslip && !isPaid && (
                                                         <Button size="sm" onClick={(e) => { e.stopPropagation(); setPaymentPayslipId(item.originalId); }} className="text-[10px] px-2 py-1 h-auto">Pay</Button>
                                                     )}
                                                </td>
                                            </tr>
                                            {/* Render Children for Bulk Items */}
                                            {isExpanded && isBulk && item.children && (
                                                <tr className="bg-slate-50/50">
                                                    <td colSpan={9} className="p-0 border-b border-slate-200">
                                                        <div className="ml-10 my-1 border-l-2 border-slate-300">
                                                            <table className="w-full text-xs">
                                                                <thead>
                                                                    <tr className="text-slate-400 border-b border-slate-200 bg-slate-50">
                                                                        <th className="px-4 py-1 text-left font-normal w-[15%]">Date</th>
                                                                        <th className="px-4 py-1 text-left font-normal w-[25%]">Employee</th>
                                                                        <th className="px-4 py-1 text-left font-normal w-[40%]">Description</th>
                                                                        <th className="px-4 py-1 text-right font-normal w-[20%]">Amount</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                {item.children.map(child => (
                                                                    <tr key={child.id} className="hover:bg-white">
                                                                        <td className="px-4 py-2 w-[15%] text-slate-500">{formatDate(child.date)}</td>
                                                                        <td className="px-4 py-2 w-[25%] font-medium text-slate-700">{child.staffName}</td>
                                                                        <td className="px-4 py-2 w-[40%] text-slate-500 truncate">{child.description}</td>
                                                                        <td className="px-4 py-2 w-[20%] text-right font-mono text-rose-600">{CURRENCY} {child.paid.toLocaleString()}</td>
                                                                    </tr>
                                                                ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="w-12 h-12 text-slate-300 mb-2">{ICONS.fileText}</div>
                                                <p>No payroll records found for {getFilterLabel()}.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-700 font-medium flex justify-between">
                        <span>Records: {ledgerData.length}</span>
                        <div className="flex gap-4">
                             <span>Total Payable: {CURRENCY} {ledgerData.reduce((acc, i) => acc + i.payable, 0).toLocaleString()}</span>
                             <span>Total Paid: {CURRENCY} {ledgerData.reduce((acc, i) => acc + i.paid, 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {viewPayslipId && (
                <PayslipDetailModal 
                    isOpen={!!viewPayslipId}
                    onClose={() => setViewPayslipId(null)}
                    payslip={state.projectPayslips.concat(state.rentalPayslips).find(p => p.id === viewPayslipId)!}
                    onPay={() => { setViewPayslipId(null); setPaymentPayslipId(viewPayslipId); }}
                />
            )}

            {paymentPayslipId && (
                <PayslipPaymentModal 
                    isOpen={!!paymentPayslipId}
                    onClose={() => { setPaymentPayslipId(null); handlePaymentSuccess(); }}
                    payslip={state.projectPayslips.concat(state.rentalPayslips).find(p => p.id === paymentPayslipId) || null}
                />
            )}

            {isBulkPayModalOpen && (
                <PayslipBulkPaymentModal
                    isOpen={isBulkPayModalOpen}
                    onClose={() => setIsBulkPayModalOpen(false)}
                    selectedPayslips={selectedPayslipObjects}
                    onPaymentComplete={handlePaymentSuccess}
                />
            )}
        </div>
    );
};

export default PayslipManagement;


import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Transaction, AccountType, Project, Bill, InvoiceStatus, ContactType, PMCycleAllocation } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import ResizeHandle from '../ui/ResizeHandle';
import ProjectPMConfigForm from './ProjectPMConfigForm';
import ProjectPMPaymentModal from './ProjectPMPaymentModal';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { sumExpenseLinkedToBill } from '../../utils/billLinkedPayments';
import TreeView, { TreeNode } from '../ui/TreeView';
import { computePmFeeNetBaseForPeriod } from '../reports/projectProfitLossComputation';

// Interface for Ledger Item
interface PMLedgerItem {
    id: string;
    cycle: string; // e.g., "2024-01", "2024-W01", "2024"
    cycleLabel: string; // e.g., "January 2024", "Week 1, 2024", "2024"
    allocationDate?: string; // Date when allocation was created
    paymentDate?: string; // Date when payment was made
    projectId: string;
    projectName: string;
    amountAllocated: number;
    amountPaid: number;
    netBalance: number;
    type: 'Allocation' | 'Payment';
    allocationStartDate?: string;
    allocationEndDate?: string;
    billId?: string; // Bill ID for allocation
    /** Row in pm_cycle_allocations when present (Run Cycle creates both bill + allocation) */
    pmCycleAllocationId?: string;
}

const ProjectPMManager: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showConfirm, showToast } = useNotification();

    // State
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(state.defaultProjectId || null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    // UI State
    const [sidebarWidth, setSidebarWidth] = useState(300);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // --- Helpers ---

    const project = useMemo(() => state.projects.find(p => p.id === selectedProjectId), [state.projects, selectedProjectId]);

    const pmConfigVendorLabel = useMemo(() => {
        if (!project?.pmConfig?.vendorId) return '—';
        const v = (state.vendors || []).find((x) => x.id === project.pmConfig!.vendorId);
        if (!v) return '—';
        return v.companyName ? `${v.name} (${v.companyName})` : v.name;
    }, [project?.pmConfig?.vendorId, state.vendors]);

    // Get excluded categories for PM fee calculation
    const getExcludedCategories = useCallback((project: Project | undefined) => {
        const pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');
        let excludedCategoryIds: Set<string>;

        if (project?.pmConfig?.excludedCategoryIds && project.pmConfig.excludedCategoryIds.length > 0) {
            excludedCategoryIds = new Set(project.pmConfig.excludedCategoryIds);
        } else {
            const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
            const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
            const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');

            const discountCategories = state.categories.filter(c =>
                ['Customer Discount', 'Floor Discount', 'Lump Sum Discount', 'Misc Discount'].includes(c.name)
            );

            excludedCategoryIds = new Set([
                brokerFeeCategory?.id,
                rebateCategory?.id,
                ownerPayoutCategory?.id,
                ...discountCategories.map(c => c.id)
            ].filter(Boolean) as string[]);
        }

        if (pmCostCategory) {
            excludedCategoryIds.add(pmCostCategory.id);
        }

        return excludedCategoryIds;
    }, [state.categories]);

    // Calculate cycle period identifier
    const getCycleIdentifier = (date: Date, frequency: 'Monthly' | 'Weekly' | 'Yearly'): string => {
        const year = date.getFullYear();
        if (frequency === 'Yearly') {
            return `${year}`;
        } else if (frequency === 'Monthly') {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${year}-${month}`;
        } else { // Weekly
            const startOfYear = new Date(year, 0, 1);
            const days = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
            const week = Math.floor(days / 7) + 1;
            return `${year}-W${String(week).padStart(2, '0')}`;
        }
    };

    // Get cycle label for display
    const getCycleLabel = (cycleId: string, frequency: 'Monthly' | 'Weekly' | 'Yearly'): string => {
        if (frequency === 'Yearly') {
            return cycleId;
        } else if (frequency === 'Monthly') {
            const [year, month] = cycleId.split('-');
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            return `${monthNames[parseInt(month) - 1]} ${year}`;
        } else { // Weekly
            const [year, week] = cycleId.split('-W');
            return `Week ${parseInt(week)}, ${year}`;
        }
    };

    // Get date range for a cycle
    const getCycleDateRange = (cycleId: string, frequency: 'Monthly' | 'Weekly' | 'Yearly'): { start: Date, end: Date } => {
        if (frequency === 'Yearly') {
            const year = parseInt(cycleId);
            return {
                start: new Date(year, 0, 1),
                end: new Date(year, 11, 31, 23, 59, 59, 999)
            };
        } else if (frequency === 'Monthly') {
            const [year, month] = cycleId.split('-').map(Number);
            return {
                start: new Date(year, month - 1, 1),
                end: new Date(year, month, 0, 23, 59, 59, 999)
            };
        } else { // Weekly
            const [year, week] = cycleId.split('-W').map(Number);
            const startOfYear = new Date(year, 0, 1);
            const startDate = new Date(startOfYear);
            startDate.setDate(startDate.getDate() + (week - 1) * 7);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            return { start: startDate, end: endDate };
        }
    };

    // Check if allocation already exists for a cycle (PM bills and/or pm_cycle_allocations)
    const hasAllocationForCycle = useCallback((projectId: string, cycleId: string): boolean => {
        const hasBill = state.bills.some(bill => {
            if (bill.projectId !== projectId) return false;
            if (!bill.description?.includes('PM Fee Allocation')) return false;
            const cycleMatch = bill.description.match(/\[PM-ALLOC-([^\]]+)\]/);
            return cycleMatch && cycleMatch[1] === cycleId;
        });
        if (hasBill) return true;
        return (state.pmCycleAllocations || []).some(
            a => a.projectId === projectId && a.cycleId === cycleId
        );
    }, [state.bills, state.pmCycleAllocations]);

    // Get all allocations for a project (from bills and from pm_cycle_allocations table)
    const getAllocations = useCallback((projectId: string): Array<{ cycleId: string, amount: number, date: string, startDate: string, endDate: string, billId?: string, paidAmount?: number, allocationId?: string }> => {
        const byCycle = new Map<string, { cycleId: string, amount: number, date: string, startDate: string, endDate: string, billId?: string, paidAmount?: number, allocationId?: string }>();

        // 1. From bills (accounts payable) – preferred when both exist
        state.bills.forEach(bill => {
            if (bill.projectId !== projectId) return;
            if (!bill.description) return;
            if (!bill.description.includes('PM Fee Allocation')) return;

            let cycleId: string | null = null;
            const match1 = bill.description.match(/\[PM-ALLOC-([^\]]+)\]/);
            if (match1) cycleId = match1[1];
            if (!cycleId) return;

            const dateMatch = bill.description.match(/\[(\d{4}-\d{2}-\d{2})\] to \[(\d{4}-\d{2}-\d{2})\]/);
            const linkedAlloc = (state.pmCycleAllocations || []).find(a => a.billId === bill.id);
            byCycle.set(cycleId, {
                cycleId,
                amount: bill.amount,
                date: bill.issueDate,
                startDate: dateMatch ? dateMatch[1] : bill.issueDate,
                endDate: dateMatch ? dateMatch[2] : bill.issueDate,
                billId: bill.id,
                paidAmount: bill.paidAmount ?? 0,
                allocationId: linkedAlloc?.id
            });
        });

        // 2. From pm_cycle_allocations table (e.g. imported data with no bills) – add only if no bill for that cycle
        (state.pmCycleAllocations || []).forEach((alloc: PMCycleAllocation) => {
            if (alloc.projectId !== projectId) return;
            if (byCycle.has(alloc.cycleId)) return; // already have from bill
            byCycle.set(alloc.cycleId, {
                cycleId: alloc.cycleId,
                amount: alloc.amount ?? 0,
                date: alloc.allocationDate,
                startDate: alloc.startDate,
                endDate: alloc.endDate,
                billId: alloc.billId,
                paidAmount: alloc.paidAmount ?? 0,
                allocationId: alloc.id
            });
        });

        return Array.from(byCycle.values());
    }, [state.bills, state.pmCycleAllocations]);

    // Calculate financials for selected project (Total / Excluded / Net base match Project P&L; balance = unpaid PM-alloc bills)
    const financials = useMemo(() => {
        if (!selectedProjectId) return { totalExpense: 0, excludedCost: 0, netBase: 0, balance: 0 };

        const excludedCategoryIds = getExcludedCategories(project);
        const plEnd = toLocalDateString(new Date());
        const plStart = '2000-01-01';
        const pm = computePmFeeNetBaseForPeriod(state, selectedProjectId, plStart, plEnd, excludedCategoryIds);

        const pmAllocationBills = state.bills.filter(
            (b) => b.projectId === selectedProjectId && b.description?.includes('PM Fee Allocation')
        );
        const unpaidPmBillBalance = pmAllocationBills.reduce(
            (s, b) => s + Math.max(0, b.amount - (b.paidAmount || 0)),
            0
        );

        return {
            totalExpense: pm.totalExpense,
            excludedCost: pm.excludedCost,
            netBase: pm.netBase,
            balance: unpaidPmBillBalance,
        };
    }, [selectedProjectId, state, project, getExcludedCategories]);

    // Fee ledger: one row per cycle allocation from Run Cycle (amounts paid show on the same row)
    const ledgerItems = useMemo<PMLedgerItem[]>(() => {
        if (!selectedProjectId || !project) return [];

        const frequency = project.pmConfig?.frequency || 'Monthly';
        const items: PMLedgerItem[] = [];

        const allocations = getAllocations(selectedProjectId);
        allocations.forEach((alloc) => {
            items.push({
                id: `alloc-${alloc.allocationId || alloc.billId || alloc.cycleId}-${alloc.date}`,
                cycle: alloc.cycleId,
                cycleLabel: getCycleLabel(alloc.cycleId, frequency),
                allocationDate: alloc.date,
                projectId: selectedProjectId,
                projectName: project.name,
                amountAllocated: alloc.amount,
                amountPaid: alloc.paidAmount ?? 0,
                netBalance: 0,
                type: 'Allocation',
                allocationStartDate: alloc.startDate,
                allocationEndDate: alloc.endDate,
                billId: alloc.billId,
                pmCycleAllocationId: alloc.allocationId,
            });
        });

        items.sort((a, b) => {
            const dateA = a.allocationDate ? new Date(a.allocationDate).getTime() : 0;
            const dateB = b.allocationDate ? new Date(b.allocationDate).getTime() : 0;
            return dateA - dateB;
        });

        let runningBalance = 0;
        items.forEach((item) => {
            runningBalance += item.amountAllocated - (item.amountPaid || 0);
            item.netBalance = runningBalance;
        });

        return items;
    }, [selectedProjectId, state.bills, state.pmCycleAllocations, project, getCycleLabel, getAllocations]);

    // Calculate unpaid allocations for payment modal (from bills)
    const unpaidAllocations = useMemo<PMLedgerItem[]>(() => {
        if (!selectedProjectId || !project) return [];

        const frequency = project.pmConfig?.frequency || 'Monthly';
        const unpaid: PMLedgerItem[] = [];

        // Get all PM allocation bills for this project
        state.bills.forEach(bill => {
            if (bill.projectId !== selectedProjectId) return;
            if (!bill.description?.includes('PM Fee Allocation')) return;

            // Parse cycle from bill description
            const cycleMatch = bill.description.match(/\[PM-ALLOC-([^\]]+)\]/);
            if (!cycleMatch) return;

            const cycleId = cycleMatch[1];
            const unpaidAmount = bill.amount - bill.paidAmount;

            if (unpaidAmount > 0.01) {
                unpaid.push({
                    id: `alloc-${cycleId}`,
                    cycle: cycleId,
                    cycleLabel: getCycleLabel(cycleId, frequency),
                    allocationDate: bill.issueDate,
                    projectId: selectedProjectId,
                    projectName: project.name,
                    amountAllocated: bill.amount,
                    amountPaid: bill.paidAmount,
                    netBalance: unpaidAmount,
                    type: 'Allocation',
                    billId: bill.id
                });
            }
        });

        return unpaid.sort((a, b) => a.cycle.localeCompare(b.cycle));
    }, [state.bills, selectedProjectId, project, getCycleLabel]);

    // Calculate unallocated amount for a project (current ongoing cycle)
    const getUnallocatedAmount = useCallback((proj: Project): number => {
        if (!proj.pmConfig || !proj.pmConfig.rate || proj.pmConfig.rate <= 0) return 0;

        const frequency = proj.pmConfig.frequency || 'Monthly';
        const rate = proj.pmConfig.rate;
        const excludedCategoryIds = getExcludedCategories(proj);

        // Get current cycle
        const today = new Date();
        const currentCycleId = getCycleIdentifier(today, frequency);

        // Check if current cycle is already allocated
        if (hasAllocationForCycle(proj.id, currentCycleId)) {
            return 0; // Already allocated
        }

        // Get date range for current cycle
        const { start, end } = getCycleDateRange(currentCycleId, frequency);

        // Only calculate if we're within or past the cycle start
        if (today < start) {
            return 0; // Cycle hasn't started yet
        }

        // Current period not yet run: PM fee = rate% × P&L net cost base for partial cycle (matches Run Cycle logic)
        const cycleEnd = today < end ? today : end;
        const { netBase } = computePmFeeNetBaseForPeriod(
            state,
            proj.id,
            toLocalDateString(start),
            toLocalDateString(cycleEnd),
            excludedCategoryIds
        );
        const feeAmount = netBase * (rate / 100);

        return Math.round(feeAmount * 100) / 100;
    }, [getExcludedCategories, getCycleIdentifier, hasAllocationForCycle, getCycleDateRange, state]);

    // Tree Data
    const treeData = useMemo<TreeNode[]>(() => {
        return state.projects
            .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => {
                const unallocatedAmount = getUnallocatedAmount(p);
                return {
                    id: p.id,
                    label: p.name,
                    type: 'project' as const,
                    children: [],
                    value: unallocatedAmount > 0 ? unallocatedAmount : undefined,
                    valueColor: 'text-rose-600'
                };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [state.projects, searchQuery, getUnallocatedAmount]);

    // --- Resizing ---
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = sidebarWidth;
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        window.addEventListener('blur', stopResize);
        document.addEventListener('visibilitychange', stopResize);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth]);

    const handleResize = useCallback((e: MouseEvent) => {
        if (isResizing.current) {
            const delta = e.clientX - startX.current;
            const newWidth = Math.max(200, Math.min(600, startWidth.current + delta));
            setSidebarWidth(newWidth);
        }
    }, []);

    const stopResize = useCallback(() => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        window.removeEventListener('blur', stopResize);
        document.removeEventListener('visibilitychange', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    // --- Actions ---

    const handleSaveConfig = (updatedProject: Project) => {
        dispatch({ type: 'UPDATE_PROJECT', payload: updatedProject });
        setIsConfigModalOpen(false);
        showConfirm(`Updated PM configuration for ${updatedProject.name}.`, { title: "Success", confirmLabel: "OK", cancelLabel: "" });
    };

    const handleRefreshCycle = async (cycleId: string, billId?: string) => {
        if (!selectedProjectId || !project) {
            await showAlert("Please select a project first.");
            return;
        }

        if (!billId) {
            await showAlert("Cannot refresh cycle: Bill ID not found.");
            return;
        }

        const frequency = project.pmConfig?.frequency || 'Monthly';
        const rate = project.pmConfig?.rate || 0;

        if (rate <= 0) {
            await showAlert("Please configure PM fee rate first.");
            return;
        }

        // Find the existing bill
        const existingBill = state.bills.find(b => b.id === billId);
        if (!existingBill) {
            await showAlert("Cannot refresh cycle: Bill not found.");
            return;
        }

        // Get cycle date range
        const { start, end } = getCycleDateRange(cycleId, frequency);

        const excludedCategoryIds = getExcludedCategories(project);
        const { netBase } = computePmFeeNetBaseForPeriod(
            state,
            selectedProjectId,
            toLocalDateString(start),
            toLocalDateString(end),
            excludedCategoryIds
        );
        const newFeeAmount = Math.round((netBase * (rate / 100)) * 100) / 100;

        // Confirm refresh
        const confirm = await showConfirm(
            `This will recalculate the allocation for ${getCycleLabel(cycleId, frequency)}. New amount: ${CURRENCY} ${(newFeeAmount || 0).toLocaleString()} (Current: ${CURRENCY} ${(existingBill.amount || 0).toLocaleString()}). Continue?`,
            { title: "Refresh Cycle Allocation", confirmLabel: "Refresh", cancelLabel: "Cancel" }
        );

        if (!confirm) return;

        // Update the bill amount (preserve paidAmount)
        const updatedBill: Bill = {
            ...existingBill,
            amount: newFeeAmount
        };

        dispatch({ type: 'UPDATE_BILL', payload: updatedBill });
        const alloc = state.pmCycleAllocations?.find((a) => a.billId === billId);
        if (alloc) {
            dispatch({
                type: 'UPDATE_PM_CYCLE_ALLOCATION',
                payload: {
                    ...alloc,
                    amount: newFeeAmount,
                    expenseTotal: netBase,
                },
            });
        }
        showToast(`Refreshed allocation for ${getCycleLabel(cycleId, frequency)}. New amount: ${CURRENCY} ${(newFeeAmount || 0).toLocaleString()}`, "success");
    };

    /** PM payouts may link by billId; equity mode also adds a paired transfer with the same batchId. */
    const getTransactionIdsForPmAllocationBill = useCallback((billId: string): string[] => {
        const ids = new Set<string>();
        const direct = state.transactions.filter(tx => tx.billId === billId);
        direct.forEach(tx => ids.add(tx.id));
        const batchIds = new Set(direct.map(tx => tx.batchId).filter(Boolean) as string[]);
        if (batchIds.size > 0) {
            state.transactions.forEach(tx => {
                if (tx.batchId && batchIds.has(tx.batchId)) ids.add(tx.id);
            });
        }
        return [...ids];
    }, [state.transactions]);

    const handleDeleteAllocation = async (item: PMLedgerItem) => {
        if (item.type !== 'Allocation') return;
        const ledgerPay = item.billId ? sumExpenseLinkedToBill(state.transactions, item.billId) : 0;
        if (ledgerPay > 0.01) {
            await showAlert(
                'This allocation has payment transactions linked to its bill. Delete those expense payments (Project Bills & Payments or ledger) first, then delete the allocation.'
            );
            return;
        }
        if (!item.billId && !item.pmCycleAllocationId) {
            await showAlert('Cannot delete: no allocation record is linked to this row.');
            return;
        }

        const ok = await showConfirm(
            `Delete the PM fee allocation for ${item.cycleLabel}? The cycle will be available again for "Run Cycle Allocation".`,
            { title: 'Delete PM allocation', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );
        if (!ok) return;

        if (item.billId) {
            const txIds = getTransactionIdsForPmAllocationBill(item.billId);
            if (txIds.length > 0) {
                dispatch({ type: 'BATCH_DELETE_TRANSACTIONS', payload: { transactionIds: txIds } });
            }
            dispatch({ type: 'DELETE_BILL', payload: item.billId });
            const allocId =
                item.pmCycleAllocationId ||
                state.pmCycleAllocations?.find(a => a.billId === item.billId)?.id;
            if (allocId) {
                dispatch({ type: 'DELETE_PM_CYCLE_ALLOCATION', payload: allocId });
            }
        } else if (item.pmCycleAllocationId) {
            dispatch({ type: 'DELETE_PM_CYCLE_ALLOCATION', payload: item.pmCycleAllocationId });
        }

        showToast(`Removed PM allocation for ${item.cycleLabel}.`, 'success');
    };

    const handleRunCycle = async () => {
        if (!selectedProjectId || !project) {
            await showAlert("Please select a project first.");
            return;
        }

        const frequency = project.pmConfig?.frequency || 'Monthly';
        const rate = project.pmConfig?.rate || 0;

        if (rate <= 0) {
            await showAlert("Please configure PM fee rate first.");
            return;
        }

        // Find the first expense date for this project
        const excludedCategoryIds = getExcludedCategories(project);
        const firstExpense = state.transactions
            .filter(tx => tx.projectId === selectedProjectId && tx.type === TransactionType.EXPENSE)
            .filter(tx => !tx.categoryId || !excludedCategoryIds.has(tx.categoryId))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

        if (!firstExpense) {
            await showAlert("No expenses found for this project.");
            return;
        }

        const firstExpenseDate = new Date(firstExpense.date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        // Generate all cycles from first expense to today
        const cyclesToProcess: Array<{ cycleId: string, start: Date, end: Date }> = [];
        let currentDate = new Date(firstExpenseDate);

        while (currentDate <= today) {
            const cycleId = getCycleIdentifier(currentDate, frequency);
            const { start, end } = getCycleDateRange(cycleId, frequency);

            // Only process if cycle end is before or equal to today
            if (end <= today) {
                // Check if we already have this cycle
                if (!hasAllocationForCycle(selectedProjectId, cycleId)) {
                    cyclesToProcess.push({ cycleId, start, end });
                }
            }

            // Move to next cycle
            if (frequency === 'Yearly') {
                currentDate = new Date(currentDate.getFullYear() + 1, 0, 1);
            } else if (frequency === 'Monthly') {
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            } else { // Weekly
                currentDate.setDate(currentDate.getDate() + 7);
            }
        }

        if (cyclesToProcess.length === 0) {
            await showAlert("All cycles have already been allocated.");
            return;
        }

        const confirm = await showConfirm(
            `This will allocate PM fees for ${cyclesToProcess.length} cycle(s) from ${formatDate(toLocalDateString(firstExpenseDate))} to today. Continue?`,
            { title: "Run Cycle Allocation", confirmLabel: "Allocate", cancelLabel: "Cancel" }
        );

        if (!confirm) return;

        // Process each cycle
        // Find or create Project Management Cost category
        let pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');
        if (!pmCostCategory) {
            // Create PM Cost category if it doesn't exist
            pmCostCategory = {
                id: `pm-cost-category-${Date.now()}`,
                name: 'Project Management Cost',
                type: TransactionType.EXPENSE,
                description: 'System category for project management fee allocations',
                isPermanent: false
            };
            dispatch({ type: 'ADD_CATEGORY', payload: pmCostCategory });
        }

        // Resolve vendor for bills: use configured vendor from PM config, else fallback to PM contact.
        // DB: bills.contact_id REFERENCES contacts(id), bills.vendor_id REFERENCES vendors(id).
        // So for vendor-directory vendors set only vendorId; for fallback PM contact set only contactId.
        const configuredVendor = project.pmConfig?.vendorId
            ? state.vendors?.find(v => v.id === project.pmConfig!.vendorId)
            : null;
        let pmContact = state.contacts.find(c =>
            c.name.toLowerCase().includes('project management') ||
            c.name.toLowerCase().includes('pm team')
        );
        if (!pmContact && !configuredVendor) {
            pmContact = {
                id: `pm-contact-${Date.now()}`,
                name: 'Project Management Team',
                type: ContactType.VENDOR,
                contactNo: '',
                address: '',
                description: 'System contact for PM fee allocations'
            };
            dispatch({ type: 'ADD_CONTACT', payload: pmContact });
        }

        // PM-ALLOC bill numbers must be unique per tenant (DB: UNIQUE(tenant_id, bill_number)).
        // Take max from existing bills, then increment for each new bill in this run (not only max+1 once).
        const pmAllocPrefix = 'PM-ALLOC-';
        const pmAllocPadding = 5;
        let nextPmAllocSeq = 0;
        state.bills.forEach(b => {
            if (b.billNumber && b.billNumber.startsWith(pmAllocPrefix)) {
                const part = b.billNumber.substring(pmAllocPrefix.length);
                if (/^\d+$/.test(part)) {
                    const num = parseInt(part, 10);
                    if (num > nextPmAllocSeq) nextPmAllocSeq = num;
                }
            }
        });

        const billRows: Array<{
            bill: Bill;
            cycleId: string;
            start: Date;
            end: Date;
            netBase: number;
            cycleLabel: string;
        }> = [];

        cyclesToProcess.forEach(({ cycleId, start, end }) => {
            const { netBase } = computePmFeeNetBaseForPeriod(
                state,
                selectedProjectId,
                toLocalDateString(start),
                toLocalDateString(end),
                excludedCategoryIds
            );
            const feeAmount = Math.round((netBase * (rate / 100)) * 100) / 100;

            if (feeAmount > 0.01) { // Only create allocation if amount is significant
                const cycleLabel = getCycleLabel(cycleId, frequency);
                const startDateStr = toLocalDateString(start);
                const endDateStr = toLocalDateString(end);

                nextPmAllocSeq += 1;
                const billNumber = `${pmAllocPrefix}${String(nextPmAllocSeq).padStart(pmAllocPadding, '0')}`;

                // Create a bill for this allocation (accounts payable).
                // Use vendorId only when vendor is from directory (contact_id must stay NULL); use contactId only for fallback PM contact.
                const bill: Bill = {
                    id: `pm-bill-${cycleId}-${Date.now()}`,
                    billNumber,
                    ...(configuredVendor
                        ? { vendorId: configuredVendor.id }
                        : { contactId: pmContact!.id }
                    ),
                    amount: feeAmount,
                    paidAmount: 0,
                    status: InvoiceStatus.UNPAID,
                    issueDate: toLocalDateString(end), // Use end date of cycle
                    description: `PM Fee Allocation - [PM-ALLOC-${cycleId}] - ${cycleLabel} - [${startDateStr}] to [${endDateStr}]`,
                    categoryId: pmCostCategory.id,
                    projectId: selectedProjectId
                };
                billRows.push({ bill, cycleId, start, end, netBase, cycleLabel });
            }
        });

        if (billRows.length > 0) {
            billRows.forEach(({ bill, cycleId, start, end, netBase, cycleLabel }, index) => {
                const allocation: PMCycleAllocation = {
                    id: `pm-alloc-${cycleId}-${Date.now()}-${index}`,
                    projectId: selectedProjectId,
                    cycleId: cycleId,
                    cycleLabel: cycleLabel,
                    frequency: frequency,
                    startDate: toLocalDateString(start),
                    endDate: toLocalDateString(end),
                    allocationDate: toLocalDateString(new Date()),
                    amount: bill.amount,
                    paidAmount: 0,
                    status: 'unpaid',
                    billId: bill.id,
                    description: bill.description,
                    expenseTotal: netBase,
                    feeRate: rate,
                    excludedCategoryIds: Array.from(excludedCategoryIds)
                };

                dispatch({ type: 'ADD_BILL', payload: bill });
                dispatch({ type: 'ADD_PM_CYCLE_ALLOCATION', payload: allocation });
            });

            showToast(`Allocated PM fees for ${billRows.length} cycle(s). Bills created as accounts payable.`, "success");
        } else {
            await showAlert("No fees to allocate for the selected cycles.");
        }
    };

    return (
        <div className="flex h-full bg-background overflow-hidden">
            {/* Left Sidebar: Projects List */}
            <div
                className="flex-col h-full flex-shrink-0 bg-app-card border-r border-app-border shadow-ds-card z-10 transition-all duration-300 hidden md:flex"
                style={{ width: sidebarWidth }}
            >
                <div className="p-4 border-b border-app-border bg-app-card">
                    <h2 className="text-xs font-bold text-app-muted uppercase tracking-wider mb-3">Select Project</h2>
                    <div className="relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted group-focus-within:text-primary transition-colors">
                            {ICONS.search}
                        </div>
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="ds-input-field w-full pl-9 pr-4 py-2 text-sm rounded-lg placeholder:text-app-muted"
                        />
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto p-2 scrollbar-thin">
                    <TreeView
                        treeData={treeData}
                        selectedId={selectedProjectId}
                        onSelect={(id) => setSelectedProjectId(id)}
                        valueColumnHeader="Provisional PM (not in cycle)"
                    />
                </div>
            </div>

            {/* Resize Handle */}
            <div className="hidden md:block h-full relative z-20">
                <ResizeHandle onMouseDown={startResizing} />
            </div>

            {/* Right Content */}
            <div className="flex-grow flex flex-col h-full overflow-hidden relative">
                {selectedProjectId && project ? (
                    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin scrollbar-track-transparent">

                        {/* Hero Header */}
                        <div className="bg-app-card border-b border-app-border px-8 py-6 sticky top-0 z-10 shadow-ds-card bg-app-card/90 backdrop-blur-md">
                            <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-6">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-primary/15 text-primary rounded-lg">
                                            {ICONS.archive}
                                        </div>
                                        <h1 className="text-2xl font-bold text-app-text tracking-tight">{project.name}</h1>
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${project.pmConfig?.rate && project.pmConfig.rate > 0
                                            ? 'border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success'
                                            : 'border-ds-warning/35 bg-app-toolbar text-ds-warning'
                                            }`}>
                                            {project.pmConfig?.rate ? 'Active' : 'Not Configured'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-app-muted">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-app-text">Fee Rate:</span>
                                            <span className="text-app-text font-bold bg-app-toolbar px-2 py-0.5 rounded text-xs border border-app-border">{project.pmConfig?.rate || 0}%</span>
                                        </div>
                                        <div className="w-px h-4 bg-app-border hidden sm:block"></div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-app-text">Cycle:</span>
                                            <span className="text-app-text font-bold">{project.pmConfig?.frequency || 'Monthly'}</span>
                                        </div>
                                        <div className="w-px h-4 bg-app-border hidden sm:block"></div>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-medium text-app-text shrink-0">Vendor:</span>
                                            <span className="text-app-text font-bold truncate max-w-[min(100%,20rem)]" title={pmConfigVendorLabel}>
                                                {pmConfigVendorLabel}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <Button variant="secondary" onClick={() => setIsConfigModalOpen(true)} className="!border-app-border !bg-app-card !shadow-ds-card hover:!bg-app-toolbar">
                                        <span className="mr-2 opacity-70 scale-90">{ICONS.settings}</span> Configure
                                    </Button>
                                    <Button onClick={handleRunCycle} className="!bg-primary hover:!bg-ds-primary-hover !text-ds-on-primary !shadow-ds-card">
                                        <span className="mr-2">{ICONS.plus}</span> Run Cycle Allocation
                                    </Button>
                                    <Button
                                        onClick={() => setIsPaymentModalOpen(true)}
                                        disabled={financials.balance <= 0}
                                        className={`${financials.balance > 0 ? '!bg-ds-success hover:opacity-90 !text-white !shadow-ds-card' : 'opacity-50'}`}
                                    >
                                        <span className="mr-2">{ICONS.minus}</span> Record Payout
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 max-w-7xl mx-auto w-full space-y-8">

                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                <div className="bg-app-card p-5 rounded-xl border border-app-border shadow-ds-card hover:shadow-md transition-shadow">
                                    <div className="text-app-muted mb-1 scale-90 origin-left">{ICONS.barChart}</div>
                                    <p className="text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Total Expense</p>
                                    <p className="text-2xl font-bold text-app-text tabular-nums">{CURRENCY} {(financials.totalExpense || 0).toLocaleString()}</p>
                                    <p className="text-xs text-app-muted mt-1">Matches Project Selling → P&amp;L total expense (through today)</p>
                                </div>

                                <div className="bg-app-card p-5 rounded-xl border border-app-border shadow-ds-card hover:shadow-md transition-shadow">
                                    <div className="text-app-muted mb-1 scale-90 origin-left">{ICONS.filter}</div>
                                    <p className="text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Excluded Cost</p>
                                    <p className="text-2xl font-bold text-app-text tabular-nums">{CURRENCY} {(financials.excludedCost || 0).toLocaleString()}</p>
                                    <p className="text-xs text-app-muted mt-1">Expense in categories excluded in PM configuration</p>
                                </div>

                                <div className="bg-gradient-to-br from-primary to-ds-primary-hover p-5 rounded-xl text-ds-on-primary shadow-ds-card">
                                    <div className="text-white/70 mb-1 scale-90 origin-left">{ICONS.wallet}</div>
                                    <p className="text-xs font-bold text-white/90 uppercase tracking-wider mb-2">Net Cost Base</p>
                                    <p className="text-2xl font-bold tabular-nums">{CURRENCY} {(financials.netBase || 0).toLocaleString()}</p>
                                    <p className="text-xs text-white/75 mt-1">Total expense − excluded (fee % applies here)</p>
                                </div>

                                <div className="bg-app-card p-5 rounded-xl border border-app-border shadow-ds-card relative overflow-hidden group">
                                    <div className="absolute right-0 top-0 w-20 h-20 bg-ds-success/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                    <div className="relative text-ds-success mb-1 scale-90 origin-left">{ICONS.dollarSign}</div>
                                    <p className="relative text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Balance Due</p>
                                    <p className="relative text-2xl font-bold text-ds-success tabular-nums">{CURRENCY} {(financials.balance || 0).toLocaleString()}</p>
                                    <p className="relative text-xs text-app-muted mt-1">Unpaid on PM fee bills after cycle run</p>
                                </div>
                            </div>

                            {/* Ledger Section */}
                            <div className="bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden">
                                <div className="px-6 py-5 border-b border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-app-toolbar/50">
                                    <div>
                                        <h3 className="font-bold text-app-text text-lg">Fee Ledger</h3>
                                        <p className="text-sm text-app-muted">Monthly PM charges created by Run Cycle Allocation (per configuration)</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {/* Filters could go here */}
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-app-border">
                                        <thead className="bg-app-table-header border-b border-app-border">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-app-muted uppercase tracking-wider">Type</th>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-app-muted uppercase tracking-wider">Cycle / Ref</th>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-app-muted uppercase tracking-wider">Date</th>
                                                <th className="px-6 py-4 text-right text-xs font-bold text-app-muted uppercase tracking-wider">Allocated</th>
                                                <th className="px-6 py-4 text-right text-xs font-bold text-app-muted uppercase tracking-wider">Paid</th>
                                                <th className="px-6 py-4 text-right text-xs font-bold text-app-muted uppercase tracking-wider">Balance</th>
                                                <th className="px-6 py-4 text-center text-xs font-bold text-app-muted uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-app-border">
                                            {ledgerItems.map((item) => (
                                                <tr key={item.id} className="hover:bg-app-toolbar/60 transition-colors group">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${item.type === 'Allocation'
                                                            ? 'border border-primary/25 bg-app-toolbar text-primary'
                                                            : 'border border-ds-success/30 bg-[color:var(--badge-paid-bg)] text-ds-success'
                                                            }`}>
                                                            {item.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm font-medium text-app-text">{item.cycleLabel || '-'}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-app-muted">
                                                        {item.type === 'Allocation'
                                                            ? (item.allocationDate ? formatDate(item.allocationDate) : '-')
                                                            : (item.paymentDate ? formatDate(item.paymentDate) : '-')
                                                        }
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <span className={`text-sm font-mono tabular-nums ${item.amountAllocated > 0 ? 'text-app-text font-medium' : 'text-app-muted/40'}`}>
                                                            {item.amountAllocated > 0 ? `${CURRENCY} ${item.amountAllocated.toLocaleString()}` : '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <span className={`text-sm font-mono tabular-nums ${item.amountPaid > 0 ? 'text-ds-success font-bold' : 'text-app-muted/40'}`}>
                                                            {item.amountPaid > 0 ? `${CURRENCY} ${item.amountPaid.toLocaleString()}` : '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <span className={`text-sm font-mono font-bold tabular-nums ${(item.netBalance || 0) > 0 ? 'text-primary' :
                                                            (item.netBalance || 0) < 0 ? 'text-ds-success' :
                                                                'text-app-muted'
                                                            }`}>
                                                            {CURRENCY} {(item.netBalance || 0).toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                                        {item.type === 'Allocation' && (item.billId || item.pmCycleAllocationId) ? (
                                                            <div className="inline-flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {item.billId ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleRefreshCycle(item.cycle, item.billId);
                                                                        }}
                                                                        className="p-2 text-app-muted hover:text-primary hover:bg-app-toolbar rounded-lg transition-all transform active:scale-95"
                                                                        title="Recalculate allocation from expenses for this cycle"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
                                                                    </button>
                                                                ) : null}
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteAllocation(item);
                                                                    }}
                                                                    className="p-2 text-app-muted hover:text-ds-danger hover:bg-app-toolbar rounded-lg transition-all transform active:scale-95"
                                                                    title="Delete this auto-generated PM allocation"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-app-muted/30 text-xs">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {ledgerItems.length === 0 && (
                                                <tr>
                                                    <td colSpan={7} className="px-6 py-16 text-center">
                                                        <div className="flex flex-col items-center justify-center">
                                                            <div className="w-12 h-12 bg-app-toolbar rounded-full flex items-center justify-center mb-3 border border-app-border">
                                                                <div className="text-app-muted">{ICONS.fileText}</div>
                                                            </div>
                                                            <p className="text-app-text font-medium">No Ledger Allocations</p>
                                                            <p className="text-app-muted text-sm mt-1 max-w-xs">Run a cycle allocation to start tracking PM fees.</p>
                                                            <Button size="sm" onClick={handleRunCycle} className="mt-4 !border-app-border !bg-app-card !text-primary hover:!bg-app-toolbar">
                                                                Start Now
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Modals */}
                        {isConfigModalOpen && (
                            <ProjectPMConfigForm
                                isOpen={isConfigModalOpen}
                                onClose={() => setIsConfigModalOpen(false)}
                                project={project}
                                onSave={handleSaveConfig}
                            />
                        )}

                        {isPaymentModalOpen && (
                            <ProjectPMPaymentModal
                                isOpen={isPaymentModalOpen}
                                onClose={() => setIsPaymentModalOpen(false)}
                                project={project}
                                balanceDue={financials.balance}
                                unpaidAllocations={unpaidAllocations}
                            />
                        )}

                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full bg-background">
                        <div className="w-24 h-24 bg-app-card rounded-full shadow-ds-card border border-app-border flex items-center justify-center mb-6 animate-pulse-slow">
                            <div className="text-primary/40 w-12 h-12">
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-app-text mb-2">Select a Project</h3>
                        <p className="text-app-muted text-center max-w-sm mb-8">
                            Choose a project from the sidebar to configure PM fees, run cycle allocations, and manage payouts.
                        </p>
                        <div className="flex flex-wrap justify-center gap-2 text-xs text-app-muted font-medium uppercase tracking-wider">
                            <span className="px-3 py-1 bg-app-card border border-app-border rounded-full">Automated Cycles</span>
                            <span className="px-3 py-1 bg-app-card border border-app-border rounded-full">Fee Tracking</span>
                            <span className="px-3 py-1 bg-app-card border border-app-border rounded-full">Payouts</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectPMManager;


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
import { formatDate } from '../../utils/dateUtils';
import TreeView, { TreeNode } from '../ui/TreeView';

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

    // Get all expense transactions for a project within a date range
    const getExpensesInRange = (projectId: string, startDate: Date, endDate: Date, excludedCategoryIds: Set<string>) => {
        const transactions: Array<{ amount: number }> = [];
        const processedBills = new Set<string>();

        state.transactions.forEach(tx => {
            // Resolve projectId from linked entities
            let resolvedProjectId = tx.projectId;

            if (tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill && !resolvedProjectId) resolvedProjectId = bill.projectId;
            }

            if (tx.invoiceId) {
                const inv = state.invoices.find(i => i.id === tx.invoiceId);
                if (inv && !resolvedProjectId) resolvedProjectId = inv.projectId;
            }

            if (resolvedProjectId !== projectId) return;
            if (tx.type !== TransactionType.EXPENSE) return;

            const txDate = new Date(tx.date);
            if (txDate < startDate || txDate > endDate) return;

            // Handle bills with expenseCategoryItems
            if (tx.billId && !processedBills.has(tx.billId)) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill && bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
                    // Process each expenseCategoryItem
                    bill.expenseCategoryItems.forEach(item => {
                        if (!item.categoryId) return;
                        if (excludedCategoryIds.has(item.categoryId)) return;
                        transactions.push({ amount: item.netValue || 0 });
                    });
                    processedBills.add(tx.billId);
                    return;
                }
            }

            // Regular transaction processing
            if (tx.categoryId && excludedCategoryIds.has(tx.categoryId)) return;
            transactions.push({ amount: tx.amount });
        });

        return transactions;
    };

    // Check if allocation already exists for a cycle (check bills)
    const hasAllocationForCycle = (projectId: string, cycleId: string): boolean => {
        return state.bills.some(bill => {
            if (bill.projectId !== projectId) return false;
            if (!bill.description?.includes('PM Fee Allocation')) return false;
            const cycleMatch = bill.description.match(/\[PM-ALLOC-([^\]]+)\]/);
            return cycleMatch && cycleMatch[1] === cycleId;
        });
    };

    // Get all allocations for a project (from bills)
    const getAllocations = useCallback((projectId: string): Array<{ cycleId: string, amount: number, date: string, startDate: string, endDate: string, billId?: string }> => {
        const allocations: Array<{ cycleId: string, amount: number, date: string, startDate: string, endDate: string, billId?: string }> = [];

        // Get allocations from bills (accounts payable)
        state.bills.forEach(bill => {
            if (bill.projectId !== projectId) return;
            if (!bill.description) return;
            if (!bill.description.includes('PM Fee Allocation')) return;

            // Parse allocation bill
            // Format: "PM Fee Allocation - [PM-ALLOC-CYCLE] - CycleLabel - [START] to [END]"
            let cycleId: string | null = null;

            // Pattern 1: [PM-ALLOC-CYCLE]
            const match1 = bill.description.match(/\[PM-ALLOC-([^\]]+)\]/);
            if (match1) {
                cycleId = match1[1];
            }

            if (cycleId) {
                const amount = bill.amount;
                const date = bill.issueDate;

                // Try to extract date range from description
                const dateMatch = bill.description.match(/\[(\d{4}-\d{2}-\d{2})\] to \[(\d{4}-\d{2}-\d{2})\]/);
                const startDate = dateMatch ? dateMatch[1] : date;
                const endDate = dateMatch ? dateMatch[2] : date;

                allocations.push({ cycleId, amount, date, startDate, endDate, billId: bill.id });
            }
        });

        return allocations;
    }, [state.bills]);

    // Calculate financials for selected project
    const financials = useMemo(() => {
        if (!selectedProjectId) return { totalExpense: 0, excludedCost: 0, netBase: 0, accrued: 0, paid: 0, balance: 0 };

        const excludedCategoryIds = getExcludedCategories(project);
        let totalExpense = 0;
        let excludedCost = 0;
        let paid = 0;

        // Track which bills have been processed to avoid double-counting
        const processedBills = new Set<string>();

        state.transactions.forEach(tx => {
            // Resolve projectId from linked entities
            let projectId = tx.projectId;
            let categoryId = tx.categoryId;

            // Resolve from linked Bill if missing
            if (tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill) {
                    if (!projectId) projectId = bill.projectId;
                    if (!categoryId) categoryId = bill.categoryId;
                }
            }

            // Resolve from linked Invoice if missing
            if (tx.invoiceId) {
                const inv = state.invoices.find(i => i.id === tx.invoiceId);
                if (inv) {
                    if (!projectId) projectId = inv.projectId;
                    if (!categoryId) categoryId = inv.categoryId;
                }
            }

            if (projectId !== selectedProjectId) return;
            if (tx.type !== TransactionType.EXPENSE) return;

            const pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');

            // Handle bills with expenseCategoryItems (process once per bill)
            if (tx.billId && !processedBills.has(tx.billId)) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill && bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
                    // Process expenseCategoryItems
                    bill.expenseCategoryItems.forEach(item => {
                        if (!item.categoryId) return;
                        const itemAmount = item.netValue || 0;

                        // Only count as payment if it's NOT a system transaction
                        if (item.categoryId === pmCostCategory?.id && !tx.isSystem) {
                            paid += itemAmount;
                        } else {
                            totalExpense += itemAmount;
                            if (excludedCategoryIds.has(item.categoryId)) {
                                excludedCost += itemAmount;
                            }
                        }
                    });
                    processedBills.add(tx.billId);
                    return; // Skip the single category processing below
                }
            }

            // Only count as payment if it's NOT a system transaction (system transactions are allocations)
            if (tx.categoryId === pmCostCategory?.id && !tx.isSystem) {
                paid += tx.amount;
            } else {
                totalExpense += tx.amount;
                if (tx.categoryId && excludedCategoryIds.has(tx.categoryId)) {
                    excludedCost += tx.amount;
                }
            }
        });

        // Also check TRANSFER transactions for PM payments (exclude system transactions)
        state.transactions.forEach(tx => {
            if (tx.projectId !== selectedProjectId) return;
            if (tx.isSystem) return; // Skip system transactions (allocations)
            if (tx.type === TransactionType.TRANSFER) {
                if (tx.description?.toLowerCase().includes('pm fee') || tx.description?.toLowerCase().includes('pm payout')) {
                    paid += tx.amount;
                }
            }
        });

        const netBase = totalExpense - excludedCost;
        const rate = project?.pmConfig?.rate || 0;
        const accrued = netBase * (rate / 100);

        return {
            totalExpense,
            excludedCost,
            netBase,
            accrued,
            paid,
            balance: accrued - paid
        };

    }, [selectedProjectId, state.transactions, state.categories, state.bills, state.invoices, project, getExcludedCategories]);

    // Build ledger items (allocations + payments as separate entries with running balance)
    const ledgerItems = useMemo<PMLedgerItem[]>(() => {
        if (!selectedProjectId || !project) return [];

        const pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');
        const frequency = project.pmConfig?.frequency || 'Monthly';
        const items: PMLedgerItem[] = [];

        // Get all allocations - create separate entries for each
        const allocations = getAllocations(selectedProjectId);
        allocations.forEach(alloc => {
            items.push({
                id: `alloc-${alloc.cycleId}-${alloc.date}`,
                cycle: alloc.cycleId,
                cycleLabel: getCycleLabel(alloc.cycleId, frequency),
                allocationDate: alloc.date,
                projectId: selectedProjectId,
                projectName: project.name,
                amountAllocated: alloc.amount,
                amountPaid: 0,
                netBalance: 0, // Will be calculated as running balance
                type: 'Allocation',
                allocationStartDate: alloc.startDate,
                allocationEndDate: alloc.endDate,
                billId: alloc.billId
            });
        });

        // Get all payments - create separate entries for each
        const payments: Array<{ id: string, date: string, amount: number, cycleId?: string, description?: string }> = [];
        state.transactions.forEach(tx => {
            if (tx.projectId !== selectedProjectId) return;

            // Skip system transactions (these are allocations, not payments)
            if (tx.isSystem) return;

            let isPayment = false;
            // Payment: EXPENSE transaction linked to a PM bill (billId exists and bill is PM allocation)
            if (tx.type === TransactionType.EXPENSE && tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill && bill.description?.includes('PM Fee Allocation')) {
                    isPayment = true;
                }
            } else if (tx.type === TransactionType.EXPENSE && tx.categoryId === pmCostCategory?.id &&
                (tx.description?.toLowerCase().includes('pm fee') || tx.description?.toLowerCase().includes('pm payout'))) {
                // Legacy: PM payment without bill link
                isPayment = true;
            } else if (tx.type === TransactionType.TRANSFER &&
                (tx.description?.toLowerCase().includes('pm fee') || tx.description?.toLowerCase().includes('pm payout'))) {
                isPayment = true;
            }

            if (isPayment) {
                // Try to extract cycle from payment description if it references a cycle
                const cycleMatch = tx.description?.match(/\[PM-ALLOC-([^\]]+)\]/);
                payments.push({
                    id: tx.id,
                    date: tx.date,
                    amount: tx.amount,
                    cycleId: cycleMatch ? cycleMatch[1] : undefined,
                    description: tx.description
                });
            }
        });

        // Create separate payment entries
        payments.forEach(payment => {
            items.push({
                id: `payment-${payment.id}`,
                cycle: payment.cycleId || '',
                cycleLabel: payment.cycleId ? `${getCycleLabel(payment.cycleId, frequency)} (Payment)` : 'Payment',
                paymentDate: payment.date,
                projectId: selectedProjectId,
                projectName: project.name,
                amountAllocated: 0,
                amountPaid: payment.amount,
                netBalance: 0, // Will be calculated as running balance
                type: 'Payment'
            });
        });

        // Sort all items chronologically by date (oldest first for ledger format)
        items.sort((a, b) => {
            const dateA = a.type === 'Allocation'
                ? (a.allocationDate ? new Date(a.allocationDate).getTime() : 0)
                : (a.paymentDate ? new Date(a.paymentDate).getTime() : 0);
            const dateB = b.type === 'Allocation'
                ? (b.allocationDate ? new Date(b.allocationDate).getTime() : 0)
                : (b.paymentDate ? new Date(b.paymentDate).getTime() : 0);

            // If same date, allocations come before payments
            if (dateA === dateB) {
                return a.type === 'Allocation' ? -1 : 1;
            }
            return dateA - dateB;
        });

        // Calculate running balance (ledger format)
        let runningBalance = 0;
        items.forEach(item => {
            if (item.type === 'Allocation') {
                // Allocation increases the balance
                runningBalance += item.amountAllocated;
            } else {
                // Payment decreases the balance
                runningBalance -= item.amountPaid;
            }
            item.netBalance = runningBalance;
        });

        return items;

    }, [selectedProjectId, state.transactions, state.bills, state.categories, project, getCycleLabel, getAllocations]);

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

        // Get expenses in current cycle (up to today, not full cycle end)
        const cycleEnd = today < end ? today : end;
        const expenses = getExpensesInRange(proj.id, start, cycleEnd, excludedCategoryIds);
        const totalExpense = expenses.reduce((sum, tx) => sum + tx.amount, 0);
        const feeAmount = totalExpense * (rate / 100);

        // Round to 2 decimal places
        return Math.round(feeAmount * 100) / 100;
    }, [getExcludedCategories, getCycleIdentifier, hasAllocationForCycle, getCycleDateRange, getExpensesInRange]);

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

        // Recalculate expenses for this cycle
        const excludedCategoryIds = getExcludedCategories(project);
        const expenses = getExpensesInRange(selectedProjectId, start, end, excludedCategoryIds);
        const totalExpense = expenses.reduce((sum, tx) => sum + tx.amount, 0);
        const newFeeAmount = Math.round((totalExpense * (rate / 100)) * 100) / 100;

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
        showToast(`Refreshed allocation for ${getCycleLabel(cycleId, frequency)}. New amount: ${CURRENCY} ${(newFeeAmount || 0).toLocaleString()}`, "success");
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
            `This will allocate PM fees for ${cyclesToProcess.length} cycle(s) from ${formatDate(firstExpenseDate.toISOString().split('T')[0])} to today. Continue?`,
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

        // Generate bill number helper
        const generateBillNumber = () => {
            const prefix = 'PM-ALLOC-';
            const padding = 5;
            let maxNum = 0;
            state.bills.forEach(b => {
                if (b.billNumber && b.billNumber.startsWith(prefix)) {
                    const part = b.billNumber.substring(prefix.length);
                    if (/^\d+$/.test(part)) {
                        const num = parseInt(part, 10);
                        if (num > maxNum) maxNum = num;
                    }
                }
            });
            return `${prefix}${String(maxNum + 1).padStart(padding, '0')}`;
        };

        const bills: Bill[] = [];

        cyclesToProcess.forEach(({ cycleId, start, end }) => {
            const expenses = getExpensesInRange(selectedProjectId, start, end, excludedCategoryIds);
            const totalExpense = expenses.reduce((sum, tx) => sum + tx.amount, 0);
            const feeAmount = totalExpense * (rate / 100);

            if (feeAmount > 0.01) { // Only create allocation if amount is significant
                const cycleLabel = getCycleLabel(cycleId, frequency);
                const startDateStr = start.toISOString().split('T')[0];
                const endDateStr = end.toISOString().split('T')[0];

                // Create a bill for this allocation (accounts payable).
                // Use vendorId only when vendor is from directory (contact_id must stay NULL); use contactId only for fallback PM contact.
                const bill: Bill = {
                    id: `pm-bill-${cycleId}-${Date.now()}`,
                    billNumber: generateBillNumber(),
                    ...(configuredVendor
                        ? { vendorId: configuredVendor.id }
                        : { contactId: pmContact!.id }
                    ),
                    amount: feeAmount,
                    paidAmount: 0,
                    status: InvoiceStatus.UNPAID,
                    issueDate: end.toISOString().split('T')[0], // Use end date of cycle
                    description: `PM Fee Allocation - [PM-ALLOC-${cycleId}] - ${cycleLabel} - [${startDateStr}] to [${endDateStr}]`,
                    categoryId: pmCostCategory.id,
                    projectId: selectedProjectId
                };
                bills.push(bill);
            }
        });

        if (bills.length > 0) {
            // Create PM cycle allocation records for each bill
            cyclesToProcess.forEach(({ cycleId, start, end }, index) => {
                const bill = bills[index];
                if (!bill) return; // Skip if no bill was created for this cycle
                
                const expenses = getExpensesInRange(selectedProjectId, start, end, excludedCategoryIds);
                const totalExpense = expenses.reduce((sum, tx) => sum + tx.amount, 0);
                const cycleLabel = getCycleLabel(cycleId, frequency);
                
                // Create PM cycle allocation record
                const allocation: PMCycleAllocation = {
                    id: `pm-alloc-${cycleId}-${Date.now()}-${index}`,
                    projectId: selectedProjectId,
                    cycleId: cycleId,
                    cycleLabel: cycleLabel,
                    frequency: frequency,
                    startDate: start.toISOString().split('T')[0],
                    endDate: end.toISOString().split('T')[0],
                    allocationDate: new Date().toISOString().split('T')[0],
                    amount: bill.amount,
                    paidAmount: 0,
                    status: 'unpaid',
                    billId: bill.id,
                    description: bill.description,
                    expenseTotal: totalExpense,
                    feeRate: rate,
                    excludedCategoryIds: Array.from(excludedCategoryIds)
                };
                
                // Dispatch bill (existing behavior)
                dispatch({ type: 'ADD_BILL', payload: bill });
                
                // Dispatch PM cycle allocation (new - for cloud sync)
                dispatch({ type: 'ADD_PM_CYCLE_ALLOCATION', payload: allocation });
            });
            
            showToast(`Allocated PM fees for ${bills.length} cycle(s). Bills created as accounts payable.`, "success");
        } else {
            await showAlert("No fees to allocate for the selected cycles.");
        }
    };

    return (
        <div className="flex h-full bg-slate-50/30 overflow-hidden">
            {/* Left Sidebar: Projects List */}
            <div
                className="flex-col h-full flex-shrink-0 bg-white border-r border-slate-200 shadow-sm z-10 transition-all duration-300 hidden md:flex"
                style={{ width: sidebarWidth }}
            >
                <div className="p-4 border-b border-slate-100 bg-white">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Select Project</h2>
                    <div className="relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                            {ICONS.search}
                        </div>
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300">
                    <TreeView
                        treeData={treeData}
                        selectedId={selectedProjectId}
                        onSelect={(id) => setSelectedProjectId(id)}
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
                    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">

                        {/* Hero Header */}
                        <div className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-10 shadow-sm bg-white/90 backdrop-blur-md">
                            <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-6">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                            {ICONS.archive}
                                        </div>
                                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{project.name}</h1>
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${project.pmConfig?.rate && project.pmConfig.rate > 0
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                            : 'bg-amber-50 text-amber-700 border-amber-100'
                                            }`}>
                                            {project.pmConfig?.rate ? 'Active' : 'Not Configured'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-6 text-sm text-slate-500">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">Fee Rate:</span>
                                            <span className="text-slate-900 font-bold bg-slate-100 px-2 py-0.5 rounded text-xs">{project.pmConfig?.rate || 0}%</span>
                                        </div>
                                        <div className="w-px h-4 bg-slate-300"></div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">Cycle:</span>
                                            <span className="text-slate-900 font-bold">{project.pmConfig?.frequency || 'Monthly'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <Button variant="secondary" onClick={() => setIsConfigModalOpen(true)} className="!bg-white !shadow-sm !border-slate-300 hover:!bg-slate-50">
                                        <span className="mr-2 opacity-70 scale-90">{ICONS.settings}</span> Configure
                                    </Button>
                                    <Button onClick={handleRunCycle} className="!bg-indigo-600 hover:!bg-indigo-700 !shadow-md shadow-indigo-200">
                                        <span className="mr-2">{ICONS.plus}</span> Run Cycle Allocation
                                    </Button>
                                    <Button
                                        onClick={() => setIsPaymentModalOpen(true)}
                                        disabled={financials.balance <= 0}
                                        className={`${financials.balance > 0 ? '!bg-emerald-600 hover:!bg-emerald-700 !text-white !shadow-md shadow-emerald-200' : 'opacity-50'}`}
                                    >
                                        <span className="mr-2">{ICONS.minus}</span> Record Payout
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 max-w-7xl mx-auto w-full space-y-8">

                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="text-slate-400 mb-1 scale-90 origin-left">{ICONS.barChart}</div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Expenses</p>
                                    <p className="text-2xl font-bold text-slate-700">{CURRENCY} {(financials.totalExpense || 0).toLocaleString()}</p>
                                    <p className="text-xs text-slate-400 mt-1">Gross project spending</p>
                                </div>

                                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="text-slate-400 mb-1 scale-90 origin-left">{ICONS.filter}</div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Excluded Costs</p>
                                    <p className="text-2xl font-bold text-slate-500">{CURRENCY} {(financials.excludedCost || 0).toLocaleString()}</p>
                                    <p className="text-xs text-slate-400 mt-1">Non-commissionable</p>
                                </div>

                                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 rounded-xl text-white shadow-lg shadow-indigo-200">
                                    <div className="text-indigo-200 mb-1 scale-90 origin-left">{ICONS.wallet}</div>
                                    <p className="text-xs font-bold text-indigo-100 uppercase tracking-wider mb-2">Net Cost Base</p>
                                    <p className="text-2xl font-bold">{CURRENCY} {(financials.netBase || 0).toLocaleString()}</p>
                                    <p className="text-xs text-indigo-200 mt-1">Commissionable Amount</p>
                                </div>

                                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm relative overflow-hidden group">
                                    <div className="absolute right-0 top-0 w-20 h-20 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                    <div className="relative text-emerald-500 mb-1 scale-90 origin-left">{ICONS.dollarSign}</div>
                                    <p className="relative text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Balance Due</p>
                                    <p className="relative text-2xl font-bold text-emerald-600">{CURRENCY} {(financials.balance || 0).toLocaleString()}</p>
                                    <div className="relative flex items-center gap-2 mt-1">
                                        <span className="text-xs text-slate-400">Accrued: {CURRENCY} {(financials.accrued || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Ledger Section */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-lg">Fee Ledger</h3>
                                        <p className="text-sm text-slate-500">History of allocations and payments</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {/* Filters could go here */}
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-100">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Cycle / Ref</th>
                                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Allocated</th>
                                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Paid</th>
                                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                                                <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 bg-white">
                                            {ledgerItems.map((item, idx) => (
                                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${item.type === 'Allocation'
                                                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                            }`}>
                                                            {item.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm font-medium text-slate-700">{item.cycleLabel || '-'}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                                        {item.type === 'Allocation'
                                                            ? (item.allocationDate ? formatDate(item.allocationDate) : '-')
                                                            : (item.paymentDate ? formatDate(item.paymentDate) : '-')
                                                        }
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <span className={`text-sm font-mono ${item.amountAllocated > 0 ? 'text-slate-900 font-medium' : 'text-slate-300'}`}>
                                                            {item.amountAllocated > 0 ? `${CURRENCY} ${item.amountAllocated.toLocaleString()}` : '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <span className={`text-sm font-mono ${item.amountPaid > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}`}>
                                                            {item.amountPaid > 0 ? `${CURRENCY} ${item.amountPaid.toLocaleString()}` : '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <span className={`text-sm font-mono font-bold ${(item.netBalance || 0) > 0 ? 'text-indigo-600' :
                                                            (item.netBalance || 0) < 0 ? 'text-emerald-600' :
                                                                'text-slate-400'
                                                            }`}>
                                                            {CURRENCY} {(item.netBalance || 0).toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                                        {item.type === 'Allocation' && item.billId ? (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRefreshCycle(item.cycle, item.billId);
                                                                }}
                                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 transform active:scale-95"
                                                                title="Refresh allocation"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
                                                            </button>
                                                        ) : (
                                                            <span className="text-slate-200 text-xs">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {ledgerItems.length === 0 && (
                                                <tr>
                                                    <td colSpan={7} className="px-6 py-16 text-center">
                                                        <div className="flex flex-col items-center justify-center">
                                                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                                                <div className="text-slate-300">{ICONS.fileText}</div>
                                                            </div>
                                                            <p className="text-slate-900 font-medium">No Ledger Allocations</p>
                                                            <p className="text-slate-500 text-sm mt-1 max-w-xs">Run a cycle allocation to start tracking PM fees.</p>
                                                            <Button size="sm" onClick={handleRunCycle} className="mt-4 !bg-white !text-indigo-600 !border-indigo-200 hover:!bg-indigo-50">
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
                    <div className="flex flex-col items-center justify-center h-full bg-slate-50/50">
                        <div className="w-24 h-24 bg-white rounded-full shadow-sm border border-slate-100 flex items-center justify-center mb-6 animate-pulse-slow">
                            <div className="text-indigo-200 w-12 h-12 opacity-50">
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Select a Project</h3>
                        <p className="text-slate-500 text-center max-w-sm mb-8">
                            Choose a project from the sidebar to configure PM fees, run cycle allocations, and manage payouts.
                        </p>
                        <div className="flex gap-2 text-xs text-slate-400 font-medium uppercase tracking-wider">
                            <span className="px-3 py-1 bg-white border border-slate-200 rounded-full">Automated Cycles</span>
                            <span className="px-3 py-1 bg-white border border-slate-200 rounded-full">Fee Tracking</span>
                            <span className="px-3 py-1 bg-white border border-slate-200 rounded-full">Payouts</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectPMManager;

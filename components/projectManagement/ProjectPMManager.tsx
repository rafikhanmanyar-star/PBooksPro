
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Transaction, AccountType, Project } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import ResizeHandle from '../ui/ResizeHandle';
import ProjectPMConfigForm from './ProjectPMConfigForm';
import ProjectPMPaymentModal from './ProjectPMPaymentModal';
import { formatDate } from '../../utils/dateUtils';
import PayrollTreeView, { PayrollTreeNode } from '../payroll/PayrollTreeView';

// Interface for Ledger Item
interface PMLedgerItem {
    id: string;
    date: string;
    description: string;
    accrued: number;
    paid: number;
    balance: number;
    type: 'Fee Accrued' | 'Payment';
}

const ProjectPMManager: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showConfirm } = useNotification();

    // State
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
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

    // Calculate financials for selected project
    const financials = useMemo(() => {
        if (!selectedProjectId) return { totalExpense: 0, excludedCost: 0, netBase: 0, accrued: 0, paid: 0, balance: 0 };
        
        // --- DETERMINE EXCLUDED CATEGORIES ---
        const pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');
        let excludedCategoryIds: Set<string>;

        // 1. Check if Project has explicit configuration
        if (project?.pmConfig?.excludedCategoryIds && project.pmConfig.excludedCategoryIds.length > 0) {
            excludedCategoryIds = new Set(project.pmConfig.excludedCategoryIds);
        } else {
            // 2. Legacy Fallback: Hardcoded list if not configured
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

        // Always exclude the PM Cost category itself to prevent circular fees
        if (pmCostCategory) {
            excludedCategoryIds.add(pmCostCategory.id);
        }

        let totalExpense = 0;
        let excludedCost = 0;
        let paid = 0;

        state.transactions.forEach(tx => {
            if (tx.projectId !== selectedProjectId) return;
            if (tx.type !== TransactionType.EXPENSE) return;

            // Track Payments separately
            if (tx.categoryId === pmCostCategory?.id) {
                paid += tx.amount;
            } else {
                totalExpense += tx.amount;
                // Check against the set of excluded categories
                if (tx.categoryId && excludedCategoryIds.has(tx.categoryId)) {
                    excludedCost += tx.amount;
                }
            }
        });

        // Also check TRANSFER transactions that might be equity payouts to PM team
        state.transactions.forEach(tx => {
             if (tx.projectId !== selectedProjectId) return;
             if (tx.type === TransactionType.TRANSFER) {
                 if (tx.description?.toLowerCase().includes('pm fee') || tx.description?.toLowerCase().includes('pm payout')) {
                     paid += tx.amount;
                 }
             }
        });

        const netBase = totalExpense - excludedCost;
        // Use Project Specific Rate or Default to 0
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

    }, [selectedProjectId, state.transactions, state.categories, project]);

    // Ledger Items
    const ledgerItems = useMemo<PMLedgerItem[]>(() => {
        if (!selectedProjectId) return [];
        const pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');
        
        const items: PMLedgerItem[] = [];

        // 1. Payments
        state.transactions.forEach(tx => {
            if (tx.projectId !== selectedProjectId) return;
            
            let isPayment = false;
            if (tx.type === TransactionType.EXPENSE && tx.categoryId === pmCostCategory?.id) isPayment = true;
            if (tx.type === TransactionType.TRANSFER && (tx.description?.toLowerCase().includes('pm fee') || tx.description?.toLowerCase().includes('pm payout'))) isPayment = true;

            if (isPayment) {
                items.push({
                    id: tx.id,
                    date: tx.date,
                    description: tx.description || 'PM Fee Payment',
                    accrued: 0,
                    paid: tx.amount,
                    balance: 0,
                    type: 'Payment'
                });
            }
        });

        return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    }, [selectedProjectId, state.transactions, state.categories]);

    // Tree Data
    const treeData = useMemo<PayrollTreeNode[]>(() => {
        return state.projects
            .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => ({
                id: p.id,
                name: p.name,
                type: 'project' as const,
                children: [],
                count: 0 // Optional: Could show accrued amount here
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [state.projects, searchQuery]);

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

    return (
        <div className="flex h-full gap-4">
            {/* Left Sidebar: Projects List */}
            <div 
                className="flex-col h-full flex-shrink-0 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden hidden md:flex"
                style={{ width: sidebarWidth }}
            >
                <div className="p-3 border-b bg-slate-50">
                    <Input 
                        placeholder="Search projects..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="text-sm py-1.5"
                    />
                </div>
                <div className="flex-grow overflow-y-auto p-2">
                    <PayrollTreeView 
                        treeData={treeData} 
                        selectedId={selectedProjectId} 
                        onSelect={(id) => setSelectedProjectId(id)} 
                    />
                </div>
            </div>

            {/* Resize Handle */}
            <div className="hidden md:block h-full">
                <ResizeHandle onMouseDown={startResizing} />
            </div>

            {/* Right Content */}
            <div className="flex-grow flex flex-col h-full overflow-hidden bg-white rounded-lg border border-slate-200 shadow-sm">
                {selectedProjectId && project ? (
                    <>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">{project.name}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-sm text-slate-500 font-medium">PM Fee Rate:</span>
                                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">
                                        {project.pmConfig?.rate || 0}%
                                    </span>
                                    <span className="text-xs text-slate-400">({project.pmConfig?.frequency || 'Monthly'})</span>
                                </div>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => setIsConfigModalOpen(true)}>
                                <div className="w-4 h-4 mr-2">{ICONS.settings}</div> Configure
                            </Button>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total Expenses</p>
                                <p className="text-lg font-semibold text-slate-700 mt-1">{CURRENCY} {financials.totalExpense.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Excluded Costs</p>
                                <p className="text-lg font-semibold text-slate-500 mt-1">{CURRENCY} {financials.excludedCost.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                                <p className="text-xs text-indigo-600 uppercase font-bold tracking-wider">Net Cost Base</p>
                                <p className="text-xl font-bold text-indigo-700 mt-1">{CURRENCY} {financials.netBase.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-center text-white shadow-md">
                                <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Balance Due</p>
                                <p className="text-2xl font-bold mt-1 text-emerald-400">{CURRENCY} {financials.balance.toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Accrued: {CURRENCY} {financials.accrued.toLocaleString(undefined, {maximumFractionDigits:0})}
                                </p>
                            </div>
                        </div>

                        <div className="flex-grow overflow-hidden flex flex-col px-6 pb-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-700">Payment History</h3>
                                <Button onClick={() => setIsPaymentModalOpen(true)} disabled={financials.balance <= 0}>
                                    Record Payment
                                </Button>
                            </div>
                            
                            <div className="flex-grow overflow-auto border rounded-lg shadow-sm">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Description</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-600">Amount Paid</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {ledgerItems.map(item => (
                                            <tr key={item.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-600">{formatDate(item.date)}</td>
                                                <td className="px-4 py-3 text-slate-800">{item.description}</td>
                                                <td className="px-4 py-3 text-right font-mono text-emerald-600 font-medium">{CURRENCY} {item.paid.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                        {ledgerItems.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-8 text-center text-slate-500 italic">No payment history found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
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
                            />
                        )}

                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        <p>Select a project to manage PM costs.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectPMManager;

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { AccountType, TransactionType, Transaction } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { CURRENCY, ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';
import TreeView, { TreeNode } from '../ui/TreeView';
import useLocalStorage from '../../hooks/useLocalStorage';
import ResizeHandle from '../ui/ResizeHandle';
import Tabs from '../ui/Tabs';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';
import ProjectInvestorReport from '../reports/ProjectInvestorReport';
import { printFromTemplate, getPrintTemplateWrapper } from '../../services/printService';
import { formatCurrency } from '../../utils/numberUtils';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface InvestorDistribution {
    investorId: string;
    investorName: string;
    principal: number;
    sharePercentage: number;
    profitShare: number;
    newEquityBalance: number;
}

interface TransferRow {
    investorId: string;
    investorName: string;
    currentEquity: number;
    transferAmount: string;
    isSelected: boolean;
}

// Helper to get entity color style for Type field
const getEntityColorStyle = (projectId: string | undefined, buildingId: string | undefined, state: any) => {
    if (!state.enableColorCoding) return {};

    let color = null;
    if (projectId) {
        const project = state.projects.find((p: any) => p.id === projectId);
        if (project?.color) color = project.color;
    }
    if (!color && buildingId) {
        const building = state.buildings.find((b: any) => b.id === buildingId);
        if (building?.color) color = building.color;
    }

    if (color) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return { 
            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
        };
    }
    return {};
};

const ProjectEquityManagement: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();
    
    // State
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [selectedTreeType, setSelectedTreeType] = useState<'project' | 'staff' | 'building' | null>(null);
    const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState('Ledger'); // Default tab

    const [searchQuery, setSearchQuery] = useState('');
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('projectEquity_sidebarWidth', 300);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    
    // Action Form
    const [formInvestorId, setFormInvestorId] = useState('');
    const [formProjectId, setFormProjectId] = useState(state.defaultProjectId || '');
    const [formBankAccountId, setFormBankAccountId] = useState('');
    const [formAmount, setFormAmount] = useState('');
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formDescription, setFormDescription] = useState('');

    // Editing State
    const [editingBatch, setEditingBatch] = useState<{
        mainTx: Transaction;
        siblings: Transaction[];
        mode: 'SIMPLE' | 'BATCH_DIST' | 'BATCH_MOVE';
        // Form Data
        amount: string;
        date: string;
        description: string;
        projectId: string; // Source Project or Main Project
        targetProjectId: string; // For Moves
        investorId: string;
        bankAccountId: string;
    } | null>(null);

    // --- PROFIT DISTRIBUTION STATE ---
    const [distProjectId, setDistProjectId] = useState<string>(state.defaultProjectId || '');
    const [distProfit, setDistProfit] = useState<string>('');
    const [cycleName, setCycleName] = useState<string>(`Cycle ${new Date().getFullYear()}`);
    const [distributions, setDistributions] = useState<InvestorDistribution[]>([]);
    const [distStep, setDistStep] = useState<1 | 2>(1);

    // --- EQUITY TRANSFER STATE ---
    const [sourceProjectId, setSourceProjectId] = useState('');
    const [destProjectId, setDestProjectId] = useState('');
    const [transferRows, setTransferRows] = useState<TransferRow[]>([]);
    const [transferStep, setTransferStep] = useState<1 | 2>(1);
    const [transferType, setTransferType] = useState<'PROJECT' | 'PAYOUT'>('PROJECT');
    const [payoutAccountId, setPayoutAccountId] = useState('');


    const equityAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.EQUITY), [state.accounts]);
    const bankAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    // Resizing Logic
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

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

    // --- Balances Calculation for Tree ---
    const balances = useMemo(() => {
        const projBal: Record<string, number> = {};
        const invTotalBal: Record<string, number> = {};
        const invProjBal: Record<string, Record<string, number>> = {}; // projectId -> investorId -> amount

        // Initialize
        state.projects.forEach(p => projBal[p.id] = 0);
        equityAccounts.forEach(a => invTotalBal[a.id] = 0);

        const txs = state.transactions.filter(tx => 
            tx.type === TransactionType.TRANSFER || 
            (tx.type === TransactionType.INCOME && equityAccounts.some(e => e.id === tx.accountId))
        );

        txs.forEach(tx => {
            const impacts: { investorId: string, amount: number, projectId: string }[] = [];
            
            const fromEquity = equityAccounts.find(a => a.id === tx.fromAccountId);
            const toEquity = equityAccounts.find(a => a.id === tx.toAccountId);
            const incomeEquity = equityAccounts.find(a => a.id === tx.accountId);
            
            const pId = tx.projectId || 'unassigned';

            if (tx.type === TransactionType.INCOME && incomeEquity) {
                // Profit Share (Direct) -> Deposit
                impacts.push({ investorId: incomeEquity.id, amount: tx.amount, projectId: pId });
            } else if (tx.type === TransactionType.TRANSFER) {
                if (fromEquity && !toEquity) {
                    // Investment -> Deposit (Positive Equity Balance)
                    impacts.push({ investorId: fromEquity.id, amount: tx.amount, projectId: pId });
                } else if (toEquity && !fromEquity) {
                     // Withdrawal or Profit Share
                     if (tx.description?.toLowerCase().includes('profit')) {
                         impacts.push({ investorId: toEquity.id, amount: tx.amount, projectId: pId });
                     } else {
                         impacts.push({ investorId: toEquity.id, amount: -tx.amount, projectId: pId });
                     }
                } else if (fromEquity && toEquity) {
                    // Transfer between equity. 
                    impacts.push({ investorId: fromEquity.id, amount: -tx.amount, projectId: pId });
                    impacts.push({ investorId: toEquity.id, amount: tx.amount, projectId: pId });
                }
            }

            impacts.forEach(({ investorId, amount, projectId }) => {
                invTotalBal[investorId] = (invTotalBal[investorId] || 0) + amount;
                
                if (projectId !== 'unassigned') {
                    projBal[projectId] = (projBal[projectId] || 0) + amount;
                    if (!invProjBal[projectId]) invProjBal[projectId] = {};
                    invProjBal[projectId][investorId] = (invProjBal[projectId][investorId] || 0) + amount;
                }
            });
        });

        return { projBal, invTotalBal, invProjBal };
    }, [state.transactions, equityAccounts, state.projects]);


    // --- Data ---
    const treeData = useMemo<TreeNode[]>(() => {
        const nodes: TreeNode[] = [];
        
        // 1. All Investors Node (Parent)
        const allInvestorsNode: TreeNode = {
            id: 'root-investors',
            name: 'All Investors',
            type: 'building', 
            children: [],
            count: 0,
            amount: 0
        };

        equityAccounts.forEach(acc => {
            const balance = balances.invTotalBal[acc.id] || 0;
            allInvestorsNode.children.push({
                id: acc.id,
                name: acc.name,
                type: 'staff',
                children: [],
                count: 0,
                amount: balance
            });
            if (balance !== 0) allInvestorsNode.amount = (allInvestorsNode.amount || 0) + balance;
        });
        allInvestorsNode.children.sort((a, b) => a.name.localeCompare(b.name));
        allInvestorsNode.count = allInvestorsNode.children.length;
        
        nodes.push(allInvestorsNode); 

        // 2. Projects Node Group
        const projectNodes: TreeNode[] = [];
        state.projects.forEach(p => {
             const projBalance = balances.projBal[p.id] || 0;
             const projectNode: TreeNode = {
                id: p.id,
                name: p.name,
                type: 'project',
                children: [],
                count: 0,
                amount: projBalance
            };
            
            // Find investors active in this project via pre-calc
            const projInvestors = balances.invProjBal[p.id] || {};
            
            Object.entries(projInvestors).forEach(([invId, amount]) => {
                const inv = equityAccounts.find(a => a.id === invId);
                if (inv) {
                    projectNode.children.push({
                        id: inv.id,
                        name: inv.name,
                        type: 'staff',
                        children: [],
                        amount: amount
                    });
                }
            });
            
            projectNode.children.sort((a,b) => a.name.localeCompare(b.name));
            projectNode.count = projectNode.children.length;
            
            if (projectNode.count > 0 || Math.abs(projBalance) > 0.01) projectNodes.push(projectNode);
        });
        projectNodes.sort((a, b) => a.name.localeCompare(b.name));
        nodes.push(...projectNodes);

        return nodes;
    }, [state.projects, equityAccounts, balances]);

    const ledgerData = useMemo(() => {
        if (!selectedTreeId) return [];
        
        let txs = state.transactions.filter(tx => tx.type === TransactionType.TRANSFER || (tx.type === TransactionType.INCOME && equityAccounts.some(e => e.id === tx.accountId)));
        
        if (selectedTreeId === 'root-investors') {
             txs = txs.filter(tx => 
                equityAccounts.some(a => a.id === tx.fromAccountId || a.id === tx.toAccountId || a.id === tx.accountId)
            );
        } else if (selectedTreeType === 'project') {
            txs = txs.filter(tx => tx.projectId === selectedTreeId);
        } else if (selectedTreeType === 'staff') {
            // Filter by investor ID
            txs = txs.filter(tx => tx.fromAccountId === selectedTreeId || tx.toAccountId === selectedTreeId || tx.accountId === selectedTreeId);
            
            // STRICT FILTERING: Limit to selected parent project if exists and NOT global investor view
            if (selectedParentId && selectedParentId !== 'root-investors') {
                txs = txs.filter(tx => tx.projectId === selectedParentId);
            }
        }

        // Sort Chronologically
        txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let runningBalance = 0;

        return txs.map(tx => {
            const isFromEquity = equityAccounts.some(a => a.id === tx.fromAccountId);
            const isToEquity = equityAccounts.some(a => a.id === tx.toAccountId);
            
            let paymentType = 'Transfer';
            let paymentTypeColor = 'text-slate-600';
            
            let amount = tx.amount;
            
            let isDeposit = false;
            let isWithdrawal = false;

            if (tx.type === TransactionType.INCOME) {
                paymentType = 'Profit Share';
                paymentTypeColor = 'text-emerald-600';
                isDeposit = true; // Income adds to equity
            } else if (tx.type === TransactionType.TRANSFER) {
                // Determine direction relative to the investor
                const isTargetInvestor = selectedTreeType === 'staff' ? (tx.toAccountId === selectedTreeId) : isToEquity;
                const isSourceInvestor = selectedTreeType === 'staff' ? (tx.fromAccountId === selectedTreeId) : isFromEquity;

                // Check if this is a PM fee transfer (from Clearing to PM equity)
                const fromAccount = state.accounts.find(a => a.id === tx.fromAccountId);
                const isFromClearing = fromAccount?.name === 'Internal Clearing';
                const isPMFeeTransfer = tx.description?.toLowerCase().includes('pm fee') || 
                                       tx.description?.toLowerCase().includes('pm fee equity');

                if (isSourceInvestor && !isTargetInvestor) {
                    // Investment: Money flows FROM investor (equity) TO bank
                    // This increases the investor's equity balance (investment recorded)
                    isDeposit = true;
                    paymentType = 'Investment';
                    paymentTypeColor = 'text-blue-600';
                } else if (isTargetInvestor && !isSourceInvestor) {
                    // Check if this is a PM fee transfer (deposit) or withdrawal
                    if (isFromClearing && isPMFeeTransfer) {
                        // PM Fee Transfer: Clearing -> PM Equity (deposit/investment)
                        // This increases the PM project's equity balance
                        isDeposit = true;
                        paymentType = 'PM Fee Deposit';
                        paymentTypeColor = 'text-emerald-600';
                    } else if (tx.description?.toLowerCase().includes('profit')) {
                        // Profit Share: Increases equity
                        paymentType = 'Profit Share';
                        paymentTypeColor = 'text-emerald-600';
                        isDeposit = true;
                        isWithdrawal = false;
                    } else {
                        // Withdrawal: Money flows FROM bank TO investor (equity)
                        // This decreases the investor's equity balance (capital returned)
                        isWithdrawal = true;
                        paymentType = 'Withdrawal';
                        paymentTypeColor = 'text-rose-600';
                    }
                } else if (isSourceInvestor && isTargetInvestor) {
                    // Equity to Equity (Transfer)
                    paymentType = 'Equity Transfer';
                    paymentTypeColor = 'text-slate-500';
                    if (selectedTreeType === 'staff') {
                        if (tx.fromAccountId === selectedTreeId) isWithdrawal = true;
                        else isDeposit = true;
                    }
                }
            }

            // Rounding to nearest 100
            const roundedAmount = Math.round(amount / 100) * 100;
            
            if (isDeposit) runningBalance += roundedAmount;
            if (isWithdrawal) runningBalance -= roundedAmount;

            const roundedBalance = Math.round(runningBalance / 100) * 100;

            // Info Column Construction
            let info = '';
            const project = state.projects.find(p => p.id === tx.projectId);
            if (project) info = `Project: ${project.name}`;
            
            let otherAccId = tx.accountId;
            if (tx.type === TransactionType.TRANSFER) {
                if (selectedTreeType === 'staff' && selectedTreeId) {
                    otherAccId = (tx.fromAccountId === selectedTreeId) ? tx.toAccountId! : tx.fromAccountId!;
                } else {
                    otherAccId = isDeposit ? tx.fromAccountId! : tx.toAccountId!;
                }
            }
            const otherAcc = state.accounts.find(a => a.id === otherAccId);
            if (otherAcc) info += ` | ${otherAcc.name}`;

            return {
                ...tx,
                paymentType,
                paymentTypeColor,
                info,
                amount: roundedAmount,
                balance: roundedBalance,
                isDeposit,
                isWithdrawal,
                projectName: project?.name || '-'
            };
        });
    }, [selectedTreeId, selectedTreeType, selectedParentId, state.transactions, equityAccounts, state.projects, state.accounts]);

    // --- Editing Handlers ---
    const handleRowClick = (txItem: any) => {
        const mainTx = state.transactions.find(t => t.id === txItem.id);
        if (!mainTx) return;

        let siblings: Transaction[] = [];
        let mode: 'SIMPLE' | 'BATCH_DIST' | 'BATCH_MOVE' = 'SIMPLE';
        let projectId = mainTx.projectId || '';
        let targetProjectId = '';
        let investorId = '';
        let bankAccountId = '';

        if (mainTx.batchId) {
            siblings = state.transactions.filter(t => t.batchId === mainTx.batchId && t.id !== mainTx.id);
            if (mainTx.description?.toLowerCase().includes('profit') || siblings[0]?.description?.toLowerCase().includes('profit')) {
                mode = 'BATCH_DIST';
            } else if (mainTx.description?.toLowerCase().includes('move') || siblings[0]?.description?.toLowerCase().includes('move')) {
                mode = 'BATCH_MOVE';
            }
        }

        // Determine IDs based on Mode
        if (mode === 'SIMPLE') {
            // Investment or Withdrawal
            if (txItem.isDeposit) { // Investment: from=investor, to=bank
                investorId = mainTx.fromAccountId!;
                bankAccountId = mainTx.toAccountId!;
            } else { // Withdrawal: from=bank, to=investor
                investorId = mainTx.toAccountId!;
                bankAccountId = mainTx.fromAccountId!;
            }
        } else if (mode === 'BATCH_MOVE') {
            // Find the Divest (Source) and Invest (Target) transactions
            const allInBatch = [mainTx, ...siblings];
            // Divest: from = clearing, to = investor, proj = Source (Assuming logic from handleTransferCommit)
            // Wait, logic was:
            // Divest: type TRANSFER, from=Clearing, to=Investor, projectId=Source
            // Invest: type TRANSFER, from=Investor, to=Clearing, projectId=Dest
            
            const divestTx = allInBatch.find(t => t.id.includes('divest'));
            const investTx = allInBatch.find(t => t.id.includes('invest'));
            
            if (divestTx && investTx) {
                projectId = divestTx.projectId || '';
                targetProjectId = investTx.projectId || '';
                investorId = divestTx.toAccountId || ''; // Divest transfers TO investor (from clearing)
            }
        } else if (mode === 'BATCH_DIST') {
            // Profit Distribution
            // Expense: Proj -> Clearing. Transfer: Clearing -> Investor.
            const transferTx = [mainTx, ...siblings].find(t => t.type === TransactionType.TRANSFER);
            if (transferTx) {
                investorId = transferTx.toAccountId!;
                projectId = transferTx.projectId || '';
            }
        }

        setEditingBatch({
            mainTx,
            siblings,
            mode,
            amount: mainTx.amount.toString(),
            date: new Date(mainTx.date).toISOString().split('T')[0],
            description: mainTx.description || '',
            projectId,
            targetProjectId,
            investorId,
            bankAccountId
        });
    };

    const handleSaveEdit = async () => {
        if (!editingBatch) return;
        const { mainTx, siblings, mode, amount, date, description, projectId, targetProjectId, investorId, bankAccountId } = editingBatch;
        
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            await showAlert("Invalid Amount");
            return;
        }

        const txsToUpdate: Transaction[] = [];

        if (mode === 'SIMPLE') {
            // Simple Transfer update
            // Determine if this is an investment or withdrawal based on original transaction
            const originalIsInvestment = equityAccounts.some(a => a.id === mainTx.fromAccountId) && 
                                        bankAccounts.some(a => a.id === mainTx.toAccountId);
            const originalIsWithdrawal = bankAccounts.some(a => a.id === mainTx.fromAccountId) && 
                                         equityAccounts.some(a => a.id === mainTx.toAccountId);
            
            let fromId, toId;
            if (originalIsInvestment || (!originalIsWithdrawal && equityAccounts.some(a => a.id === investorId))) {
                // Investment: from=investor, to=bank
                fromId = investorId;
                toId = bankAccountId;
            } else {
                // Withdrawal: from=bank, to=investor
                fromId = bankAccountId;
                toId = investorId;
            }
            
            const updatedTx: Transaction = {
                ...mainTx,
                amount: numAmount,
                date,
                description,
                projectId: projectId || undefined,
                fromAccountId: fromId,
                toAccountId: toId,
                accountId: fromId // Primary account is the source
            };
            txsToUpdate.push(updatedTx);
        } else if (mode === 'BATCH_MOVE') {
            const allInBatch = [mainTx, ...siblings];
            const divestTx = allInBatch.find(t => t.id.includes('divest'));
            const investTx = allInBatch.find(t => t.id.includes('invest'));

            if (divestTx && investTx) {
                // Update Divest (Source Project)
                txsToUpdate.push({
                    ...divestTx,
                    amount: numAmount,
                    date,
                    description: `Equity Move out of ${state.projects.find(p=>p.id===projectId)?.name}`,
                    projectId: projectId,
                    toAccountId: investorId // Divest sends to Investor from Clearing
                });
                // Update Invest (Target Project)
                txsToUpdate.push({
                    ...investTx,
                    amount: numAmount,
                    date,
                    description: `Equity Move in to ${state.projects.find(p=>p.id===targetProjectId)?.name}`,
                    projectId: targetProjectId,
                    fromAccountId: investorId // Invest comes from Investor to Clearing
                });
            }
        } else if (mode === 'BATCH_DIST') {
            const allInBatch = [mainTx, ...siblings];
            const expenseTx = allInBatch.find(t => t.type === TransactionType.EXPENSE);
            const transferTx = allInBatch.find(t => t.type === TransactionType.TRANSFER);
            
            if (expenseTx && transferTx) {
                txsToUpdate.push({
                    ...expenseTx,
                    amount: numAmount,
                    date,
                    projectId,
                    description
                });
                txsToUpdate.push({
                    ...transferTx,
                    amount: numAmount,
                    date,
                    projectId,
                    description,
                    toAccountId: investorId, // Transfer sends to Investor
                    accountId: investorId
                });
            }
        }

        // Dispatch all updates
        txsToUpdate.forEach(tx => dispatch({ type: 'UPDATE_TRANSACTION', payload: tx }));
        showToast("Transaction updated successfully", "success");
        setEditingBatch(null);
    };

    const handleDeleteTransaction = async () => {
        if (!editingBatch) return;
        const confirm = await showConfirm("Are you sure you want to delete this transaction? This will remove all linked entries.", { title: "Delete Transaction", confirmLabel: "Delete" });
        if (confirm) {
            const idsToDelete = [editingBatch.mainTx.id, ...editingBatch.siblings.map(s => s.id)];
            idsToDelete.forEach(id => dispatch({ type: 'DELETE_TRANSACTION', payload: id }));
            showToast("Transaction deleted", "info");
            setEditingBatch(null);
        }
    };

    const handleOpenInvestModal = () => {
        setFormAmount('');
        setFormDescription('');
        setFormDate(new Date().toISOString().split('T')[0]);
        
        // Clear investor selection when opening from project context
        // Only set investor if explicitly selected from staff/investor tree
        if (selectedTreeType === 'project') {
            setFormProjectId(selectedTreeId || '');
            setFormInvestorId(''); // Clear investor selection for project context
        } else if (selectedTreeType === 'staff') {
             setFormInvestorId(selectedTreeId || '');
             if (selectedParentId && selectedParentId !== 'root-investors') setFormProjectId(selectedParentId);
        } else {
            // No specific selection - clear both
            setFormProjectId('');
            setFormInvestorId('');
        }
        
        const cash = bankAccounts.find(a => a.name === 'Cash');
        setFormBankAccountId(cash?.id || bankAccounts[0]?.id || '');

        setIsActionModalOpen(true);
    };

    const handleSubmit = () => {
        if (!formInvestorId || !formProjectId || !formBankAccountId || !formAmount) {
            showAlert("Please fill in all fields.");
            return;
        }
        
        const amount = parseFloat(formAmount);
        if (isNaN(amount) || amount <= 0) {
            showAlert("Invalid amount.");
            return;
        }

        // Investment: Money flows FROM investor (equity) TO bank account
        // This increases bank account (money received) and increases equity balance (investment recorded)
        const fromId = formInvestorId;
        const toId = formBankAccountId;
        const desc = `Investment in ${state.projects.find(p=>p.id===formProjectId)?.name}`;

        const tx: Transaction = {
            id: `eq-tx-${Date.now()}`,
            type: TransactionType.TRANSFER,
            amount,
            date: formDate,
            description: formDescription || desc,
            fromAccountId: fromId,
            toAccountId: toId,
            accountId: fromId, 
            projectId: formProjectId
        };

        dispatch({ type: 'ADD_TRANSACTION', payload: tx });
        showToast("Transaction recorded successfully.", "success");
        setIsActionModalOpen(false);
    };
    
    const handlePrint = () => {
        const { printSettings } = state;
        
        // Generate table rows HTML
        let tableRows = '';
        if (ledgerData.length === 0) {
            tableRows = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #64748b;">No transactions found</td></tr>';
        } else {
            tableRows = ledgerData.map(tx => {
                const amountSign = tx.isDeposit ? '+' : '-';
                const amountColor = tx.isDeposit ? '#10b981' : '#ef4444';
                const balanceColor = tx.balance >= 0 ? '#10b981' : '#ef4444';
                const amountStr = `${amountSign}${CURRENCY} ${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const balanceStr = `${tx.balance >= 0 ? '' : '-'}${CURRENCY} ${Math.abs(tx.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                
                return `
                    <tr>
                        <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb;">${formatDate(tx.date)}</td>
                        <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb;">${tx.paymentType}</td>
                        <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb;">${tx.description || ''}</td>
                        <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; font-size: 0.75rem; color: #6b7280;">${tx.info || ''}</td>
                        <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: ${amountColor}; font-family: monospace;">${amountStr}</td>
                        <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: ${balanceColor}; font-family: monospace;">${balanceStr}</td>
                    </tr>
                `;
            }).join('');
        }

        // Generate table HTML
        const tableHtml = `
            <div style="margin-bottom: 2rem;">
                <h2 style="font-size: 1.5rem; font-weight: 700; color: #1e293b; margin-bottom: 1.5rem; text-align: center;">Equity Ledger</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                    <thead>
                        <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                            <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Date</th>
                            <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Type</th>
                            <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Description</th>
                            <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Info</th>
                            <th style="padding: 0.75rem; text-align: right; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Amount</th>
                            <th style="padding: 0.75rem; text-align: right; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em;">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;

        // Wrap with print template
        const html = getPrintTemplateWrapper(tableHtml, printSettings);
        
        // Print using template
        printFromTemplate(html, printSettings);
    };

    const handleExport = () => {
        const data = ledgerData.map(r => ({
            Date: formatDate(r.date),
            'Payment Type': r.paymentType,
            Description: r.description,
            Info: r.info,
            Amount: r.amount,
            Balance: r.balance
        }));
        exportJsonToExcel(data, 'investor-ledger.xlsx', 'Ledger');
    };

    // Cycle Manager Logic
    const projectFinancials = useMemo(() => {
        if (!distProjectId) return { income: 0, expense: 0, netOperating: 0, distributed: 0, available: 0, investedCapital: 0 };
         let income = 0;
        let operatingExpense = 0;
        let distributed = 0;
        let investedCapital = 0;
        const equityCategoryNames = ['Owner Equity', 'Owner Withdrawn', 'Profit Share', 'Dividend'];
        state.transactions.forEach(tx => {
            if (tx.projectId !== distProjectId) return;
            const category = state.categories.find(c => c.id === tx.categoryId);
            const isEquityCategory = category && equityCategoryNames.includes(category.name);
            if (tx.type === TransactionType.INCOME) {
                if (!isEquityCategory) income += tx.amount;
            } else if (tx.type === TransactionType.EXPENSE) {
                if (isEquityCategory) distributed += tx.amount;
                else operatingExpense += tx.amount;
            }
             if (tx.type === TransactionType.TRANSFER) {
                const toEquity = equityAccounts.find(a => a.id === tx.toAccountId);
                const fromEquity = equityAccounts.find(a => a.id === tx.fromAccountId);
                if (fromEquity && !toEquity) investedCapital += tx.amount;
                else if (toEquity && !fromEquity) investedCapital -= tx.amount;
            }
        });
        const netOperating = income - operatingExpense;
        const available = netOperating - distributed;
        return { income, expense: operatingExpense, netOperating, distributed, available, investedCapital };
    }, [distProjectId, state.transactions, equityAccounts, state.accounts, state.categories]);

    const handleCalculateDistShares = () => {
         if (!distProjectId) return;
        const investorCapital: Record<string, number> = {};
        state.transactions.forEach(tx => {
            if (tx.projectId !== distProjectId || tx.type !== TransactionType.TRANSFER) return;
            const toEquity = equityAccounts.find(a => a.id === tx.toAccountId);
            const fromEquity = equityAccounts.find(a => a.id === tx.fromAccountId);
            if (fromEquity && !toEquity) investorCapital[fromEquity.id] = (investorCapital[fromEquity.id] || 0) + tx.amount;
            else if (toEquity && !fromEquity) investorCapital[toEquity.id] = (investorCapital[toEquity.id] || 0) - tx.amount;
        });
        const totalCapital = Object.values(investorCapital).reduce((sum, val) => sum + val, 0);
        const profitToDistribute = distProfit ? parseFloat(distProfit) : projectFinancials.available;
        if (totalCapital <= 0) { showAlert("No Active equity capital found for this project."); return; }
        const calculatedDistributions: InvestorDistribution[] = Object.entries(investorCapital)
            .filter(([_, amount]) => amount > 0)
            .map(([investorId, amount]) => {
                const acc = state.accounts.find(a => a.id === investorId);
                const share = amount / totalCapital;
                const profit = profitToDistribute * share;
                // newEquityBalance shows the new project-specific equity after distribution (principal + new profit)
                const newEquityBalance = amount + profit;
                return { investorId, investorName: acc?.name || 'Unknown', principal: amount, sharePercentage: share, profitShare: profit, newEquityBalance };
            });
        setDistributions(calculatedDistributions);
        setDistProfit(profitToDistribute.toString());
        setDistStep(2);
    };

    const handleDistCommit = async () => {
        const confirm = await showConfirm(`Distribute ${CURRENCY} ${parseFloat(distProfit).toLocaleString()} profit?`, { title: "Confirm" });
        if (!confirm) return;
        let clearingAcc = state.accounts.find(a => a.name === 'Internal Clearing');
        if (!clearingAcc) {
            clearingAcc = { id: `sys-acc-clearing-${Date.now()}`, name: 'Internal Clearing', type: AccountType.BANK, balance: 0, description: 'System', isPermanent: true };
            dispatch({ type: 'ADD_ACCOUNT', payload: clearingAcc });
        }
        const timestamp = Date.now();
        const batchId = `dist-cycle-${timestamp}`;
        const transactions: Transaction[] = [];
        let profitExpCat = state.categories.find(c => c.name === 'Owner Equity' && c.type === TransactionType.EXPENSE);
        if (!profitExpCat) profitExpCat = state.categories.find(c=>c.type === TransactionType.EXPENSE)!;
        distributions.forEach(dist => {
            transactions.push({ id: `prof-exp-${timestamp}-${dist.investorId}`, type: TransactionType.EXPENSE, amount: dist.profitShare, date: new Date().toISOString().split('T')[0], description: `Profit Distribution: ${cycleName}`, accountId: clearingAcc!.id, categoryId: profitExpCat?.id, projectId: distProjectId, batchId } as any);
            transactions.push({ id: `prof-inc-${timestamp}-${dist.investorId}`, type: TransactionType.TRANSFER, amount: dist.profitShare, date: new Date().toISOString().split('T')[0], description: `Profit Share: ${cycleName}`, accountId: dist.investorId, fromAccountId: clearingAcc!.id, toAccountId: dist.investorId, projectId: distProjectId, batchId } as any);
        });
        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
        showToast("Profit Distributed.", "success");
        setDistStep(1); setDistProfit(''); setDistributions([]);
    };

    // Equity Transfer Logic
    const handleCalculateTransferData = () => {
        if (!sourceProjectId) return;
        const balances: Record<string, number> = {};
        state.transactions.forEach(tx => {
            if (tx.projectId !== sourceProjectId) return;
            if (tx.type === TransactionType.TRANSFER) {
                const fromEquity = equityAccounts.find(a => a.id === tx.fromAccountId);
                const toEquity = equityAccounts.find(a => a.id === tx.toAccountId);
                const fromAccount = state.accounts.find(a => a.id === tx.fromAccountId);
                const isFromClearing = fromAccount?.name === 'Internal Clearing';
                const isDivestment = tx.description && tx.description.includes('Equity Move out');
                
                if (fromEquity && !toEquity) {
                    balances[fromEquity.id] = (balances[fromEquity.id] || 0) + tx.amount;
                } else if (toEquity && !fromEquity) { 
                    if (isFromClearing && !isDivestment) {
                         balances[toEquity.id] = (balances[toEquity.id] || 0) + tx.amount;
                    } else {
                         balances[toEquity.id] = (balances[toEquity.id] || 0) - tx.amount;
                    }
                }
            }
        });
        const rows: TransferRow[] = Object.entries(balances)
            .filter(([_, bal]) => bal > 0)
            .map(([id, bal]) => ({
                investorId: id,
                investorName: state.accounts.find(a => a.id === id)?.name || 'Unknown',
                currentEquity: bal,
                transferAmount: bal.toString(),
                isSelected: true
            }));
        if (rows.length === 0) { showAlert("No positive equity found to transfer."); return; }
        setTransferRows(rows);
        setTransferStep(2);
        setTransferType('PROJECT');
    };

    const handleTransferCommit = async () => {
        const selectedTransfers = transferRows.filter(r => r.isSelected && parseFloat(r.transferAmount) > 0);
        if (selectedTransfers.length === 0) return;
        
        const confirm = await showConfirm(`Transfer equity for ${selectedTransfers.length} investors?`);
        if (!confirm) return;

        const timestamp = Date.now();
        const transactions: Transaction[] = [];
        let clearingAcc = state.accounts.find(a => a.name === 'Internal Clearing');
        if (transferType === 'PROJECT' && !clearingAcc) {
            clearingAcc = { id: `sys-acc-clearing-${Date.now()}`, name: 'Internal Clearing', type: AccountType.BANK, balance: 0, description: 'System', isPermanent: true };
            dispatch({ type: 'ADD_ACCOUNT', payload: clearingAcc });
        }

        selectedTransfers.forEach(row => {
            const amount = parseFloat(row.transferAmount);
            if (transferType === 'PROJECT') {
                transactions.push({ id: `divest-${timestamp}-${row.investorId}`, type: TransactionType.TRANSFER, amount: amount, date: new Date().toISOString().split('T')[0], description: `Equity Move out`, accountId: clearingAcc!.id, fromAccountId: clearingAcc!.id, toAccountId: row.investorId, projectId: sourceProjectId, batchId: `eq-move-${timestamp}` } as any);
                transactions.push({ id: `invest-${timestamp}-${row.investorId}`, type: TransactionType.TRANSFER, amount: amount, date: new Date().toISOString().split('T')[0], description: `Equity Move in`, accountId: row.investorId, fromAccountId: row.investorId, toAccountId: clearingAcc!.id, projectId: destProjectId, batchId: `eq-move-${timestamp}` } as any);
            } else {
                transactions.push({ id: `payout-${timestamp}-${row.investorId}`, type: TransactionType.TRANSFER, amount: amount, date: new Date().toISOString().split('T')[0], description: `Capital Payout`, accountId: payoutAccountId, fromAccountId: payoutAccountId, toAccountId: row.investorId, projectId: sourceProjectId, batchId: `eq-payout-${timestamp}` } as any);
            }
        });

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
        showToast("Equity transferred.", "success");
        setTransferStep(1); setTransferRows([]);
    };

    return (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 h-full flex flex-col">
            <div className="mb-4">
                <Tabs tabs={['Ledger', 'Profit Distribution', 'Equity Transfer', 'Investor Distribution']} activeTab={activeTab} onTabClick={setActiveTab} />
            </div>

            {activeTab === 'Ledger' && (
                <>
                    <style>{STANDARD_PRINT_STYLES}</style>
                    {/* Printable area for print mode - hidden in screen, visible in print */}
                    <div className="hidden print:block printable-area" id="printable-area">
                        <ReportHeader />
                        <div className="mb-4">
                            <h2 className="text-xl font-bold text-slate-900 text-center">Equity Ledger</h2>
                            {selectedTreeType === 'staff' && selectedTreeId && (
                                <p className="text-center text-sm text-slate-600 mt-2">
                                    Investor: {state.accounts.find(a => a.id === selectedTreeId)?.name || 'N/A'}
                                </p>
                            )}
                            {selectedTreeType === 'project' && selectedTreeId && (
                                <p className="text-center text-sm text-slate-600 mt-2">
                                    Project: {state.projects.find(p => p.id === selectedTreeId)?.name || 'N/A'}
                                </p>
                            )}
                        </div>
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Description</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Info</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Amount</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {ledgerData.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                            No transactions found
                                        </td>
                                    </tr>
                                ) : (
                                    ledgerData.map(tx => (
                                        <tr key={tx.id}>
                                            <td className="px-4 py-2 text-slate-700">{formatDate(tx.date)}</td>
                                            <td className="px-4 py-2">
                                                <span className={`px-3 py-1 font-medium rounded-full inline-block ${tx.paymentTypeColor}`}>
                                                    {tx.paymentType}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-slate-600 whitespace-normal">{tx.description}</td>
                                            <td className="px-4 py-2 text-xs text-slate-500 whitespace-normal">{tx.info}</td>
                                            <td className={`px-4 py-2 text-right font-bold ${tx.isDeposit ? 'text-emerald-600' : 'text-rose-600'}`}>{tx.isDeposit ? '+' : '-'}{CURRENCY} {Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td className={`px-4 py-2 text-right font-mono ${tx.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{tx.balance >= 0 ? '' : '-'}{CURRENCY} {Math.abs(tx.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        <ReportFooter />
                    </div>
                    
                    {/* Screen view - hidden in print */}
                    <div className="flex-grow flex h-full gap-4 overflow-hidden no-print">
                        <div className="hidden md:flex flex-col h-full flex-shrink-0 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" style={{ width: sidebarWidth }}>
                            <div className="p-3 border-b bg-slate-50 font-bold text-slate-700 flex justify-between">
                                <span>Projects & Investors</span>
                                {selectedTreeId && <button onClick={() => { setSelectedTreeId(null); setSelectedTreeType(null); setSelectedParentId(null); }} className="text-xs text-accent hover:underline">Clear</button>}
                            </div>
                            <div className="flex-grow overflow-y-auto p-2">
                                <TreeView treeData={treeData} selectedId={selectedTreeId} onSelect={(id, type, parentId) => { setSelectedTreeId(id); setSelectedTreeType(type as any); setSelectedParentId(parentId || null); }} />
                            </div>
                        </div>
                        <div className="hidden md:block h-full">
                            <ResizeHandle onMouseDown={startResizing} />
                        </div>
                        <div className="flex-grow flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div><h2 className="text-lg font-bold text-slate-800">Equity Overview</h2></div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="secondary" onClick={handleExport}>{ICONS.export} Export</Button>
                                    <Button size="sm" variant="secondary" onClick={handlePrint}>{ICONS.print} Print</Button>
                                    <Button size="sm" onClick={handleOpenInvestModal} className="bg-emerald-600 hover:bg-emerald-700">{ICONS.plus} Invest</Button>
                                </div>
                            </div>
                            <div className="flex-grow overflow-y-auto">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Description</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Info</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-600">Amount</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-600">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {ledgerData.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                                    No transactions found
                                                </td>
                                            </tr>
                                        ) : (
                                            ledgerData.map(tx => (
                                                <tr 
                                                    key={tx.id} 
                                                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                                                    onClick={() => handleRowClick(tx)}
                                                >
                                                    <td className="px-4 py-2 text-slate-700">{formatDate(tx.date)}</td>
                                                    <td className="px-4 py-2">
                                                        <span 
                                                            className={`px-3 py-1 font-medium rounded-full inline-block ${tx.paymentTypeColor}`}
                                                            style={getEntityColorStyle(tx.projectId, undefined, state)}
                                                        >
                                                            {tx.paymentType}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 max-w-xs truncate text-slate-600">{tx.description}</td>
                                                    <td className="px-4 py-2 text-xs text-slate-500">{tx.info}</td>
                                                    <td className={`px-4 py-2 text-right font-bold ${tx.isDeposit ? 'text-emerald-600' : 'text-rose-600'}`}>{tx.isDeposit ? '+' : '-'}{CURRENCY} {Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td className={`px-4 py-2 text-right font-mono ${tx.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{tx.balance >= 0 ? '' : '-'}{CURRENCY} {Math.abs(tx.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Cycle Manager Tab */}
             {activeTab === 'Profit Distribution' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6 flex-grow overflow-y-auto">
                    {distStep === 1 && (
                         <div className="space-y-6 max-w-2xl mx-auto">
                            <h3 className="text-xl font-bold">Profit Distribution</h3>
                            <ComboBox label="Select Project" items={state.projects} selectedId={distProjectId} onSelect={(item) => setDistProjectId(item?.id || '')} placeholder="Choose a project..." allowAddNew={false} />
                            {distProjectId && (
                                <div className="p-4 bg-slate-50 rounded border border-slate-200 grid grid-cols-2 gap-4">
                                     <div>
                                        <p className="text-xs uppercase font-bold text-slate-500">Available to Distribute</p>
                                        <p className="text-xl font-bold text-emerald-600">{CURRENCY} {projectFinancials.available.toLocaleString()}</p>
                                     </div>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Cycle Name" value={cycleName} onChange={e => setCycleName(e.target.value)} />
                                <Input label="Amount to Distribute" type="number" value={distProfit} onChange={e => setDistProfit(e.target.value)} />
                            </div>
                            <Button onClick={handleCalculateDistShares} disabled={!distProjectId || !distProfit}>Next</Button>
                        </div>
                    )}
                    {distStep === 2 && (
                         <div className="space-y-6 max-w-4xl mx-auto">
                            <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold">Confirm Distribution</h3>
                                <Button variant="secondary" onClick={() => { setDistStep(1); setDistributions([]); }}>Back</Button>
                            </div>
                            
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <p className="text-sm text-slate-600 mb-4">
                                    Review how the <strong className="text-slate-900">{CURRENCY} {parseFloat(distProfit || '0').toLocaleString()}</strong> profit will be allocated based on investor equity share.
                                </p>
                                
                                <div className="overflow-x-auto border rounded-lg bg-white">
                                    <table className="min-w-full divide-y divide-slate-200">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Investor</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Principal Investment</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Share %</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Profit Share</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">New Equity Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {distributions.map((dist, idx) => (
                                                <tr key={dist.investorId} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                                                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{dist.investorName}</td>
                                                    <td className="px-4 py-3 text-sm text-right font-mono text-slate-600">{CURRENCY} {dist.principal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{(dist.sharePercentage * 100).toFixed(2)}%</td>
                                                    <td className="px-4 py-3 text-sm text-right font-bold text-emerald-600 font-mono">{CURRENCY} {dist.profitShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-3 text-sm text-right font-bold text-indigo-600 font-mono">{CURRENCY} {dist.newEquityBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                                            <tr>
                                                <td className="px-4 py-3 text-sm font-bold text-slate-900">Total</td>
                                                <td className="px-4 py-3 text-sm text-right font-bold font-mono text-slate-900">
                                                    {CURRENCY} {distributions.reduce((sum, d) => sum + d.principal, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">100.00%</td>
                                                <td className="px-4 py-3 text-sm text-right font-bold text-emerald-700 font-mono">
                                                    {CURRENCY} {distributions.reduce((sum, d) => sum + d.profitShare, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-right font-bold text-slate-600 font-mono">
                                                    {CURRENCY} {distributions.reduce((sum, d) => sum + d.newEquityBalance, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                                <Button variant="secondary" onClick={() => { setDistStep(1); setDistributions([]); }}>Cancel</Button>
                                <Button onClick={handleDistCommit} className="bg-emerald-600 hover:bg-emerald-700">Confirm & Distribute</Button>
                            </div>
                         </div>
                    )}
                </div>
            )}
             {activeTab === 'Equity Transfer' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6 flex-grow overflow-y-auto">
                    {transferStep === 1 && (
                        <div className="space-y-6 max-w-2xl">
                             <ComboBox label="Source Project" items={state.projects} selectedId={sourceProjectId} onSelect={(item) => setSourceProjectId(item?.id || '')} placeholder="Select Source Project" allowAddNew={false} />
                             <Button onClick={handleCalculateTransferData} disabled={!sourceProjectId}>Next</Button>
                        </div>
                    )}
                    {transferStep === 2 && (
                         <div className="flex flex-col h-full overflow-hidden space-y-4 max-w-5xl mx-auto w-full">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold">Equity Transfer</h3>
                                <Button variant="secondary" onClick={() => { setTransferStep(1); setTransferRows([]); }}>Back</Button>
                            </div>
                            
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <div className="flex gap-4 mb-4">
                                    <label className="flex items-center cursor-pointer">
                                        <input type="radio" name="transferType" checked={transferType === 'PROJECT'} onChange={() => setTransferType('PROJECT')} className="text-indigo-600" />
                                        <span className="ml-2 text-sm font-medium text-slate-700">Transfer to Another Project</span>
                                    </label>
                                    <label className="flex items-center cursor-pointer">
                                        <input type="radio" name="transferType" checked={transferType === 'PAYOUT'} onChange={() => setTransferType('PAYOUT')} className="text-emerald-600" />
                                        <span className="ml-2 text-sm font-medium text-slate-700">Pay Out to Investor</span>
                                    </label>
                                </div>
                                {transferType === 'PROJECT' ? (
                                    <ComboBox label="Destination Project" items={state.projects.filter(p => p.id !== sourceProjectId)} selectedId={destProjectId} onSelect={(item) => setDestProjectId(item?.id || '')} placeholder="Select Target Project" allowAddNew={false} />
                                ) : (
                                    <ComboBox label="Pay From Account" items={bankAccounts} selectedId={payoutAccountId} onSelect={(item) => setPayoutAccountId(item?.id || '')} placeholder="Select Bank/Cash Account" allowAddNew={false} />
                                )}
                            </div>

                            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                <div className="p-3 bg-slate-50 border-b flex justify-between items-center">
                                    <h4 className="font-semibold text-slate-700">Select Investors to Transfer</h4>
                                    <button
                                        onClick={() => {
                                            const allSelected = transferRows.every(r => r.isSelected);
                                            setTransferRows(transferRows.map(r => ({ ...r, isSelected: !allSelected })));
                                        }}
                                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                    >
                                        {transferRows.every(r => r.isSelected) ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-200">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left w-12">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={transferRows.length > 0 && transferRows.every(r => r.isSelected)}
                                                        onChange={(e) => setTransferRows(transferRows.map(r => ({ ...r, isSelected: e.target.checked })))}
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Investor</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Current Equity</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Transfer Amount</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Remaining Equity</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {transferRows.map((row, idx) => {
                                                const transferAmt = parseFloat(row.transferAmount) || 0;
                                                const remaining = row.currentEquity - transferAmt;
                                                return (
                                                    <tr 
                                                        key={row.investorId} 
                                                        className={`hover:bg-slate-50 transition-colors ${row.isSelected ? 'bg-indigo-50/50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={row.isSelected} 
                                                                onChange={() => {
                                                                    const newRows = [...transferRows];
                                                                    newRows[idx].isSelected = !newRows[idx].isSelected;
                                                                    setTransferRows(newRows);
                                                                }}
                                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 text-sm font-medium text-slate-700">{row.investorName}</td>
                                                        <td className="px-4 py-3 text-sm text-right font-mono text-slate-600">{CURRENCY} {row.currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                        <td className="px-4 py-3 text-sm text-right">
                                                            <input 
                                                                type="number" 
                                                                step="0.01"
                                                                min="0"
                                                                max={row.currentEquity}
                                                                className={`w-32 text-right border rounded px-2 py-1 font-mono text-sm ${row.isSelected ? 'border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                                                value={row.transferAmount} 
                                                                onChange={(e) => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    const clamped = Math.min(Math.max(0, val), row.currentEquity);
                                                                    const newRows = [...transferRows];
                                                                    newRows[idx].transferAmount = clamped.toString();
                                                                    setTransferRows(newRows);
                                                                }}
                                                                disabled={!row.isSelected}
                                                            />
                                                        </td>
                                                        <td className={`px-4 py-3 text-sm text-right font-mono font-medium ${remaining >= 0 ? 'text-slate-700' : 'text-rose-600'}`}>
                                                            {CURRENCY} {remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                                            <tr>
                                                <td colSpan={2} className="px-4 py-3 text-sm font-bold text-slate-900">Total Selected</td>
                                                <td className="px-4 py-3 text-sm text-right font-bold font-mono text-slate-600">
                                                    {CURRENCY} {transferRows.filter(r => r.isSelected).reduce((sum, r) => sum + r.currentEquity, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-right font-bold font-mono text-emerald-700">
                                                    {CURRENCY} {transferRows.filter(r => r.isSelected).reduce((sum, r) => sum + (parseFloat(r.transferAmount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-right font-bold font-mono text-slate-700">
                                                    {CURRENCY} {transferRows.filter(r => r.isSelected).reduce((sum, r) => {
                                                        const transferAmt = parseFloat(r.transferAmount) || 0;
                                                        return sum + (r.currentEquity - transferAmt);
                                                    }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            {transferType === 'PROJECT' && !destProjectId && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                                    Please select a destination project before confirming the transfer.
                                </div>
                            )}
                            {transferType === 'PAYOUT' && !payoutAccountId && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                                    Please select a payout account before confirming the transfer.
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                                <Button variant="secondary" onClick={() => { setTransferStep(1); setTransferRows([]); }}>Cancel</Button>
                                <Button 
                                    onClick={handleTransferCommit} 
                                    disabled={(transferType === 'PROJECT' && !destProjectId) || (transferType === 'PAYOUT' && !payoutAccountId) || transferRows.filter(r => r.isSelected && parseFloat(r.transferAmount) > 0).length === 0}
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                    Execute Transfer
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            {activeTab === 'Investor Distribution' && (
                <div className="flex-grow overflow-hidden">
                    <ProjectInvestorReport />
                </div>
            )}

            <Modal isOpen={isActionModalOpen} onClose={() => setIsActionModalOpen(false)} title="Record New Investment">
                <div className="space-y-4">
                    <ComboBox label="Investor" items={equityAccounts} selectedId={formInvestorId} onSelect={(i) => setFormInvestorId(i?.id || '')} required />
                    <ComboBox label="Project" items={state.projects} selectedId={formProjectId} onSelect={(i) => setFormProjectId(i?.id || '')} required allowAddNew={false} />
                    <ComboBox label="Bank/Cash Account" items={bankAccounts} selectedId={formBankAccountId} onSelect={(i) => setFormBankAccountId(i?.id || '')} required allowAddNew={false} />
                    <Input label="Amount" type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} required />
                    <Input label="Date" type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required />
                    <Input label="Description" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Optional note" />
                    
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="secondary" onClick={() => setIsActionModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit}>Confirm</Button>
                    </div>
                </div>
            </Modal>
            
            <Modal isOpen={!!editingBatch} onClose={() => setEditingBatch(null)} title="Edit Equity Transaction">
                {editingBatch && (
                     <div className="space-y-4">
                        <div className="p-3 bg-amber-50 rounded border border-amber-200 text-sm mb-2 text-amber-800">
                             Editing this transaction will update any linked entries to maintain balance.
                        </div>
                        {editingBatch.mode === 'BATCH_MOVE' && (
                             <>
                                <ComboBox label="From Project (Divest)" items={state.projects} selectedId={editingBatch.projectId} onSelect={(i) => setEditingBatch({...editingBatch, projectId: i?.id || ''})} required allowAddNew={false} />
                                <ComboBox label="To Project (Invest)" items={state.projects} selectedId={editingBatch.targetProjectId} onSelect={(i) => setEditingBatch({...editingBatch, targetProjectId: i?.id || ''})} required allowAddNew={false} />
                                <ComboBox label="Investor" items={equityAccounts} selectedId={editingBatch.investorId} onSelect={(i) => setEditingBatch({...editingBatch, investorId: i?.id || ''})} required />
                             </>
                        )}
                        {editingBatch.mode === 'BATCH_DIST' && (
                             <>
                                <ComboBox label="Project" items={state.projects} selectedId={editingBatch.projectId} onSelect={(i) => setEditingBatch({...editingBatch, projectId: i?.id || ''})} required allowAddNew={false} />
                                <ComboBox label="Investor" items={equityAccounts} selectedId={editingBatch.investorId} onSelect={(i) => setEditingBatch({...editingBatch, investorId: i?.id || ''})} required />
                             </>
                        )}
                        {editingBatch.mode === 'SIMPLE' && (
                            <>
                                <ComboBox label="Project" items={state.projects} selectedId={editingBatch.projectId} onSelect={(i) => setEditingBatch({...editingBatch, projectId: i?.id || ''})} required allowAddNew={false} />
                                <ComboBox label="Investor" items={equityAccounts} selectedId={editingBatch.investorId} onSelect={(i) => setEditingBatch({...editingBatch, investorId: i?.id || ''})} required />
                                <ComboBox label="Bank Account" items={bankAccounts} selectedId={editingBatch.bankAccountId} onSelect={(i) => setEditingBatch({...editingBatch, bankAccountId: i?.id || ''})} required allowAddNew={false} />
                            </>
                        )}

                        <Input label="Amount" type="number" value={editingBatch.amount} onChange={e => setEditingBatch({...editingBatch, amount: e.target.value})} required />
                        <Input label="Date" type="date" value={editingBatch.date} onChange={e => setEditingBatch({...editingBatch, date: e.target.value})} required />
                        <Input label="Description" value={editingBatch.description} onChange={e => setEditingBatch({...editingBatch, description: e.target.value})} />
                        
                        <div className="flex justify-between gap-2 pt-4">
                            <Button variant="danger" onClick={handleDeleteTransaction}>Delete</Button>
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => setEditingBatch(null)}>Cancel</Button>
                                <Button onClick={handleSaveEdit}>Update</Button>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ProjectEquityManagement;
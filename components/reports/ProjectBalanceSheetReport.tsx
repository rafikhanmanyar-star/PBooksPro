
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, InvoiceType, AccountType, LoanSubtype } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { resolveProjectIdForTransaction } from './reportUtils';
import ComboBox from '../ui/ComboBox';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import { findProjectAssetCategory } from '../../constants/projectAssetSystemCategories';
import { resolveSystemAccountId } from '../../services/systemEntityIds';

interface AccountBalance {
    id: string;
    name: string;
    balance: number;
    type: AccountType;
}

interface BalanceSheetData {
    assets: {
        currentAccounts: AccountBalance[];
        longTermAccounts: AccountBalance[];
        accountsReceivable: number;
        total: number;
    };
    liabilities: {
        accounts: AccountBalance[];
        accountsPayable: number;
        outstandingLoans: number;
        securityDepositsHeld: number;
        ownerFundsHeld: number;
        total: number;
    };
    equity: {
        accounts: AccountBalance[];
        ownerContribution: number;
        retainedEarnings: number;
        /** Matches long-term "Project Received Assets" held in kind (excluded from P&L until sale). */
        receivedAssetsEquityOffset: number;
        total: number;
    };
    marketInventory: number; // Memo item
    isBalanced: boolean;
    discrepancy: number;
}

const ProjectBalanceSheetReport: React.FC = () => {
    const { state } = useAppContext();
    const { print: triggerPrint } = usePrintContext();
    const [dateRange, setDateRange] = useState<ReportDateRange>('all');
    const [asOfDate, setAsOfDate] = useState(toLocalDateString(new Date()));
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const handleRangeChange = (type: ReportDateRange) => {
        setDateRange(type);
        const now = new Date();
        
        if (type === 'all') {
            setAsOfDate(toLocalDateString(now));
        } else if (type === 'thisMonth') {
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setAsOfDate(toLocalDateString(endOfMonth));
        } else if (type === 'lastMonth') {
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            setAsOfDate(toLocalDateString(endOfLastMonth));
        }
    };

    const handleDateChange = (date: string) => {
        setAsOfDate(date);
        if (dateRange !== 'custom') {
            setDateRange('custom');
        }
    };

    const reportData = useMemo<BalanceSheetData>(() => {
        const dateLimit = new Date(asOfDate);
        dateLimit.setHours(23, 59, 59, 999);

        // 1. Account Balances (Cash Basis Calculation from Ledger)
        const accountBalances: Record<string, number> = {};
        (state.accounts || []).forEach(acc => accountBalances[acc.id] = 0);

        // Track accounts with transactions for the selected project
        const accountsWithTransactions = new Set<string>();

        // P&L Components for Retained Earnings
        let companyRevenue = 0;
        let companyExpense = 0;
        
        // Liability Components (Virtual Balances based on Categories)
        let securityDepositsHeld = 0;
        let ownerFundsHeld = 0;
        let outstandingLoans = 0;
        
        // Equity Components
        let ownerContribution = 0;

        // Category Mapping
        const categories = state.categories || [];
        const catMap = new Map(categories.map(c => [c.id, c.name]));
        
        // Helper sets for classification
        const equityCats = new Set(categories.filter(c => c.name === 'Owner Equity').map(c => c.id));
        const drawingsCats = new Set(categories.filter(c => c.name === 'Owner Withdrawn').map(c => c.id));
        
        // Liability Categories (Pass-through funds)
        const secDepIn = categories.find(c => c.name === 'Security Deposit')?.id;
        const rentalIn = categories.find(c => c.name === 'Rental Income')?.id;
        // Asset received in kind: not revenue at receipt; revenue recognized at sale (Asset Sale Proceeds)
        const assetReceivedCat = findProjectAssetCategory(categories, 'ASSET_BALANCE_SHEET_ONLY')?.id;

        const secDepOut = new Set(categories.filter(c => c.name === 'Security Deposit Refund' || c.name === 'Owner Security Payout').map(c => c.id));
        const rentalOut = new Set(categories.filter(c => c.name === 'Owner Payout').map(c => c.id));

        (state.transactions || []).forEach(tx => {
            const txDate = new Date(tx.date);
            if (txDate > dateLimit) return;
            
            // Resolve projectId from linked entities if missing (shared report helper)
            const projectId = resolveProjectIdForTransaction(tx, state);
            
            // Strictly filter by selected project
            if (selectedProjectId !== 'all') {
                if (projectId !== selectedProjectId) return;
                if (!projectId) return; // Exclude transactions without projectId when specific project selected
            } 

            // Track all accounts involved in transactions for the selected project
            // For 'all' projects, track all accounts with any transactions
            // For specific project, only track accounts with transactions for that project
            if (tx.type === TransactionType.INCOME) {
                if (tx.accountId) {
                    accountsWithTransactions.add(tx.accountId);
                }
            } else if (tx.type === TransactionType.EXPENSE) {
                if (tx.accountId) {
                    accountsWithTransactions.add(tx.accountId);
                }
            } else if (tx.type === TransactionType.TRANSFER) {
                if (tx.fromAccountId) {
                    accountsWithTransactions.add(tx.fromAccountId);
                }
                if (tx.toAccountId) {
                    accountsWithTransactions.add(tx.toAccountId);
                }
            } else if (tx.type === TransactionType.LOAN) {
                if (tx.accountId) {
                    accountsWithTransactions.add(tx.accountId);
                }
            }

            // --- 1. Ledger Updates (Bank Balances) ---
            const applyBalance = (accId: string | undefined, amount: number, factor: number) => {
                if (accId && accountBalances[accId] !== undefined) {
                    accountBalances[accId] += (amount * factor);
                }
            };

            if (tx.type === TransactionType.INCOME) applyBalance(tx.accountId, tx.amount, 1);
            else if (tx.type === TransactionType.EXPENSE) applyBalance(tx.accountId, tx.amount, -1);
            else if (tx.type === TransactionType.TRANSFER) {
                applyBalance(tx.fromAccountId, tx.amount, -1);
                applyBalance(tx.toAccountId, tx.amount, 1);
            } else if (tx.type === TransactionType.LOAN) {
                const isInflow = tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT;
                applyBalance(tx.accountId, tx.amount, isInflow ? 1 : -1);
            }

            // --- 2. Financial Categorization (P&L vs Liability vs Equity) ---
            
            // LOANS
            if (tx.type === TransactionType.LOAN) {
                if (tx.subtype === LoanSubtype.RECEIVE) outstandingLoans += tx.amount;
                else if (tx.subtype === LoanSubtype.REPAY || tx.subtype === LoanSubtype.COLLECT) outstandingLoans -= tx.amount;
                return; // Skip further processing
            }

            // INCOME
            if (tx.type === TransactionType.INCOME) {
                if (tx.categoryId && equityCats.has(tx.categoryId)) {
                    ownerContribution += tx.amount;
                } else if (tx.categoryId === secDepIn) {
                    // Security deposits are liabilities, not income — tracked via Security Liability account
                    // Skip from P&L entirely
                } else if (tx.categoryId === rentalIn) {
                    ownerFundsHeld += tx.amount;
                } else if (tx.categoryId === assetReceivedCat) {
                    // Asset received in kind: balance sheet only; revenue recognized when asset is sold (Asset Sale Proceeds)
                    // Skip from retained earnings so RE is not overstated
                } else {
                    companyRevenue += tx.amount;
                }
            } 
            // EXPENSE
            else if (tx.type === TransactionType.EXPENSE) {
                const clearingAccount = state.accounts.find(a => a.name === 'Internal Clearing');
                if (clearingAccount && tx.accountId === clearingAccount.id) {
                    return;
                }
                
                if (tx.categoryId && drawingsCats.has(tx.categoryId)) {
                    ownerContribution -= tx.amount;
                } else if (tx.categoryId && secDepOut.has(tx.categoryId)) {
                    // Security refunds/payouts are liability reductions, not expenses — tracked via Security Liability account
                    // Skip from P&L entirely
                } else if (tx.categoryId && rentalOut.has(tx.categoryId)) {
                    ownerFundsHeld -= tx.amount;
                } else {
                    const category = categories.find(c => c.id === tx.categoryId);
                    if (category && category.type === TransactionType.INCOME) {
                        companyRevenue -= tx.amount;
                        return;
                    }
                    
                    let isOwnerExpense = false;
                    const catName = String(catMap.get(tx.categoryId || '') || '');
                    
                    // Tenant deductions reduce Security Liability (handled by applyTransactionEffect)
                    // but still show as expenses in P&L
                    if (tx.propertyId && !tx.projectId && !catName.includes('(Tenant)')) {
                        isOwnerExpense = true;
                    }

                    if (isOwnerExpense) {
                        ownerFundsHeld -= tx.amount;
                    } else {
                        companyExpense += tx.amount;
                    }
                }
            }
        });

        // 2. Accruals (AR & AP)
        let accountsReceivable = 0;
        const installmentInvoices = (state.invoices || []).filter(inv => inv.invoiceType === InvoiceType.INSTALLMENT);
        
        installmentInvoices.forEach(inv => {
            // Filter by project if a specific project is selected
            if (selectedProjectId !== 'all') {
                // Exclude invoices that have a different projectId
                // Note: Invoices without projectId are excluded when a specific project is selected
                if (inv.projectId !== selectedProjectId) return;
            }
            
            // Exclude invoices from cancelled agreements (they are voided)
            if (inv.agreementId) {
                const agreement = state.projectAgreements.find(pa => pa.id === inv.agreementId);
                if (agreement && agreement.status === 'Cancelled') {
                    // Skip invoices from cancelled agreements - they are voided
                    return;
                }
            }
            
            // Exclude voided invoices (marked with VOIDED in description)
            if (inv.description?.includes('VOIDED')) {
                return;
            }
            
            // For Accounts Receivable, include all unpaid invoices regardless of issue date
            // A/R represents money owed to the company, so we include all outstanding invoices
            // that exist as of the balance sheet date, even if their issue date is in the future
            // (e.g., installment invoices scheduled for future payment)
            
            // Use the invoice's paidAmount field directly (maintained by system)
            const paidAmount = inv.paidAmount || 0;
            const due = Math.max(0, inv.amount - paidAmount);
            
            // Add to A/R - include all invoices with any outstanding balance
            // This ensures both down payment and installment invoices are included
            accountsReceivable += due;
        });

        let accountsPayable = 0;
        // Filter accounts payable by project when a specific project is selected
        (state.bills || []).forEach(bill => {
            // Exclude rental bills (owner liability) - these are not project-related
            if (bill.propertyId) return;
            
            // For specific project, only include bills related to that project
            if (selectedProjectId !== 'all') {
                if (bill.projectId !== selectedProjectId) return;
            }

            if (new Date(bill.issueDate) <= dateLimit) {
                // Use the bill's paidAmount field directly (maintained by system via applyTransactionEffect)
                // This is more reliable than recalculating from transactions and ensures consistency
                const paidAmount = bill.paidAmount || 0;
                const due = Math.max(0, bill.amount - paidAmount);
                accountsPayable += due;
            }
        });

        // Received Assets (Long-term): balance = sum of held (unsold) assets so reversal of sale shows asset back in long-term
        const receivedAssetsAccountId =
            resolveSystemAccountId(state.accounts, 'sys-acc-received-assets') ?? 'sys-acc-received-assets';
        const receivedAssetsHeldBalance = (state.projectReceivedAssets || [])
            .filter(a => !a.soldDate)
            .filter(a => selectedProjectId === 'all' || a.projectId === selectedProjectId)
            .reduce((sum, a) => sum + (a.recordedValue || 0), 0);
        if (state.accounts?.some(a => a.id === receivedAssetsAccountId)) {
            accountBalances[receivedAssetsAccountId] = receivedAssetsHeldBalance;
            if (receivedAssetsHeldBalance > 0.01) accountsWithTransactions.add(receivedAssetsAccountId);
        }

        // 3. Retained Earnings (project equity / net position)
        // "Asset received (balance sheet only)" is excluded from companyRevenue (revenue at sale — see RecordSaleModal).
        // Held in-kind value is shown as Project Received Assets; book the balancing credit to equity so Assets = Liab + Equity.
        const retainedEarnings = (companyRevenue - companyExpense) + accountsReceivable - accountsPayable;
        const receivedAssetsEquityOffset = receivedAssetsHeldBalance;

        // 4. Asset/Liab Classification
        const currentAssetsArr: AccountBalance[] = [];
        const longTermAssetsArr: AccountBalance[] = [];
        const liabilitiesArr: AccountBalance[] = [];
        const equityArr: AccountBalance[] = [];

        const RENTAL_LIABILITY_KEYWORDS = ['rental liability', 'rent liability', 'rental suspense'];
        
        let rentalLiabilityAccountFound = false;

        (state.accounts || []).forEach(acc => {
            let balance = accountBalances[acc.id] || 0;
            const nameLower = acc.name.toLowerCase();

            // If this is the Rental Liability account, force the calculated balance
            if (RENTAL_LIABILITY_KEYWORDS.some(kw => nameLower.includes(kw))) {
                balance = -ownerFundsHeld;
                rentalLiabilityAccountFound = true;
            }
            
            // Security Liability account uses its own tracked balance from applyTransactionEffect
            // (sys-acc-sec-liability balance is maintained directly, no override needed)

            // Check if account has transactions for the selected project
            const hasTransactions = accountsWithTransactions.has(acc.id);
            // Only show accounts with transactions and non-zero balance (> 0.01)
            const hasBalance = Math.abs(balance) > 0.01;
            
            if (acc.type === AccountType.EQUITY) {
                // For equity accounts, only include if has transactions AND non-zero balance
                // Invert balance for equity accounts (credit-based accounting) so investments show as positive
                if (hasTransactions && hasBalance) {
                    equityArr.push({ id: acc.id, name: acc.name, balance: -balance, type: acc.type });
                }
            } else if (acc.type === AccountType.LIABILITY) {
                if (hasTransactions && (hasBalance || rentalLiabilityAccountFound)) {
                    if (rentalLiabilityAccountFound && !hasBalance) {
                        // Skip linked accounts with zero balance
                    } else {
                        liabilitiesArr.push({ id: acc.id, name: acc.name, balance: -balance, type: acc.type });
                    }
                }
            } else {
                // Asset accounts: split into current (BANK, CASH) vs long-term (ASSET)
                if (hasTransactions && hasBalance) {
                    const item = { id: acc.id, name: acc.name, balance: balance, type: acc.type };
                    if (acc.type === AccountType.BANK || acc.type === AccountType.CASH) {
                        currentAssetsArr.push(item);
                    } else if (acc.type === AccountType.ASSET) {
                        longTermAssetsArr.push(item);
                    }
                }
            }
        });

        // Combined for total (current + long-term)
        const allAssetsArr = [...currentAssetsArr, ...longTermAssetsArr];
        
        // If specific accounts weren't found in the loop, we append them as generic line items via the extraItems prop in display.
        // But we need to zero out the variable passed to extraItems if found to avoid double counting.
        // Security Liability is now tracked via sys-acc-sec-liability account directly (no fallback needed)
        const finalSecurityDepositsHeld = 0;
        const finalOwnerFundsHeld = rentalLiabilityAccountFound ? 0 : (Math.abs(ownerFundsHeld) > 0.01 ? ownerFundsHeld : 0);
        const finalOutstandingLoans = Math.abs(outstandingLoans) > 0.01 ? outstandingLoans : 0;

        // 5. Potential Revenue (Market Inventory - Unsold Units)
        const soldUnitIds = new Set<string>();
        (state.projectAgreements || []).forEach(pa => {
            if (pa.status === 'Active' && new Date(pa.issueDate) <= dateLimit) {
                (pa.unitIds || []).forEach(uid => soldUnitIds.add(uid));
            }
        });
        const marketInventory = (state.units || [])
            .filter(u => (selectedProjectId === 'all' || u.projectId === selectedProjectId) && !soldUnitIds.has(u.id))
            .reduce((sum, u) => sum + (u.salePrice || 0), 0);

        // 6. Totals
        // Only include items with meaningful values (> 0.01)
        const finalAccountsReceivable = Math.abs(accountsReceivable) > 0.01 ? accountsReceivable : 0;
        const finalAccountsPayable = Math.abs(accountsPayable) > 0.01 ? accountsPayable : 0;
        const finalMarketInventory = Math.abs(marketInventory) > 0.01 ? marketInventory : 0;
        const finalOwnerContribution = Math.abs(ownerContribution) > 0.01 ? ownerContribution : 0;
        const finalRetainedEarnings = Math.abs(retainedEarnings) > 0.01 ? retainedEarnings : 0;
        
        // Assets = Current + Long-term + Accounts Receivable + Potential Revenue
        const totalAssets = allAssetsArr.reduce((sum, a) => sum + a.balance, 0) + finalAccountsReceivable + finalMarketInventory;
        
        // Liabilities = All liability accounts related to selected project + All accounts payable + outstanding loans + security deposits + owner funds
        const totalLiabilities = liabilitiesArr.reduce((sum, l) => sum + l.balance, 0) + 
                                 finalAccountsPayable + 
                                 finalOutstandingLoans + 
                                 finalSecurityDepositsHeld + 
                                 finalOwnerFundsHeld;
        
        // Equity = Owner's current equity for the selected project
        // This includes equity accounts related to the project + owner contributions + retained earnings
        const totalEquityAccounts = equityArr.reduce((sum, e) => sum + e.balance, 0);
        const finalReceivedAssetsEquityOffset =
            Math.abs(receivedAssetsEquityOffset) > 0.01 ? receivedAssetsEquityOffset : 0;
        const totalEquity =
            totalEquityAccounts + finalOwnerContribution + finalRetainedEarnings + finalReceivedAssetsEquityOffset;

        const discrepancy = totalAssets - (totalLiabilities + totalEquity);
        const isBalanced = Math.abs(discrepancy) < 1;

        return {
            assets: { currentAccounts: currentAssetsArr, longTermAccounts: longTermAssetsArr, accountsReceivable: finalAccountsReceivable, total: totalAssets },
            liabilities: { 
                accounts: liabilitiesArr, 
                accountsPayable: finalAccountsPayable, 
                outstandingLoans: finalOutstandingLoans, 
                securityDepositsHeld: finalSecurityDepositsHeld, 
                ownerFundsHeld: finalOwnerFundsHeld, 
                total: totalLiabilities 
            },
            equity: {
                accounts: equityArr,
                ownerContribution: finalOwnerContribution,
                retainedEarnings: finalRetainedEarnings,
                receivedAssetsEquityOffset: finalReceivedAssetsEquityOffset,
                total: totalEquity,
            },
            marketInventory: finalMarketInventory,
            isBalanced,
            discrepancy
        };

    }, [state, asOfDate, selectedProjectId]);


    const handleExport = () => {
        const data = [
            { Category: 'ASSETS (What it owns)', Amount: '' },
            { Category: '  Current assets', Amount: '' },
            ...reportData.assets.currentAccounts.map(a => ({ Category: `    ${a.name}`, Amount: a.balance })),
            { Category: '  Accounts Receivable (Projects)', Amount: reportData.assets.accountsReceivable },
            { Category: '  Potential Revenue (Unsold Units)', Amount: reportData.marketInventory },
            { Category: '  Long-term assets', Amount: '' },
            ...reportData.assets.longTermAccounts.map(a => ({ Category: `    ${a.name}`, Amount: a.balance })),
            { Category: 'TOTAL ASSETS', Amount: reportData.assets.total },
            {},
            { Category: 'LIABILITIES (What it owes)', Amount: '' },
            ...reportData.liabilities.accounts.map(l => ({ Category: `  ${l.name}`, Amount: l.balance })),
            { Category: '  Accounts Payable (Company)', Amount: reportData.liabilities.accountsPayable },
            { Category: '  Outstanding Loans', Amount: reportData.liabilities.outstandingLoans },
            // Only export these lines if they have value (meaning no specific account was linked)
            ...(reportData.liabilities.securityDepositsHeld ? [{ Category: '  Tenant Security Deposits Held', Amount: reportData.liabilities.securityDepositsHeld }] : []),
            ...(reportData.liabilities.ownerFundsHeld ? [{ Category: '  Owner Funds Held (Rental)', Amount: reportData.liabilities.ownerFundsHeld }] : []),
            { Category: 'TOTAL LIABILITIES', Amount: reportData.liabilities.total },
            {},
            { Category: 'EQUITY (Investor Amount)', Amount: '' },
            ...reportData.equity.accounts.map(e => ({ Category: `  ${e.name}`, Amount: e.balance })),
            { Category: "  Owner's Contribution", Amount: reportData.equity.ownerContribution },
            { Category: '  Retained Earnings', Amount: reportData.equity.retainedEarnings },
            ...(Math.abs(reportData.equity.receivedAssetsEquityOffset) > 0.01
                ? [{ Category: '  In-kind project assets (held)', Amount: reportData.equity.receivedAssetsEquityOffset }]
                : []),
            { Category: 'TOTAL EQUITY', Amount: reportData.equity.total },
        ];
        exportJsonToExcel(data, 'balance-sheet.xlsx', 'Balance Sheet');
    };

    const SectionRender = ({ title, accounts, extraItems, total, color }: { title: string, accounts: AccountBalance[], extraItems?: {label: string, amount: number}[], total: number, color: string }) => (
        <div className="mb-6 rounded-xl border border-app-border overflow-hidden bg-app-card shadow-ds-card transition-shadow duration-ds">
            <h4 className={`text-sm font-bold ${color} uppercase tracking-wider p-3 bg-app-table-header border-b border-app-border`}>{title}</h4>
            <div className="p-3 space-y-2 text-sm">
                {accounts.map(acc => (
                    <div key={acc.id} className="flex justify-between py-1 hover:bg-app-toolbar/60 rounded px-1 transition-colors duration-ds">
                        <span className="text-app-text">{acc.name}</span>
                        <span className="font-mono tabular-nums text-app-text">{CURRENCY} {acc.balance.toLocaleString()}</span>
                    </div>
                ))}
                {extraItems?.map((item, idx) => (
                    Math.abs(item.amount) > 0.01 ? (
                        <div key={idx} className="flex justify-between py-1 hover:bg-app-toolbar/60 rounded px-1 transition-colors duration-ds">
                            <span className="text-app-text">{item.label}</span>
                            <span className="font-mono tabular-nums text-app-text">{CURRENCY} {item.amount.toLocaleString()}</span>
                        </div>
                    ) : null
                ))}
            </div>
            <div className="flex justify-between p-3 bg-app-toolbar border-t border-app-border font-bold text-base text-app-text">
                <span>Total {title}</span>
                <span className="tabular-nums">{CURRENCY} {total.toLocaleString()}</span>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full space-y-4 bg-background">
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex-shrink-0">
                <ReportToolbar
                    startDate={asOfDate}
                    endDate={asOfDate}
                    onDateChange={(start, end) => handleDateChange(start)}
                    onExport={handleExport}
                    onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                    hideGroup={true}
                    showDateFilterPills={true}
                    activeDateRange={dateRange}
                    onRangeChange={handleRangeChange}
                    hideSearch={true}
                    singleDateMode={true}
                >
                    <div className="w-40 sm:w-48 flex-shrink-0">
                        <ComboBox 
                            items={projectItems} 
                            selectedId={selectedProjectId} 
                            onSelect={(item) => setSelectedProjectId(item?.id || 'all')} 
                            allowAddNew={false}
                            placeholder="Select Project"
                        />
                    </div>
                </ReportToolbar>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full p-4 md:p-6">
                    <ReportHeader />
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-bold text-app-text uppercase tracking-wide">Balance Sheet</h3>
                        <p className="text-sm text-app-muted font-medium mt-1">
                            {selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name}
                        </p>
                        <p className="text-xs text-app-muted/90">As of {formatDate(asOfDate)}</p>
                    </div>

                    <div className="max-w-6xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Left Column: Assets */}
                            <div>
                                <SectionRender 
                                    title="Current assets" 
                                    accounts={reportData.assets.currentAccounts} 
                                    extraItems={[
                                        ...(Math.abs(reportData.assets.accountsReceivable) > 0.01 ? [{ label: 'Accounts Receivable (Projects)', amount: reportData.assets.accountsReceivable }] : []),
                                        ...(Math.abs(reportData.marketInventory) > 0.01 ? [{ label: 'Potential Revenue (Unsold Units)', amount: reportData.marketInventory }] : [])
                                    ]}
                                    total={reportData.assets.currentAccounts.reduce((s, a) => s + a.balance, 0) + (Math.abs(reportData.assets.accountsReceivable) > 0.01 ? reportData.assets.accountsReceivable : 0) + (Math.abs(reportData.marketInventory) > 0.01 ? reportData.marketInventory : 0)}
                                    color="text-ds-success"
                                />
                                <SectionRender 
                                    title="Long-term assets" 
                                    accounts={reportData.assets.longTermAccounts} 
                                    total={reportData.assets.longTermAccounts.reduce((s, a) => s + a.balance, 0)}
                                    color="text-ds-success"
                                />
                                <div className="flex justify-between p-3 bg-app-toolbar border border-ds-success/35 rounded-b-xl font-bold text-base text-app-text">
                                    <span className="text-ds-success">Total assets</span>
                                    <span className="tabular-nums text-app-text">{CURRENCY} {reportData.assets.total.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Right Column: Liabilities & Equity */}
                            <div>
                                <SectionRender 
                                    title="Liabilities" 
                                    accounts={reportData.liabilities.accounts} 
                                    extraItems={[
                                        ...(Math.abs(reportData.liabilities.accountsPayable) > 0.01 ? [{ label: 'Accounts Payable (Company)', amount: reportData.liabilities.accountsPayable }] : []),
                                        ...(Math.abs(reportData.liabilities.outstandingLoans) > 0.01 ? [{ label: 'Outstanding Loans', amount: reportData.liabilities.outstandingLoans }] : []),
                                        ...(Math.abs(reportData.liabilities.securityDepositsHeld) > 0.01 ? [{ label: 'Tenant Security Deposits Held', amount: reportData.liabilities.securityDepositsHeld }] : []),
                                        ...(Math.abs(reportData.liabilities.ownerFundsHeld) > 0.01 ? [{ label: 'Owner Funds Held (Rental)', amount: reportData.liabilities.ownerFundsHeld }] : [])
                                    ]}
                                    total={reportData.liabilities.total}
                                    color="text-ds-danger"
                                />
                                
                                <SectionRender 
                                    title="Shareholders' Equity" 
                                    accounts={reportData.equity.accounts} 
                                    extraItems={[
                                        ...(Math.abs(reportData.equity.ownerContribution) > 0.01 ? [{ label: "Owner's Contribution", amount: reportData.equity.ownerContribution }] : []),
                                        ...(Math.abs(reportData.equity.retainedEarnings) > 0.01 ? [{ label: "Retained Earnings", amount: reportData.equity.retainedEarnings }] : []),
                                        ...(Math.abs(reportData.equity.receivedAssetsEquityOffset) > 0.01
                                            ? [{ label: 'In-kind project assets (held)', amount: reportData.equity.receivedAssetsEquityOffset }]
                                            : []),
                                    ]}
                                    total={reportData.equity.total}
                                    color="text-primary"
                                />
                            </div>
                        </div>

                        {/* Equation Check */}
                        <div className="mt-8 border-t-2 border-app-border pt-6">
                            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-app-toolbar p-4 rounded-xl border border-app-border shadow-ds-card">
                                <div className="text-center md:text-left mb-4 md:mb-0">
                                    <p className="text-xs text-app-muted font-bold uppercase tracking-widest mb-1">Accounting Equation</p>
                                    <p className="text-sm font-medium text-app-text">Assets = Liabilities + Equity</p>
                                </div>
                                
                                <div className="flex items-center gap-4 text-lg sm:text-xl font-bold font-mono tabular-nums">
                                    <div className="text-ds-success">
                                        <span className="text-xs text-app-muted block font-sans font-normal text-center">Assets</span>
                                        {CURRENCY} {reportData.assets.total.toLocaleString()}
                                    </div>
                                    <div className="text-app-muted">=</div>
                                    <div className="text-app-text">
                                        <span className="text-xs text-app-muted block font-sans font-normal text-center">Liab + Equity</span>
                                        {CURRENCY} {(reportData.liabilities.total + reportData.equity.total).toLocaleString()}
                                    </div>
                                </div>

                                {reportData.isBalanced ? (
                                    <div className="flex items-center gap-2 border border-ds-success/40 bg-[color:var(--badge-paid-bg)] text-ds-success px-3 py-1 rounded-full text-xs font-bold">
                                        <span>✓</span> Balanced
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 border border-ds-danger/40 bg-[color:var(--badge-unpaid-bg)] text-[color:var(--badge-unpaid-text)] px-3 py-1 rounded-full text-xs font-bold">
                                        <span>⚠</span> Discrepancy: {CURRENCY} {reportData.discrepancy.toLocaleString()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <ReportFooter />
                </Card>
            </div>
        </div>
    );
};

export default ProjectBalanceSheetReport;

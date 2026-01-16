
import React, { useMemo, useState } from 'react';
import { useKpis } from '../../context/KPIContext';
import { useAppContext } from '../../context/AppContext';
import { ICONS, CURRENCY } from '../../constants';
import { InvoiceStatus, RentalAgreementStatus, ContactType, TransactionType, LoanSubtype, PayslipStatus, AccountType } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/numberUtils';

type SortConfig = {
    key: string;
    direction: 'ascending' | 'descending';
} | null;

const KPIDrilldown: React.FC = () => {
    const { activeDrilldownKpi, closeDrilldown } = useKpis();
    const { state, dispatch } = useAppContext();
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);

    const drilldownData = useMemo(() => {
        if (!activeDrilldownKpi) return { title: '', headers: [], items: [] };

        const { id, title } = activeDrilldownKpi;
        let items: any[] = [];
        let headers: { key: string; label: string; isNumeric?: boolean }[] = [];

        // Single-value KPIs that link to a list
        if (id === 'totalBalance') {
             headers = [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value', isNumeric: true }];
             // Include Cash (isPermanent) in the drilldown if it's not a receivable/payable account
             items = state.accounts
                .filter(acc => acc.name !== 'Accounts Receivable' && acc.name !== 'Accounts Payable')
                .map(acc => ({ id: acc.id, name: acc.name, value: acc.balance, filter: { name: acc.name } }));
        } else if (id.startsWith('account-balance-')) {
             const accountId = id.replace('account-balance-', '');
             
             headers = [
                 { key: 'date', label: 'Date' },
                 { key: 'particulars', label: 'Description' },
                 { key: 'amount', label: 'Amount', isNumeric: true }
             ];

             const transactions = state.transactions
                .filter(tx => tx.accountId === accountId || tx.fromAccountId === accountId || tx.toAccountId === accountId)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

             items = transactions.map(tx => {
                 let amount = tx.amount;
                 
                 // Determine sign based on transaction flow relative to this account
                 if (tx.type === TransactionType.EXPENSE) {
                     amount = -amount;
                 } else if (tx.type === TransactionType.INCOME) {
                     // Positive
                 } else if (tx.type === TransactionType.TRANSFER) {
                     if (tx.fromAccountId === accountId) amount = -amount;
                     // else if toAccountId, it's positive
                 } else if (tx.type === TransactionType.LOAN) {
                     if (tx.subtype === LoanSubtype.REPAY) amount = -amount; // We pay out
                     // else Receive Loan, we get money (positive)
                 }

                 return {
                     id: tx.id,
                     date: tx.date,
                     particulars: tx.description || tx.type,
                     amount: amount,
                     // Clicking filters by description on the main ledger page
                     filter: { name: tx.description || '' }
                 };
             });

        } else if (id.startsWith('category-expense-') || id.startsWith('category-income-')) {
             headers = [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value', isNumeric: true }];
             const categoryId = id.replace('category-expense-', '').replace('category-income-', '');
             const category = state.categories.find(c => c.id === categoryId);
             if(category) items = [{ id: category.id, name: `View all "${category.name}" transactions`, value: 0, filter: { name: category.name } }];
        }
        // List-based KPIs that show a table
        else if (id === 'vacantUnits') {
            headers = [{ key: 'unitName', label: 'Unit' }, { key: 'buildingName', label: 'Building' }, { key: 'ownerName', label: 'Owner' }];
            const occupiedIds = new Set(state.rentalAgreements.filter(ra => ra.status === RentalAgreementStatus.ACTIVE).map(ra => ra.propertyId));
            items = state.properties.filter(p => !occupiedIds.has(p.id)).map(p => ({
                id: p.id, unitName: p.name, buildingName: state.buildings.find(b => b.id === p.buildingId)?.name || 'N/A',
                ownerName: state.contacts.find(c => c.id === p.ownerId)?.name || 'N/A', filter: { name: p.name }
            }));
        } else if (id === 'occupiedUnits') {
            headers = [{ key: 'unitName', label: 'Unit' }, { key: 'tenantName', label: 'Tenant' }, { key: 'endDate', label: 'Agreement Ends' }];
            items = state.rentalAgreements.filter(ra => ra.status === RentalAgreementStatus.ACTIVE).map(ra => {
                const property = state.properties.find(p => p.id === ra.propertyId);
                return {
                    id: ra.id, unitName: property?.name || 'N/A', tenantName: state.contacts.find(c => c.id === ra.contactId)?.name || 'N/A',
                    endDate: ra.endDate, filter: { name: property?.name || '' }
                };
            });
        } else if (id === 'securityDepositHeld') {
            headers = [
                { key: 'date', label: 'Date' },
                { key: 'particulars', label: 'Description' },
                { key: 'amount', label: 'Net Amount', isNumeric: true }
            ];
            
            const secDepId = state.categories.find(c => c.name === 'Security Deposit')?.id;
            const secRefId = state.categories.find(c => c.name === 'Security Deposit Refund')?.id;
            const ownerSecPayId = state.categories.find(c => c.name === 'Owner Security Payout')?.id;

            const transactions = state.transactions
                .filter(tx => {
                    if (tx.type === TransactionType.INCOME && tx.categoryId === secDepId) return true;
                    if (tx.type === TransactionType.EXPENSE) {
                        if ((secRefId && tx.categoryId === secRefId) || (ownerSecPayId && tx.categoryId === ownerSecPayId)) return true;
                        
                        // Include other deductions
                        const category = state.categories.find(c => c.id === tx.categoryId);
                        const contact = state.contacts.find(c => c.id === tx.contactId);
                        if (contact?.type === ContactType.TENANT || category?.name.includes('(Tenant)')) return true;
                    }
                    return false;
                })
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            items = transactions.map(tx => {
                let amount = tx.amount;
                // If expense (Refund/Payout/Deduction), it reduces liability, so show as negative
                if (tx.type === TransactionType.EXPENSE) amount = -amount;
                
                return {
                    id: tx.id,
                    date: tx.date,
                    particulars: tx.description || (amount > 0 ? 'Deposit Collected' : 'Refund/Payout/Deduction'),
                    amount: amount,
                    filter: { name: tx.description || '' }
                };
            });

        } else if (id === 'outstandingLoan') {
            headers = [{ key: 'contactName', label: 'Contact' }, { key: 'balance', label: 'Balance', isNumeric: true }];
            const loanBalances: Record<string, number> = {};
            state.transactions.filter(tx => tx.type === 'Loan' && tx.contactId).forEach(tx => {
                if (!loanBalances[tx.contactId!]) loanBalances[tx.contactId!] = 0;
                loanBalances[tx.contactId!] += tx.subtype === 'Receive Loan' ? tx.amount : -tx.amount;
            });
            items = Object.entries(loanBalances).map(([contactId, balance]) => ({
                id: contactId, contactName: state.contacts.find(c => c.id === contactId)?.name || 'N/A',
                balance: balance, filter: { name: state.contacts.find(c => c.id === contactId)?.name || '' }
            })).filter(item => item.balance > 0);
        } else if (id === 'accountsReceivable') {
            headers = [{ key: 'number', label: 'Invoice #' }, { key: 'contact', label: 'Name' }, { key: 'balance', label: 'Balance', isNumeric: true }];
            items = state.invoices
                .filter(inv => inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.DRAFT)
                .map(inv => ({
                    id: inv.id,
                    number: inv.invoiceNumber,
                    contact: state.contacts.find(c => c.id === inv.contactId)?.name || 'N/A',
                    balance: inv.amount - inv.paidAmount,
                    filter: { name: inv.invoiceNumber }
                }));
        } else if (id === 'accountsPayable') {
            headers = [{ key: 'number', label: 'Bill/Ref #' }, { key: 'contact', label: 'Payee' }, { key: 'balance', label: 'Balance', isNumeric: true }];
            const unpaidBills = state.bills
                .filter(b => b.status !== InvoiceStatus.PAID && b.status !== InvoiceStatus.DRAFT)
                .map(b => ({
                    id: b.id,
                    number: b.billNumber,
                    contact: state.contacts.find(c => c.id === b.contactId)?.name || 'N/A',
                    balance: b.amount - b.paidAmount,
                    filter: { name: b.billNumber }
                }));
            
            const allPayslips = [...state.projectPayslips, ...state.rentalPayslips];
            const unpaidPayslips = allPayslips
                .filter(p => p.status !== PayslipStatus.PAID)
                .map(p => {
                    const paidAmount = state.transactions
                        .filter(tx => tx.payslipId === p.id)
                        .reduce((sum, tx) => sum + tx.amount, 0);
                    return {
                        id: p.id,
                        number: `Payslip ${p.month}`,
                        contact: state.contacts.find(c => c.id === p.staffId)?.name || 'Staff',
                        balance: p.netSalary - paidAmount,
                        filter: { name: state.contacts.find(c => c.id === p.staffId)?.name || '' }
                    };
                });

            items = [...unpaidBills, ...unpaidPayslips];
        } else if (id === 'bmFunds') {
             headers = [{ key: 'buildingName', label: 'Building' }, { key: 'amount', label: 'Net Funds', isNumeric: true }];
             
             const breakdown: Record<string, { name: string, amount: number }> = {};
             state.buildings.forEach(b => { breakdown[b.id] = { name: b.name, amount: 0 }; });
             
             const serviceIncomeCatIds = new Set(state.categories.filter(c => c.type === TransactionType.INCOME && c.name.toLowerCase().includes('service charge')).map(c => c.id));
             const ownerExpenseCategoryNames = ['Owner Payout', 'Security Deposit Refund', 'Broker Fee'];
             const isOwnerExpense = (catId?: string) => { const c = state.categories.find(cat => cat.id === catId); return c && ownerExpenseCategoryNames.includes(c.name); };
             const isTenant = (contactId?: string) => { const c = state.contacts.find(con => con.id === contactId); return c?.type === ContactType.TENANT; };

             state.transactions.forEach(tx => {
                 let bId = tx.buildingId;
                 if (!bId && tx.propertyId) bId = state.properties.find(p => p.id === tx.propertyId)?.buildingId;
                 
                 if (bId && breakdown[bId]) {
                     if (tx.type === TransactionType.INCOME && tx.categoryId && serviceIncomeCatIds.has(tx.categoryId)) {
                         breakdown[bId].amount += tx.amount;
                     }
                     if (tx.type === TransactionType.EXPENSE && !tx.billId && !tx.propertyId && !isTenant(tx.contactId) && !isOwnerExpense(tx.categoryId)) {
                         breakdown[bId].amount -= tx.amount;
                     }
                 }
             });
             
             state.bills.forEach(bill => {
                 if (bill.buildingId && breakdown[bill.buildingId] && !bill.propertyId && !isTenant(bill.contactId) && !isOwnerExpense(bill.categoryId)) {
                     breakdown[bill.buildingId].amount -= bill.amount;
                 }
             });
             
             items = Object.values(breakdown).map(b => ({
                 id: b.name, // No ID needed for simple list
                 buildingName: b.name,
                 amount: b.amount,
                 filter: null // No direct filter link to transaction page easily
             })).filter(i => Math.abs(i.amount) > 0.01);
        } else if (id === 'projectFunds') {
            headers = [{ key: 'projectName', label: 'Project' }, { key: 'amount', label: 'Net Funds', isNumeric: true }];
            
            // Calculate net balance using the same formula as Funds Availability Report
            // netBalance = (income - expense) + (investment - equityOut) + loanNetBalance
            
            const equityCategoryNames = ['Owner Equity', 'Share Capital', 'Investment', 'Capital Injection'];
            const withdrawalCategoryNames = ['Owner Withdrawn', 'Drawings', 'Dividends', 'Profit Share', 'Owner Payout', 'Owner Security Payout', 'Security Deposit Refund'];
            
            const isEquityIncome = (catId?: string) => {
                if (!catId) return false;
                const c = state.categories.find(cat => cat.id === catId);
                return c && equityCategoryNames.includes(c.name);
            };
            
            const isEquityExpense = (catId?: string) => {
                if (!catId) return false;
                const c = state.categories.find(cat => cat.id === catId);
                return c && withdrawalCategoryNames.includes(c.name);
            };
            
            const equityAccountIds = new Set(state.accounts.filter(a => a.type === AccountType.EQUITY).map(a => a.id));
            
            const breakdown: Record<string, { name: string, amount: number }> = {};
            state.projects.forEach(p => {
                breakdown[p.id] = { name: p.name, amount: 0 };
            });

            state.projects.forEach(project => {
                let income = 0;
                let expense = 0;
                let investment = 0;
                let equityOut = 0;
                let loanNetBalance = 0;
                
                state.transactions.forEach(tx => {
                    // Resolve projectId from transaction, bill, or invoice
                    let txProjectId = tx.projectId;
                    
                    if (!txProjectId && tx.billId) {
                        const bill = state.bills.find(b => b.id === tx.billId);
                        if (bill) txProjectId = bill.projectId;
                    }
                    
                    if (!txProjectId && tx.invoiceId) {
                        const invoice = state.invoices.find(i => i.id === tx.invoiceId);
                        if (invoice) txProjectId = invoice.projectId;
                    }
                    
                    if (txProjectId !== project.id) return;
                    
                    if (tx.type === TransactionType.INCOME) {
                        if (isEquityIncome(tx.categoryId)) {
                            investment += tx.amount;
                        } else {
                            income += tx.amount;
                        }
                    } else if (tx.type === TransactionType.EXPENSE) {
                        if (isEquityExpense(tx.categoryId)) {
                            equityOut += tx.amount;
                        } else {
                            expense += tx.amount;
                        }
                    } else if (tx.type === TransactionType.TRANSFER) {
                        const isFromEquity = tx.fromAccountId && equityAccountIds.has(tx.fromAccountId);
                        const isToEquity = tx.toAccountId && equityAccountIds.has(tx.toAccountId);
                        const isMoveIn = tx.description?.toLowerCase().includes('equity move in');
                        const isMoveOut = tx.description?.toLowerCase().includes('equity move out');
                        
                        const fromAccount = state.accounts.find(a => a.id === tx.fromAccountId);
                        const isFromClearing = fromAccount?.name === 'Internal Clearing';
                        const isPMFeeTransfer = tx.description?.toLowerCase().includes('pm fee') || 
                                               tx.description?.toLowerCase().includes('pm fee equity');
                        
                        if (isFromEquity || isMoveIn) {
                            investment += tx.amount;
                        } else if (isToEquity || isMoveOut) {
                            if (isFromClearing && isPMFeeTransfer) {
                                investment += tx.amount;
                            } else {
                                equityOut += tx.amount;
                            }
                        }
                    } else if (tx.type === TransactionType.LOAN) {
                        if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                            loanNetBalance += tx.amount;
                        } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                            loanNetBalance -= tx.amount;
                        }
                    }
                });
                
                const netBalance = (income - expense) + (investment - equityOut) + loanNetBalance;
                breakdown[project.id].amount = netBalance;
            });

            items = Object.values(breakdown)
                .filter(p => Math.abs(p.amount) > 0.01)
                .map(p => ({
                    id: p.name,
                    projectName: p.name,
                    amount: p.amount,
                    filter: { name: p.name }
                }));
        } else if (id === 'buildingFunds') {
            headers = [{ key: 'buildingName', label: 'Building' }, { key: 'amount', label: 'Net Funds', isNumeric: true }];
            
            // Calculate net balance using the same formula as Funds Availability Report for buildings
            // netBalance = (income - expense) + loanNetBalance
            
            const breakdown: Record<string, { name: string, amount: number }> = {};
            state.buildings.forEach(b => {
                breakdown[b.id] = { name: b.name, amount: 0 };
            });

            state.buildings.forEach(building => {
                let income = 0;
                let expense = 0;
                let loanNetBalance = 0;
                
                state.transactions.forEach(tx => {
                    let txBuildingId = tx.buildingId;
                    if (!txBuildingId && tx.propertyId) {
                        const prop = state.properties.find(p => p.id === tx.propertyId);
                        if (prop) txBuildingId = prop.buildingId;
                    }
                    
                    if (txBuildingId !== building.id) return;
                    
                    if (tx.type === TransactionType.INCOME) {
                        income += tx.amount;
                    } else if (tx.type === TransactionType.EXPENSE) {
                        expense += tx.amount;
                    } else if (tx.type === TransactionType.LOAN) {
                        // Calculate loan net balance
                        // RECEIVE and COLLECT increase available funds (positive)
                        // GIVE and REPAY decrease available funds (negative)
                        if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                            loanNetBalance += tx.amount;
                        } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                            loanNetBalance -= tx.amount;
                        }
                    }
                });
                
                const netBalance = (income - expense) + loanNetBalance;
                breakdown[building.id].amount = netBalance;
            });

            items = Object.values(breakdown)
                .filter(b => Math.abs(b.amount) > 0.01)
                .map(b => ({
                    id: b.name,
                    buildingName: b.name,
                    amount: b.amount,
                    filter: { name: b.name }
                }));
        }

        return { title, headers, items };
    }, [activeDrilldownKpi, state]);
    
    const sortedItems = useMemo(() => {
        if (!sortConfig) return drilldownData.items;

        return [...drilldownData.items].sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });
    }, [drilldownData.items, sortConfig]);
    
    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleItemClick = (filter: { name: string }) => {
        if (!filter) return;
        dispatch({ type: 'SET_INITIAL_TRANSACTION_FILTER', payload: filter });
        dispatch({ type: 'SET_PAGE', payload: 'transactions' });
        closeDrilldown();
    };
    
    if (!activeDrilldownKpi) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-scale-up">
                <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800">{drilldownData.title} Details</h3>
                    <button onClick={closeDrilldown} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-200">
                        <div className="w-6 h-6">{ICONS.x}</div>
                    </button>
                </div>
                
                <div className="flex-grow overflow-y-auto p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-slate-500 font-semibold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                            <tr>
                                {drilldownData.headers.map((header, idx) => (
                                    <th 
                                        key={idx} 
                                        className={`px-4 py-3 ${header.isNumeric ? 'text-right' : 'text-left'} cursor-pointer hover:bg-slate-50 select-none`}
                                        onClick={() => requestSort(header.key)}
                                    >
                                        <div className={`flex items-center gap-1 ${header.isNumeric ? 'justify-end' : 'justify-start'}`}>
                                            {header.label}
                                            {sortConfig?.key === header.key && (
                                                <span className="text-xs text-accent">{sortConfig.direction === 'ascending' ? '↑' : '↓'}</span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedItems.map((item: any, idx: number) => (
                                <tr 
                                    key={item.id || idx} 
                                    className={`hover:bg-slate-50 transition-colors ${item.filter ? 'cursor-pointer' : ''}`}
                                    onClick={() => item.filter && handleItemClick(item.filter)}
                                >
                                    {drilldownData.headers.map((header, hIdx) => (
                                        <td key={hIdx} className={`px-4 py-3 ${header.isNumeric ? 'text-right font-mono' : 'text-slate-700'}`}>
                                            {header.isNumeric 
                                                ? CURRENCY + ' ' + formatCurrency(item[header.key] || 0)
                                                : (header.key === 'date' ? formatDate(item[header.key]) : item[header.key])
                                            }
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {sortedItems.length === 0 && (
                                <tr>
                                    <td colSpan={drilldownData.headers.length} className="px-4 py-12 text-center text-slate-400 italic">
                                        No items available.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 text-right flex justify-end gap-2">
                    <button 
                        onClick={closeDrilldown} 
                        className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium text-sm transition-colors shadow-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default KPIDrilldown;

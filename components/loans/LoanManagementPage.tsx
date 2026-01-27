import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, LoanSubtype } from '../../types';
import TransactionForm from '../transactions/TransactionForm';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { ICONS, CURRENCY } from '../../constants';
import LoanAnalysisReport from '../reports/LoanAnalysisReport';
import { formatDate } from '../../utils/dateUtils';
import { exportJsonToExcel } from '../../services/exportService';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService } from '../../services/whatsappService';

interface LoanSummary {
    contactId: string;
    contactName: string;
    contactNo?: string;
    received: number; // We borrowed
    repaid: number; // We paid back
    given: number; // We lent
    collected: number; // We collected back
    netBalance: number; // Positive = We owe, Negative = They owe us
}

type SortDirection = 'asc' | 'desc';

const LoanManagementPage: React.FC = () => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

    // Sorting State
    const [accountSort, setAccountSort] = useState<{ key: 'name' | 'amount'; direction: SortDirection }>({ key: 'amount', direction: 'desc' });
    const [txSort, setTxSort] = useState<{ key: string; direction: SortDirection }>({ key: 'date', direction: 'asc' });

    // --- Data Preparation ---

    const loanSummaries = useMemo(() => {
        const summary: Record<string, LoanSummary> = {};
        
        state.transactions.filter(tx => tx.type === TransactionType.LOAN).forEach(tx => {
            const contactId = tx.contactId || 'unknown';
            if (!summary[contactId]) {
                const contact = state.contacts.find(c => c.id === contactId);
                summary[contactId] = {
                    contactId,
                    contactName: contact?.name || 'Unknown',
                    contactNo: contact?.contactNo,
                    received: 0,
                    repaid: 0,
                    given: 0,
                    collected: 0,
                    netBalance: 0
                };
            }
            
            if (tx.subtype === LoanSubtype.RECEIVE) {
                summary[contactId].received += tx.amount;
                summary[contactId].netBalance += tx.amount;
            } else { 
                summary[contactId].given += tx.amount;
                summary[contactId].netBalance -= tx.amount;
            }
        });

        return Object.values(summary).filter(s => Math.abs(s.netBalance) > 0.01 || s.received > 0 || s.given > 0);
    }, [state.transactions, state.contacts]);

    const sortedSummaries = useMemo(() => {
        let items = [...loanSummaries];
        
        // Filter
        if (searchQuery) {
            items = items.filter(s => s.contactName.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        // Sort
        items.sort((a, b) => {
            let valA: any, valB: any;
            if (accountSort.key === 'name') {
                valA = a.contactName.toLowerCase();
                valB = b.contactName.toLowerCase();
            } else {
                // Sort by absolute balance magnitude or net value? Usually value.
                valA = a.netBalance;
                valB = b.netBalance;
            }

            if (valA < valB) return accountSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return accountSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return items;
    }, [loanSummaries, searchQuery, accountSort]);

    const selectedSummary = useMemo(() => {
        return loanSummaries.find(s => s.contactId === selectedContactId);
    }, [loanSummaries, selectedContactId]);

    const processedTransactions = useMemo(() => {
        if (!selectedContactId) return [];
        const rawTxs = state.transactions.filter(tx => tx.type === TransactionType.LOAN && tx.contactId === selectedContactId);
        
        // Always calculate balance chronologically first
        rawTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let runningBalance = 0;
        const rows = rawTxs.map(tx => {
            const isInflow = tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT;
            // "Give Loan" column = Outflow (Given/Repaid)
            const give = isInflow ? 0 : tx.amount;
            // "Receive Loan" column = Inflow (Received/Collected)
            const receive = isInflow ? tx.amount : 0;
            
            // Balance logic: Positive = Liability (We Owe), Negative = Asset (They Owe)
            // Receive increases Liability (+), Give decreases Liability (-)
            runningBalance += (receive - give);

            return {
                ...tx,
                give,
                receive,
                balance: runningBalance,
                accountName: state.accounts.find(a => a.id === tx.accountId)?.name || 'Unknown'
            };
        });

        // Apply visual sorting if different from default chronological
        if (txSort.key !== 'date' || txSort.direction === 'desc') {
            rows.sort((a, b) => {
                let valA: any = a[txSort.key as keyof typeof a];
                let valB: any = b[txSort.key as keyof typeof b];

                if (txSort.key === 'account') {
                    valA = a.accountName;
                    valB = b.accountName;
                } else if (txSort.key === 'give') {
                    valA = a.give;
                    valB = b.give;
                } else if (txSort.key === 'receive') {
                    valA = a.receive;
                    valB = b.receive;
                }

                if (valA < valB) return txSort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return txSort.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return rows;
    }, [state.transactions, state.accounts, selectedContactId, txSort]);

    const transactionTotals = useMemo(() => {
        const totalGive = processedTransactions.reduce((acc, curr) => acc + curr.give, 0);
        const totalReceive = processedTransactions.reduce((acc, curr) => acc + curr.receive, 0);
        const net = totalReceive - totalGive;
        return { totalGive, totalReceive, net };
    }, [processedTransactions]);

    // --- Handlers ---

    const handleAccountSort = (key: 'name' | 'amount') => {
        setAccountSort(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleTxSort = (key: string) => {
        setTxSort(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleWhatsApp = async () => {
        if (!selectedSummary) return;
        if (!selectedSummary.contactNo) {
            await showAlert("This contact does not have a phone number saved.");
            return;
        }
        
        try {
            const balance = selectedSummary.netBalance;
            const status = balance > 0 ? "You Owe" : balance < 0 ? "Owes You" : "Settled";
            
            let message = `*Loan Balance Statement*\n`;
            message += `Contact: ${selectedSummary.contactName}\n`;
            message += `Status: ${status}\n`;
            message += `Net Balance: *${CURRENCY} ${Math.abs(balance).toLocaleString()}*\n\n`;
            message += `This is an automated message from PBooksPro.`;

            // Find the contact to use WhatsAppService
            const contact = state.contacts.find(c => c.name === selectedSummary.contactName && c.contactNo === selectedSummary.contactNo);
            if (contact) {
                WhatsAppService.sendMessage({ contact, message });
            } else {
                // Fallback: create a temporary contact object
                const tempContact = {
                    id: '',
                    name: selectedSummary.contactName,
                    type: state.contacts.find(c => c.name === selectedSummary.contactName)?.type || 'Friend & Family' as any,
                    contactNo: selectedSummary.contactNo
                };
                WhatsAppService.sendMessage({ contact: tempContact, message });
            }
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };

    const handleExport = () => {
        if (!selectedSummary) return;
        const data = processedTransactions.map(tx => ({
            Date: formatDate(tx.date),
            Account: tx.accountName,
            Description: tx.description,
            'Give Loan': tx.give,
            'Receive Loan': tx.receive,
            Balance: tx.balance
        }));
        exportJsonToExcel(data, `loan-statement-${selectedSummary.contactName}.xlsx`, 'Loan History');
    };

    const handlePrint = () => {
        window.print();
    };

    const SortIcon = ({ active, direction }: { active: boolean, direction: SortDirection }) => (
        <span className={`ml-1 text-[10px] ${active ? 'text-accent' : 'text-slate-300'}`}>
            {active ? (direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <div className="min-h-full flex flex-col space-y-3 md:space-y-4">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 md:gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex-shrink-0 no-print">
                <div className="relative flex-grow w-full sm:w-auto sm:max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <span className="h-5 w-5">{ICONS.search}</span>
                    </div>
                    <Input 
                        placeholder="Search loans..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="pl-10"
                    />
                    {searchQuery && (
                        <button 
                            type="button" 
                            onClick={() => setSearchQuery('')} 
                            className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600"
                        >
                            <div className="w-5 h-5">{ICONS.x}</div>
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setIsReportOpen(true)}>
                        <div className="w-4 h-4 mr-2">{ICONS.barChart}</div> Analysis Report
                    </Button>
                    <Button onClick={() => setIsModalOpen(true)}>
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div> New Loan
                    </Button>
                </div>
            </div>

            <div className="flex-grow flex flex-col md:flex-row gap-4 min-h-0">
                {/* LEFT PANEL: Loan Accounts */}
                <div className="md:w-1/3 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden no-print h-64 md:h-full shrink-0">
                    <div className="p-3 border-b bg-slate-50 flex items-center justify-between font-semibold text-slate-700">
                        <span>Loan Accounts</span>
                    </div>
                    
                    {/* Sortable Header */}
                    <div className="grid grid-cols-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider select-none">
                        <div 
                            className="p-3 cursor-pointer hover:bg-slate-200 transition-colors flex items-center"
                            onClick={() => handleAccountSort('name')}
                        >
                            Name <SortIcon active={accountSort.key === 'name'} direction={accountSort.direction} />
                        </div>
                        <div 
                            className="p-3 text-right cursor-pointer hover:bg-slate-200 transition-colors flex items-center justify-end"
                            onClick={() => handleAccountSort('amount')}
                        >
                            Amount <SortIcon active={accountSort.key === 'amount'} direction={accountSort.direction} />
                        </div>
                    </div>

                    <div className="flex-grow overflow-y-auto">
                        {sortedSummaries.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">No active loans found.</div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {sortedSummaries.map(summary => (
                                    <div 
                                        key={summary.contactId} 
                                        onClick={() => setSelectedContactId(summary.contactId)}
                                        className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors grid grid-cols-2 items-center ${selectedContactId === summary.contactId ? 'bg-indigo-50 border-l-4 border-accent pl-2' : 'pl-3 border-l-4 border-transparent'}`}
                                    >
                                        <div className="font-medium text-slate-800 truncate" title={summary.contactName}>{summary.contactName}</div>
                                        <div className={`text-right font-mono font-bold tabular-nums ${summary.netBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {CURRENCY} {Math.abs(summary.netBalance).toLocaleString()}
                                            <div className="text-[10px] font-normal text-slate-400 font-sans">
                                                {summary.netBalance > 0 ? 'You Owe' : 'Owes You'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL: Transactions Detail */}
                <div className="md:w-2/3 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden printable-area flex-grow">
                    {selectedContactId ? (
                        <>
                            <div className="p-3 border-b bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3 flex-shrink-0">
                                <h3 className="font-bold text-lg text-slate-800">
                                    {selectedSummary?.contactName}
                                    <span className="text-xs font-normal text-slate-500 ml-2 no-print">Transaction History</span>
                                </h3>
                                <div className="flex gap-2 no-print">
                                    <Button variant="secondary" size="sm" onClick={handleWhatsApp} title="Send via WhatsApp" className="text-green-600 bg-green-50 hover:bg-green-100 border-green-200">
                                        <div className="w-4 h-4">{ICONS.whatsapp}</div>
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={handleExport} title="Export to Excel">
                                        <div className="w-4 h-4">{ICONS.export}</div>
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={handlePrint} title="Print Report">
                                        <div className="w-4 h-4">{ICONS.print}</div>
                                    </Button>
                                </div>
                            </div>

                            {/* Transactions Grid */}
                            <div className="flex-grow overflow-auto">
                                <table className="min-w-full divide-y divide-slate-200 text-sm relative">
                                    <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th onClick={() => handleTxSort('date')} className="px-3 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-200 select-none whitespace-nowrap">Date <SortIcon active={txSort.key === 'date'} direction={txSort.direction}/></th>
                                            <th onClick={() => handleTxSort('account')} className="px-3 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-200 select-none whitespace-nowrap">Account <SortIcon active={txSort.key === 'account'} direction={txSort.direction}/></th>
                                            <th onClick={() => handleTxSort('description')} className="px-3 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-200 select-none">Description <SortIcon active={txSort.key === 'description'} direction={txSort.direction}/></th>
                                            <th onClick={() => handleTxSort('give')} className="px-3 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-200 select-none whitespace-nowrap">Give Loan <SortIcon active={txSort.key === 'give'} direction={txSort.direction}/></th>
                                            <th onClick={() => handleTxSort('receive')} className="px-3 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-200 select-none whitespace-nowrap">Receive Loan <SortIcon active={txSort.key === 'receive'} direction={txSort.direction}/></th>
                                            <th onClick={() => handleTxSort('balance')} className="px-3 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-200 select-none whitespace-nowrap">Balance <SortIcon active={txSort.key === 'balance'} direction={txSort.direction}/></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 bg-white">
                                        {processedTransactions.map((tx) => (
                                            <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(tx.date)}</td>
                                                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{tx.accountName}</td>
                                                <td className="px-3 py-2 text-slate-600 italic max-w-xs truncate" title={tx.description}>{tx.description || '-'}</td>
                                                <td className="px-3 py-2 text-right text-rose-600 font-medium tabular-nums">
                                                    {tx.give > 0 ? tx.give.toLocaleString() : '-'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-emerald-600 font-medium tabular-nums">
                                                    {tx.receive > 0 ? tx.receive.toLocaleString() : '-'}
                                                </td>
                                                <td className={`px-3 py-2 text-right font-bold tabular-nums ${tx.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                    {Math.abs(tx.balance).toLocaleString()} <span className="font-normal text-slate-400 text-[10px]">{tx.balance > 0 ? '(Dr)' : tx.balance < 0 ? '(Cr)' : ''}</span>
                                                </td>
                                            </tr>
                                        ))}
                                        {processedTransactions.length === 0 && (
                                            <tr><td colSpan={6} className="text-center py-8 text-slate-500">No transactions found.</td></tr>
                                        )}
                                    </tbody>
                                    {/* Summary Footer */}
                                    <tfoot className="bg-slate-100 font-bold sticky bottom-0 z-10 border-t border-slate-300">
                                        <tr>
                                            <td colSpan={3} className="px-3 py-3 text-right">Totals</td>
                                            <td className="px-3 py-3 text-right text-rose-700 tabular-nums">{transactionTotals.totalGive.toLocaleString()}</td>
                                            <td className="px-3 py-3 text-right text-emerald-700 tabular-nums">{transactionTotals.totalReceive.toLocaleString()}</td>
                                            <td className={`px-3 py-3 text-right tabular-nums ${transactionTotals.net > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                                                {CURRENCY} {Math.abs(transactionTotals.net).toLocaleString()} <span className="font-normal text-slate-400 text-[10px]">{transactionTotals.net > 0 ? '(Dr)' : '(Cr)'}</span>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="flex-grow flex items-center justify-center text-slate-400 bg-slate-50/30">
                            <p>Select a contact to view loan history.</p>
                        </div>
                    )}
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record Loan Transaction">
                <TransactionForm 
                    onClose={() => setIsModalOpen(false)} 
                    transactionTypeForNew={TransactionType.LOAN}
                    onShowDeleteWarning={() => {}}
                />
            </Modal>

            <Modal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} title="Loan Analysis" size="xl">
                <div className="h-[80vh]">
                    <LoanAnalysisReport />
                    <div className="flex justify-end p-4 border-t">
                        <Button variant="secondary" onClick={() => setIsReportOpen(false)}>Close</Button>
                    </div>
                </div>
            </Modal>
            
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .printable-area, .printable-area * { visibility: visible; }
                    .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: 9999; background: white; }
                    .no-print { display: none !important; }
                }
            `}</style>
        </div>
    );
};

export default LoanManagementPage;
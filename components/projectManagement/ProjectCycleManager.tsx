
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { AccountType, TransactionType, Transaction } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { CURRENCY, ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import Tabs from '../ui/Tabs';

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

const ProjectCycleManager: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast, showAlert } = useNotification();
    const [activeTab, setActiveTab] = useState('Profit Distribution');

    // --- SHARED STATE ---
    const equityAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.EQUITY), [state.accounts]);
    const bankAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK), [state.accounts]);

    // --- PROFIT DISTRIBUTION STATE ---
    const [distProjectId, setDistProjectId] = useState<string>('');
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

    // --- PROFIT DISTRIBUTION LOGIC ---
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
                if (isEquityCategory) {
                    distributed += tx.amount;
                } else {
                    operatingExpense += tx.amount;
                }
            }

            if (tx.type === TransactionType.TRANSFER) {
                const toEquity = equityAccounts.find(a => a.id === tx.toAccountId);
                const fromEquity = equityAccounts.find(a => a.id === tx.fromAccountId);
                const fromAccount = state.accounts.find(a => a.id === tx.fromAccountId);
                
                const isFromClearing = fromAccount?.name === 'Internal Clearing';
                const isDivestment = tx.description && tx.description.includes('Equity Move out');

                if (fromEquity && !toEquity) { 
                    investedCapital += tx.amount;
                } else if (toEquity && !fromEquity) { 
                    if (isFromClearing && !isDivestment) {
                        investedCapital += tx.amount;
                    } else {
                         investedCapital -= tx.amount;
                    }
                }
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
            const fromAccount = state.accounts.find(a => a.id === tx.fromAccountId);
            const isFromClearing = fromAccount?.name === 'Internal Clearing';
            const isDivestment = tx.description && tx.description.includes('Equity Move out');

            if (fromEquity && !toEquity) {
                investorCapital[fromEquity.id] = (investorCapital[fromEquity.id] || 0) + tx.amount;
            } else if (toEquity && !fromEquity) {
                if (isFromClearing && !isDivestment) {
                     investorCapital[toEquity.id] = (investorCapital[toEquity.id] || 0) + tx.amount;
                } else {
                     investorCapital[toEquity.id] = (investorCapital[toEquity.id] || 0) - tx.amount;
                }
            }
        });

        const totalCapital = Object.values(investorCapital).reduce((sum, val) => sum + val, 0);
        const profitToDistribute = distProfit ? parseFloat(distProfit) : projectFinancials.available;

        if (totalCapital <= 0) {
             showAlert("No Active equity capital found for this project.");
             return;
        }

        const calculatedDistributions: InvestorDistribution[] = Object.entries(investorCapital)
            .filter(([_, amount]) => amount > 0)
            .map(([investorId, amount]) => {
                const acc = state.accounts.find(a => a.id === investorId);
                const share = amount / totalCapital;
                const profit = profitToDistribute * share;

                return {
                    investorId,
                    investorName: acc?.name || 'Unknown Investor',
                    principal: amount,
                    sharePercentage: share,
                    profitShare: profit,
                    newEquityBalance: (acc?.balance || 0) + profit 
                };
            });
            
        setDistributions(calculatedDistributions);
        setDistProfit(profitToDistribute.toString());
        setDistStep(2);
    };

    const handleDistCommit = async () => {
        const confirm = await showConfirm(
            `Distribute ${CURRENCY} ${parseFloat(distProfit).toLocaleString()} profit to investors?\n\nThis will move funds from Project Profit to Investor Equity.`,
            { title: "Confirm Distribution (Step 1)" }
        );
        if (!confirm) return;

        let clearingAcc = state.accounts.find(a => a.name === 'Internal Clearing');
        if (!clearingAcc) {
            clearingAcc = {
                id: `sys-acc-clearing-${Date.now()}`,
                name: 'Internal Clearing',
                type: AccountType.BANK,
                balance: 0,
                description: 'System account for equity transfers',
                isPermanent: true
            };
            dispatch({ type: 'ADD_ACCOUNT', payload: clearingAcc });
        }

        const timestamp = Date.now();
        const batchId = `dist-cycle-${timestamp}`;
        const transactions: Transaction[] = [];

        let profitExpCat = state.categories.find(c => c.name === 'Owner Equity' && c.type === TransactionType.EXPENSE);
        if (!profitExpCat) {
             profitExpCat = state.categories.find(c => c.name === 'Profit Share' || c.name === 'Dividend');
             if (!profitExpCat) {
                 profitExpCat = state.categories.find(c => c.name === 'Owner Withdrawn') || state.categories.find(c=>c.type === TransactionType.EXPENSE)!;
             }
        }

        distributions.forEach(dist => {
            transactions.push({
                id: `prof-exp-${timestamp}-${dist.investorId}`,
                type: TransactionType.EXPENSE,
                amount: dist.profitShare,
                date: new Date().toISOString().split('T')[0],
                description: `Profit Distribution: ${cycleName}`,
                accountId: clearingAcc!.id, 
                categoryId: profitExpCat?.id,
                projectId: distProjectId,
                contactId: undefined, 
                batchId
            });

            transactions.push({
                id: `prof-inc-${timestamp}-${dist.investorId}`,
                type: TransactionType.TRANSFER,
                amount: dist.profitShare,
                date: new Date().toISOString().split('T')[0],
                description: `Profit Share: ${cycleName}`,
                accountId: dist.investorId,
                fromAccountId: clearingAcc!.id,
                toAccountId: dist.investorId,
                projectId: distProjectId, 
                batchId
            });
        });

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
        showToast("Profit Distributed to Equity Accounts.", "success");
        setDistStep(1);
        setDistProfit('');
        setDistributions([]);
    };

    // --- EQUITY TRANSFER LOGIC ---
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

        if (rows.length === 0) {
            showAlert("No positive equity found to transfer for this project.");
            return;
        }

        setTransferRows(rows);
        setTransferStep(2);
        setTransferType('PROJECT');
    };

    const handleTransferCommit = async () => {
        const selectedTransfers = transferRows.filter(r => r.isSelected && parseFloat(r.transferAmount) > 0);
        if (selectedTransfers.length === 0) return;

        const sourceProjectName = state.projects.find(p => p.id === sourceProjectId)?.name;
        
        let confirmMessage = '';
        if (transferType === 'PROJECT') {
            if (!destProjectId) { await showAlert("Please select a destination project."); return; }
            const destProjectName = state.projects.find(p => p.id === destProjectId)?.name;
            confirmMessage = `Transfer equity for ${selectedTransfers.length} investors from "${sourceProjectName}" to "${destProjectName}"?`;
        } else {
            if (!payoutAccountId) { await showAlert("Please select a payment account."); return; }
            const accountName = state.accounts.find(a => a.id === payoutAccountId)?.name;
            const totalAmount = selectedTransfers.reduce((sum, r) => sum + parseFloat(r.transferAmount), 0);
            confirmMessage = `Pay out ${CURRENCY} ${totalAmount.toLocaleString()} to ${selectedTransfers.length} investors from "${accountName}"?`;
        }

        const confirm = await showConfirm(confirmMessage, { title: transferType === 'PROJECT' ? "Confirm Equity Transfer" : "Confirm Investor Payout" });
        if (!confirm) return;

        const timestamp = Date.now();
        const transactions: Transaction[] = [];
        
        let clearingAcc = state.accounts.find(a => a.name === 'Internal Clearing');
        if (transferType === 'PROJECT' && !clearingAcc) {
            clearingAcc = {
                id: `sys-acc-clearing-${Date.now()}`,
                name: 'Internal Clearing',
                type: AccountType.BANK, 
                balance: 0,
                description: 'System account for equity transfers',
                isPermanent: true
            };
            dispatch({ type: 'ADD_ACCOUNT', payload: clearingAcc });
        }

        selectedTransfers.forEach(row => {
            const amount = parseFloat(row.transferAmount);
            if (transferType === 'PROJECT') {
                transactions.push({
                    id: `divest-${timestamp}-${row.investorId}`,
                    type: TransactionType.TRANSFER,
                    amount: amount,
                    date: new Date().toISOString().split('T')[0],
                    description: `Equity Move out of ${sourceProjectName}`, 
                    accountId: clearingAcc!.id, 
                    fromAccountId: clearingAcc!.id, 
                    toAccountId: row.investorId,
                    projectId: sourceProjectId,
                    batchId: `eq-move-${timestamp}`
                });
                transactions.push({
                    id: `invest-${timestamp}-${row.investorId}`,
                    type: TransactionType.TRANSFER,
                    amount: amount,
                    date: new Date().toISOString().split('T')[0],
                    description: `Equity Move in to ${state.projects.find(p => p.id === destProjectId)?.name}`,
                    accountId: row.investorId,
                    fromAccountId: row.investorId, 
                    toAccountId: clearingAcc!.id,
                    projectId: destProjectId,
                    batchId: `eq-move-${timestamp}`
                });
            } else {
                transactions.push({
                    id: `payout-${timestamp}-${row.investorId}`,
                    type: TransactionType.TRANSFER,
                    amount: amount,
                    date: new Date().toISOString().split('T')[0],
                    description: `Capital Payout from ${sourceProjectName}`, 
                    accountId: payoutAccountId,
                    fromAccountId: payoutAccountId,
                    toAccountId: row.investorId,
                    projectId: sourceProjectId,
                    batchId: `eq-payout-${timestamp}`
                });
            }
        });

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
        showToast(transferType === 'PROJECT' ? "Equity transferred successfully." : "Payouts recorded successfully.", "success");
        setTransferStep(1);
        setTransferRows([]);
    };

    return (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">{ICONS.repeat}</div>
                    Project Cycle Manager
                </h2>
            </div>
            
            <div className="mb-6">
                <Tabs 
                    tabs={['Profit Distribution', 'Equity Transfer']} 
                    activeTab={activeTab} 
                    onTabClick={setActiveTab} 
                />
            </div>

            {activeTab === 'Profit Distribution' && (
                <>
                    {distStep === 1 && (
                        <div className="space-y-6 max-w-3xl">
                            <div className="space-y-4">
                                <ComboBox label="Select Project" items={state.projects} selectedId={distProjectId} onSelect={(item) => setDistProjectId(item?.id || '')} placeholder="Choose a project..." allowAddNew={false} />
                                
                                {distProjectId && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase font-bold">Invested Capital</p>
                                            <p className="text-lg font-bold text-slate-800">{CURRENCY} {projectFinancials.investedCapital.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase font-bold">Net Operating Profit</p>
                                            <p className="text-lg font-bold text-emerald-600">{CURRENCY} {projectFinancials.netOperating.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase font-bold text-amber-700">Already Distributed</p>
                                            <p className="text-lg font-bold text-amber-600">{CURRENCY} {projectFinancials.distributed.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-white rounded border border-slate-200 p-2 shadow-sm">
                                            <p className="text-xs text-slate-500 uppercase font-bold">Available to Distribute</p>
                                            <p className={`text-xl font-black ${projectFinancials.available >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                                                {CURRENCY} {projectFinancials.available.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input label="Cycle Name" value={cycleName} onChange={e => setCycleName(e.target.value)} />
                                    <Input 
                                        label="Profit to Distribute (Step 1)" 
                                        type="number" 
                                        value={distProfit} 
                                        onChange={e => setDistProfit(e.target.value)} 
                                        placeholder={projectFinancials.available > 0 ? projectFinancials.available.toString() : "0"} 
                                        helperText="Moving this amount to Investor Equity accounts."
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button onClick={handleCalculateDistShares} disabled={!distProjectId || !distProfit || parseFloat(distProfit) <= 0}>Next: Calculate Shares</Button>
                            </div>
                        </div>
                    )}
                    {distStep === 2 && (
                        <div className="flex flex-col h-full overflow-hidden space-y-4">
                            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div>
                                    <span className="font-bold text-slate-700 block">Distributing {CURRENCY} {parseFloat(distProfit).toLocaleString()}</span>
                                    <span className="text-xs text-slate-500">This will credit investor equity accounts. Cash remains in company until withdrawn/transferred.</span>
                                </div>
                                <Button variant="secondary" size="sm" onClick={() => setDistStep(1)}>Back</Button>
                            </div>
                            <div className="flex-grow overflow-auto border rounded-lg shadow-sm">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Investor</th>
                                            <th className="px-4 py-3 text-right">Principal</th>
                                            <th className="px-4 py-3 text-right">Share %</th>
                                            <th className="px-4 py-3 text-right">Profit Share</th>
                                            <th className="px-4 py-3 text-right">New Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {distributions.map((dist) => (
                                            <tr key={dist.investorId}>
                                                <td className="px-4 py-3 font-medium">{dist.investorName}</td>
                                                <td className="px-4 py-3 text-right text-slate-600">{CURRENCY} {dist.principal.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-slate-500">{(dist.sharePercentage * 100).toFixed(2)}%</td>
                                                <td className="px-4 py-3 text-right font-bold text-emerald-600">{CURRENCY} {dist.profitShare.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                                                <td className="px-4 py-3 text-right text-indigo-600 font-medium">{CURRENCY} {dist.newEquityBalance.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex justify-end pt-4">
                                <Button onClick={handleDistCommit} className="bg-emerald-600 hover:bg-emerald-700">Confirm Distribution</Button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'Equity Transfer' && (
                <>
                    {transferStep === 1 && (
                        <div className="space-y-6 max-w-2xl">
                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                                Move equity (Principal + Distributed Profit) from one project to another OR pay out to investors.
                            </div>
                            <ComboBox label="Source Project (Move From)" items={state.projects} selectedId={sourceProjectId} onSelect={(item) => setSourceProjectId(item?.id || '')} placeholder="Select Source Project" allowAddNew={false} />
                            
                            <div className="flex justify-end">
                                <Button onClick={handleCalculateTransferData} disabled={!sourceProjectId}>Next: Select Investors</Button>
                            </div>
                        </div>
                    )}

                    {transferStep === 2 && (
                        <div className="flex flex-col h-full overflow-hidden space-y-4">
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Action Type</label>
                                <div className="flex gap-4 mb-3">
                                    <label className="flex items-center cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="transferType" 
                                            checked={transferType === 'PROJECT'} 
                                            onChange={() => setTransferType('PROJECT')} 
                                            className="text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="ml-2 text-sm font-medium text-slate-700">Transfer to Another Project</span>
                                    </label>
                                    <label className="flex items-center cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="transferType" 
                                            checked={transferType === 'PAYOUT'} 
                                            onChange={() => setTransferType('PAYOUT')}
                                            className="text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <span className="ml-2 text-sm font-medium text-slate-700">Pay Out to Investor (Cash/Bank)</span>
                                    </label>
                                </div>
                                
                                {transferType === 'PROJECT' ? (
                                    <div className="w-full md:w-1/2">
                                         <label className="block text-sm font-medium text-slate-700 mb-1">Destination Project</label>
                                         <ComboBox label="" items={state.projects.filter(p => p.id !== sourceProjectId)} selectedId={destProjectId} onSelect={(item) => setDestProjectId(item?.id || '')} placeholder="Select Target Project" allowAddNew={false} />
                                    </div>
                                ) : (
                                    <div className="w-full md:w-1/2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Pay From Account</label>
                                        <ComboBox label="" items={bankAccounts} selectedId={payoutAccountId} onSelect={(item) => setPayoutAccountId(item?.id || '')} placeholder="Select Bank/Cash Account" allowAddNew={false} />
                                    </div>
                                )}
                            </div>

                            <div className="flex-grow overflow-auto border rounded-lg shadow-sm">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 w-10"><input type="checkbox" checked={transferRows.every(r => r.isSelected)} onChange={(e) => setTransferRows(prev => prev.map(r => ({...r, isSelected: e.target.checked})))} /></th>
                                            <th className="px-4 py-3 text-left">Investor</th>
                                            <th className="px-4 py-3 text-right">Current Equity</th>
                                            <th className="px-4 py-3 text-right">{transferType === 'PROJECT' ? 'Transfer Amount' : 'Payout Amount'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {transferRows.map((row, idx) => (
                                            <tr key={row.investorId} className={row.isSelected ? 'bg-indigo-50/30' : ''}>
                                                <td className="px-4 py-3 text-center">
                                                    <input type="checkbox" checked={row.isSelected} onChange={() => {
                                                        const newRows = [...transferRows];
                                                        newRows[idx].isSelected = !newRows[idx].isSelected;
                                                        setTransferRows(newRows);
                                                    }} />
                                                </td>
                                                <td className="px-4 py-3 font-medium">{row.investorName}</td>
                                                <td className="px-4 py-3 text-right text-slate-600">{CURRENCY} {row.currentEquity.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <input 
                                                        type="number" 
                                                        className="w-32 text-right border rounded px-2 py-1 font-bold text-indigo-700"
                                                        value={row.transferAmount}
                                                        onChange={(e) => {
                                                            const newRows = [...transferRows];
                                                            newRows[idx].transferAmount = e.target.value;
                                                            setTransferRows(newRows);
                                                        }}
                                                        disabled={!row.isSelected}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t">
                                <div className="text-sm font-medium text-slate-600">
                                    <Button variant="secondary" onClick={() => { setTransferStep(1); setTransferRows([]); }} className="mr-4">Back</Button>
                                    Total: <span className="text-indigo-600 font-bold">{CURRENCY} {transferRows.filter(r => r.isSelected).reduce((sum, r) => sum + (parseFloat(r.transferAmount)||0), 0).toLocaleString()}</span>
                                </div>
                                <Button onClick={handleTransferCommit} className={transferType === 'PROJECT' ? "bg-indigo-600 hover:bg-indigo-700" : "bg-emerald-600 hover:bg-emerald-700"}>
                                    {transferType === 'PROJECT' ? 'Confirm Transfer' : 'Confirm Payout'}
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ProjectCycleManager;

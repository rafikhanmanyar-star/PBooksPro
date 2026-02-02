
import React, { useState } from 'react';
import { AccountingProvider, useAccounting } from '../../context/AccountingContext';
import AccountingDashboard from './accounting/AccountingDashboard';
import ChartOfAccounts from './accounting/ChartOfAccounts';
import GeneralLedger from './accounting/GeneralLedger';
import FinancialStatements from './accounting/FinancialStatements';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

const AccountingContent: React.FC = () => {
    const { accounts, postJournalEntry } = useAccounting();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'coa' | 'ledger' | 'statements'>('dashboard');
    const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);

    const [journalData, setJournalData] = useState({
        date: new Date().toISOString().split('T')[0],
        reference: '',
        description: '',
        lines: [
            { accountId: '', description: '', debit: 0, credit: 0 },
            { accountId: '', description: '', debit: 0, credit: 0 }
        ]
    });

    const handleAddLine = () => {
        setJournalData(prev => ({
            ...prev,
            lines: [...prev.lines, { accountId: '', description: '', debit: 0, credit: 0 }]
        }));
    };

    const handleLineChange = (index: number, field: string, value: any) => {
        const newLines = [...journalData.lines];
        newLines[index] = { ...newLines[index], [field]: value };
        setJournalData(prev => ({ ...prev, lines: newLines }));
    };

    const handleRemoveLine = (index: number) => {
        if (journalData.lines.length <= 2) return;
        setJournalData(prev => ({
            ...prev,
            lines: prev.lines.filter((_, i) => i !== index)
        }));
    };

    const totalDebit = journalData.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const totalCredit = journalData.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

    const handlePostJournal = async () => {
        if (!isBalanced) {
            alert("Journal entry must be balanced!");
            return;
        }

        try {
            await postJournalEntry({
                date: journalData.date,
                reference: journalData.reference,
                description: journalData.description,
                lines: journalData.lines.map(l => {
                    const acc = accounts.find(a => a.id === l.accountId);
                    return {
                        accountId: l.accountId,
                        accountName: acc ? acc.name : 'Unknown',
                        description: l.description || journalData.description,
                        debit: Number(l.debit),
                        credit: Number(l.credit)
                    };
                }),
                sourceModule: 'Manual'
            });
            setIsJournalModalOpen(false);
            setJournalData({
                date: new Date().toISOString().split('T')[0],
                reference: '',
                description: '',
                lines: [
                    { accountId: '', description: '', debit: 0, credit: 0 },
                    { accountId: '', description: '', debit: 0, credit: 0 }
                ]
            });
        } catch (e) {
            alert('Error posting journal entry');
        }
    };

    const tabs = [
        { id: 'dashboard', label: 'Finance Dashboard', icon: ICONS.barChart },
        { id: 'coa', label: 'Chart of Accounts', icon: ICONS.list },
        { id: 'ledger', label: 'General Ledger', icon: ICONS.clipboard },
        { id: 'statements', label: 'Financial Statements', icon: ICONS.fileText },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50 -m-4 md:-m-8">
            {/* Header / Tab Navigation */}
            <div className="bg-white border-b border-slate-200 px-8 pt-6 shadow-sm z-10">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Financial Engine</h1>
                        <p className="text-slate-500 text-sm font-medium">POS source-of-truth automated accounting.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsJournalModalOpen(true)}
                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-200 hover:bg-black transition-all flex items-center gap-2 uppercase tracking-widest text-[10px]"
                        >
                            {ICONS.plus} Manual Journal
                        </button>
                    </div>
                </div>

                <div className="flex gap-8">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === tab.id
                                ? 'text-indigo-600'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<any>, { width: 18, height: 18 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
                {activeTab === 'dashboard' && <AccountingDashboard />}
                {activeTab === 'coa' && <ChartOfAccounts />}
                {activeTab === 'ledger' && <GeneralLedger />}
                {activeTab === 'statements' && <FinancialStatements />}
            </div>

            <Modal
                isOpen={isJournalModalOpen}
                onClose={() => setIsJournalModalOpen(false)}
                title="New Manual Journal Entry"
                size="xl"
            >
                <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label="Date"
                            type="date"
                            value={journalData.date}
                            onChange={(e) => setJournalData(prev => ({ ...prev, date: e.target.value }))}
                        />
                        <Input
                            label="Reference #"
                            placeholder="e.g. ADJ-001"
                            value={journalData.reference}
                            onChange={(e) => setJournalData(prev => ({ ...prev, reference: e.target.value }))}
                        />
                        <Input
                            label="Description"
                            placeholder="Reason for entry..."
                            value={journalData.description}
                            onChange={(e) => setJournalData(prev => ({ ...prev, description: e.target.value }))}
                        />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-slate-100 text-[10px] uppercase font-black text-slate-500">
                                <tr>
                                    <th className="px-4 py-3 w-[30%]">Account</th>
                                    <th className="px-4 py-3 w-[30%]">Description</th>
                                    <th className="px-4 py-3 w-[15%] text-right">Debit</th>
                                    <th className="px-4 py-3 w-[15%] text-right">Credit</th>
                                    <th className="px-4 py-3 w-[5%]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {journalData.lines.map((line, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2">
                                            <Select
                                                value={line.accountId}
                                                onChange={(e) => handleLineChange(idx, 'accountId', e.target.value)}
                                                className="border-none bg-transparent focus:ring-0 text-xs font-bold w-full"
                                                hideIcon
                                            >
                                                <option value="">Select Account</option>
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                                                ))}
                                            </Select>
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                placeholder="Line description"
                                                className="w-full bg-transparent border-none text-xs focus:ring-0 placeholder-slate-300"
                                                value={line.description}
                                                onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                className="w-full bg-transparent border-none text-right font-mono text-sm focus:ring-0"
                                                value={line.debit}
                                                onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                className="w-full bg-transparent border-none text-right font-mono text-sm focus:ring-0"
                                                value={line.credit}
                                                onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button
                                                onClick={() => handleRemoveLine(idx)}
                                                className="text-slate-300 hover:text-rose-500 transition-colors"
                                                disabled={journalData.lines.length <= 2}
                                            >
                                                {ICONS.x}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold text-xs border-t border-slate-200">
                                <tr>
                                    <td colSpan={2} className="px-4 py-3">
                                        <button
                                            onClick={handleAddLine}
                                            className="text-indigo-600 hover:underline flex items-center gap-1"
                                        >
                                            {ICONS.plus} Add Line
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{totalDebit.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right font-mono">{totalCredit.toFixed(2)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className={`text-sm font-bold ${isBalanced ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {isBalanced ? 'Balanced' : `Unbalanced Difference: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={() => setIsJournalModalOpen(false)}>Cancel</Button>
                            <Button onClick={handlePostJournal} disabled={!isBalanced || journalData.lines.some(l => !l.accountId)}>
                                Post Journal
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const AccountingPage: React.FC = () => {
    return <AccountingContent />;
};

export default AccountingPage;

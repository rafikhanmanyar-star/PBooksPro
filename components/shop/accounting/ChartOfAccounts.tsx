
import React, { useState } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Button from '../../ui/Button';

const ChartOfAccounts: React.FC = () => {
    const { accounts, createAccount } = useAccounting();
    const [filter, setFilter] = useState<string>('All');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newAccount, setNewAccount] = useState({
        code: '',
        name: '',
        type: 'Asset' as any,
        description: '',
        isControlAccount: false
    });

    const handleCreate = async () => {
        try {
            await createAccount({
                ...newAccount,
                balance: 0,
                isActive: true
            });
            setIsModalOpen(false);
            setNewAccount({ code: '', name: '', type: 'Asset', description: '', isControlAccount: false });
        } catch (e) {
            alert('Failed to create account');
        }
    };

    const categories = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];

    const filteredAccounts = filter === 'All'
        ? accounts
        : accounts.filter(a => a.type === filter);

    return (
        <div className="space-y-6 animate-fade-in shadow-inner h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2 p-1 bg-white border border-slate-200 rounded-xl">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setFilter(cat)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === cat
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {cat}s
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                >
                    {ICONS.plus} New Account
                </button>
            </div>

            <Card className="border-none shadow-sm overflow-hidden flex-1 flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Account Code</th>
                                <th className="px-6 py-4">Account Name</th>
                                <th className="px-6 py-4">Category</th>
                                <th className="px-6 py-4 text-right">Current Balance ({CURRENCY})</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredAccounts.map(acc => (
                                <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="font-mono font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded text-xs">{acc.code}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800 text-sm">{acc.name}</div>
                                        {acc.isControlAccount && (
                                            <div className="text-[10px] text-indigo-500 font-black uppercase tracking-tighter">Control Account</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${acc.type === 'Asset' ? 'bg-emerald-100 text-emerald-600' :
                                            acc.type === 'Liability' ? 'bg-rose-100 text-rose-600' :
                                                acc.type === 'Income' ? 'bg-indigo-100 text-indigo-600' :
                                                    'bg-slate-100 text-slate-600'
                                            }`}>
                                            {acc.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-sm font-black text-slate-800 font-mono">
                                            {acc.balance.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                            <span className="text-[10px] font-bold text-emerald-600 uppercase">Active</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                                            {ICONS.edit}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Create New Account"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Account Code"
                            placeholder="e.g. 1001"
                            value={newAccount.code}
                            onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
                        />
                        <Select
                            label="Account Type"
                            value={newAccount.type}
                            onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value as any })}
                        >
                            <option value="Asset">Asset</option>
                            <option value="Liability">Liability</option>
                            <option value="Equity">Equity</option>
                            <option value="Income">Income</option>
                            <option value="Expense">Expense</option>
                        </Select>
                    </div>
                    <Input
                        label="Account Name"
                        placeholder="e.g. Petty Cash"
                        value={newAccount.name}
                        onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                    />
                    <Input
                        label="Description"
                        placeholder="Optional description"
                        value={newAccount.description}
                        onChange={(e) => setNewAccount({ ...newAccount, description: e.target.value })}
                    />

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="isControl"
                            checked={newAccount.isControlAccount}
                            onChange={(e) => setNewAccount({ ...newAccount, isControlAccount: e.target.checked })}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="isControl" className="text-sm text-slate-600 font-medium">Control Account (System use)</label>
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={!newAccount.code || !newAccount.name}>Create Account</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ChartOfAccounts;

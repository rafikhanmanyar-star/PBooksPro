import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { CURRENCY } from '../../constants';

const FixMissingProjectIds: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Find transactions without projectId
    const transactionsWithoutProject = useMemo(() => {
        return state.transactions.filter(tx => !tx.projectId);
    }, [state.transactions]);

    // Find expense transactions without projectId
    const expenseTransactionsWithoutProject = useMemo(() => {
        return transactionsWithoutProject.filter(tx => tx.type === TransactionType.EXPENSE);
    }, [transactionsWithoutProject]);

    const selectedProject = state.projects.find(p => p.id === selectedProjectId);

    const handleAssignProject = () => {
        if (!selectedProjectId) {
            alert('Please select a project first');
            return;
        }

        const confirmed = confirm(
            `This will assign project "${selectedProject?.name}" to ${transactionsWithoutProject.length} transaction(s) that currently have no project.\n\n` +
            `Are you sure you want to proceed?`
        );

        if (!confirmed) return;

        setIsProcessing(true);

        try {
            // Update each transaction to add the projectId
            transactionsWithoutProject.forEach(tx => {
                dispatch({
                    type: 'UPDATE_TRANSACTION',
                    payload: {
                        ...tx,
                        projectId: selectedProjectId
                    }
                });
            });

            alert(`Successfully assigned project to ${transactionsWithoutProject.length} transaction(s)!`);
            setSelectedProjectId('');
        } catch (error) {
            console.error('Error assigning project:', error);
            alert('Error assigning project. Check console for details.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <h2 className="text-xl font-bold text-slate-800 mb-4">Fix Missing Project IDs</h2>
                <p className="text-sm text-slate-600 mb-4">
                    This tool helps you assign a project to transactions that don't have one.
                </p>

                {/* Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-slate-50 p-4 rounded-lg">
                        <p className="text-xs text-slate-600 font-bold uppercase">Total Transactions</p>
                        <p className="text-2xl font-bold text-slate-800">{state.transactions.length}</p>
                    </div>

                    <div className={`p-4 rounded-lg ${transactionsWithoutProject.length > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
                        <p className={`text-xs font-bold uppercase ${transactionsWithoutProject.length > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                            Without Project
                        </p>
                        <p className={`text-2xl font-bold ${transactionsWithoutProject.length > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                            {transactionsWithoutProject.length}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                            ({expenseTransactionsWithoutProject.length} expenses)
                        </p>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-xs text-blue-600 font-bold uppercase">Available Projects</p>
                        <p className="text-2xl font-bold text-blue-800">{state.projects.length}</p>
                    </div>
                </div>

                {transactionsWithoutProject.length === 0 ? (
                    <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-center">
                        <p className="text-green-800 font-semibold">✅ All transactions have projects assigned!</p>
                        <p className="text-sm text-green-700 mt-2">No action needed.</p>
                    </div>
                ) : (
                    <>
                        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-4">
                            <p className="text-yellow-800 font-semibold">⚠️ Found {transactionsWithoutProject.length} transaction(s) without a project</p>
                            <p className="text-sm text-yellow-700 mt-2">
                                These transactions won't appear in project-specific budget reports.
                            </p>
                        </div>

                        {/* Transaction Preview */}
                        <div className="mb-6">
                            <h3 className="font-semibold text-slate-800 mb-3">Sample Transactions (first 10)</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100">
                                        <tr>
                                            <th className="text-left p-2">Date</th>
                                            <th className="text-left p-2">Type</th>
                                            <th className="text-left p-2">Description</th>
                                            <th className="text-right p-2">Amount</th>
                                            <th className="text-left p-2">Category</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactionsWithoutProject.slice(0, 10).map(tx => {
                                            const category = state.categories.find(c => c.id === tx.categoryId);
                                            return (
                                                <tr key={tx.id} className="border-b hover:bg-slate-50">
                                                    <td className="p-2">{tx.date}</td>
                                                    <td className="p-2">
                                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                                            tx.type === TransactionType.EXPENSE ? 'bg-red-100 text-red-800' :
                                                            tx.type === TransactionType.INCOME ? 'bg-green-100 text-green-800' :
                                                            'bg-blue-100 text-blue-800'
                                                        }`}>
                                                            {tx.type}
                                                        </span>
                                                    </td>
                                                    <td className="p-2">{tx.description || '(no description)'}</td>
                                                    <td className="text-right p-2 font-semibold">{CURRENCY} {Number(tx.amount).toLocaleString()}</td>
                                                    <td className="p-2">{category?.name || '(no category)'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {transactionsWithoutProject.length > 10 && (
                                <p className="text-sm text-slate-500 mt-2 text-center">
                                    ... and {transactionsWithoutProject.length - 10} more
                                </p>
                            )}
                        </div>

                        {/* Assignment Form */}
                        <div className="bg-white border-2 border-indigo-200 p-4 rounded-lg">
                            <h3 className="font-semibold text-slate-800 mb-4">Assign All to a Project</h3>
                            
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Select Project
                                </label>
                                <Select
                                    value={selectedProjectId}
                                    onChange={(e) => setSelectedProjectId(e.target.value)}
                                    disabled={isProcessing}
                                >
                                    <option value="">Choose a project...</option>
                                    {state.projects.map(project => (
                                        <option key={project.id} value={project.id}>
                                            {project.name}
                                        </option>
                                    ))}
                                </Select>
                            </div>

                            <Button
                                onClick={handleAssignProject}
                                disabled={!selectedProjectId || isProcessing}
                                variant="primary"
                            >
                                {isProcessing ? 'Processing...' : `Assign Project to ${transactionsWithoutProject.length} Transaction(s)`}
                            </Button>

                            <div className="mt-4 p-3 bg-slate-50 rounded text-sm text-slate-600">
                                <p className="font-semibold mb-2">⚠️ Important:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>This will assign the selected project to ALL {transactionsWithoutProject.length} transaction(s)</li>
                                    <li>If you need more granular control, use the General Ledger to edit individual transactions</li>
                                    <li>Create a backup before making bulk changes</li>
                                </ul>
                            </div>
                        </div>
                    </>
                )}
            </Card>

            {/* Instructions */}
            <Card>
                <h3 className="text-lg font-bold text-slate-800 mb-4">Alternative: Manual Assignment</h3>
                <div className="text-sm text-slate-600 space-y-2">
                    <p>If you prefer to assign projects manually:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Go to <strong>General Ledger</strong> page</li>
                        <li>Find the transactions you want to assign</li>
                        <li>Click <strong>Edit</strong> on each transaction</li>
                        <li>Select the appropriate <strong>Project</strong> from the dropdown</li>
                        <li>Save the transaction</li>
                    </ol>
                </div>
            </Card>
        </div>
    );
};

export default FixMissingProjectIds;


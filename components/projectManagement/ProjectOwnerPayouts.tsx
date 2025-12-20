
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, TransactionType, ProjectAgreementStatus } from '../../types';
import { CURRENCY } from '../../constants';
import ProjectOwnerPayoutModal from './ProjectOwnerPayoutModal';
import Card from '../ui/Card';
import Button from '../ui/Button';
import OwnerLedger from '../payouts/OwnerLedger'; 
// Reusing ClientLedgerReport logic for display would be ideal, but for now assume OwnerLedger logic or we can import the ClientLedgerReport directly if we want the full view.
// Given the structure, we will stick to the generic OwnerLedger for simplicity or create a specific one if needed. 
// Actually, for Project Payouts, we should use the Project-specific ledger view logic.
import ClientLedgerReport from '../reports/ClientLedgerReport'; // We can't embed a full page easily, so let's keep the simple view or just show the balance.
import { formatDate } from '../../utils/dateUtils';

interface ClientFinancials {
    clientId: string;
    clientName: string;
    totalPaidIn: number; // Income received from client
    totalRefunded: number; // Expenses paid to client
    totalPenalty: number; // Penalty deducted
    netBalance: number; // (PaidIn - Refunded - Penalty)
}

const ProjectOwnerPayouts: React.FC = () => {
    const { state } = useAppContext();
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const clientFinancials = useMemo<ClientFinancials[]>(() => {
        const clientData: { [id: string]: { paidIn: number; refunded: number; penalty: number; hasCancelledAgreement: boolean } } = {};

        // 1. Identify Clients with Cancelled Agreements
        state.projectAgreements.forEach(pa => {
            if (pa.status === ProjectAgreementStatus.CANCELLED) {
                if (!clientData[pa.clientId]) {
                    clientData[pa.clientId] = { paidIn: 0, refunded: 0, penalty: 0, hasCancelledAgreement: true };
                } else {
                    clientData[pa.clientId].hasCancelledAgreement = true;
                }
                
                // Accumulate Penalty
                if (pa.cancellationDetails?.penaltyAmount) {
                    clientData[pa.clientId].penalty += pa.cancellationDetails.penaltyAmount;
                }
            }
        });

        const relevantClientIds = Object.keys(clientData); // Only those with cancelled agreements

        // 2. Calculate Income (Payments from these Clients)
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.INCOME && tx.contactId && clientData[tx.contactId]) {
                clientData[tx.contactId].paidIn += tx.amount;
            }
        });

        // 3. Calculate Expenses (Refunds/Returns to these Clients)
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.contactId && clientData[tx.contactId]) {
                clientData[tx.contactId].refunded += tx.amount;
            }
        });

        return relevantClientIds.map(clientId => {
            const client = state.contacts.find(c => c.id === clientId);
            const data = clientData[clientId];
            const netBalance = data.paidIn - data.refunded - data.penalty;

            return {
                clientId,
                clientName: client?.name || 'Unknown Client',
                totalPaidIn: data.paidIn,
                totalRefunded: data.refunded,
                totalPenalty: data.penalty,
                netBalance: netBalance,
            };
        })
        .filter(item => item.netBalance > 0) // Only show if there is a balance due
        .sort((a, b) => b.netBalance - a.netBalance);

    }, [state.contacts, state.transactions, state.projectAgreements]);

    const selectedClientData = useMemo(() => {
        return clientFinancials.find(c => c.clientId === selectedClientId);
    }, [selectedClientId, clientFinancials]);
    
    const selectedClientContact = state.contacts.find(c => c.id === selectedClientId);

    // We need a simplified transaction history for the selected client in this context
    const clientTransactions = useMemo(() => {
        if (!selectedClientId) return [];
        return state.transactions.filter(tx => tx.contactId === selectedClientId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [selectedClientId, state.transactions]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="md:col-span-1 h-fit">
                <h3 className="text-lg font-semibold mb-3">Refunds Due</h3>
                {clientFinancials.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                        {clientFinancials.map(client => (
                            <button 
                                key={client.clientId} 
                                onClick={() => setSelectedClientId(client.clientId)} 
                                className={`w-full text-left p-2 rounded-md flex justify-between items-center gap-2 ${selectedClientId === client.clientId ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                            >
                                <div className="min-w-0">
                                    <div className={`font-semibold truncate ${selectedClientId === client.clientId ? 'text-accent' : 'text-slate-800'}`}>
                                        {client.clientName}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="block text-sm font-bold text-slate-700">{CURRENCY} {client.netBalance.toLocaleString()}</span>
                                    <span className="block text-[10px] text-rose-500">Refund Due</span>
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No pending refunds for cancelled agreements.</p>
                )}
            </Card>

            <div className="md:col-span-3 space-y-4">
                {selectedClientData && selectedClientContact ? (
                    <>
                        <Card>
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold">{selectedClientContact.name}</h3>
                                <Button onClick={() => setIsModalOpen(true)} variant="danger">Refund Balance</Button>
                            </div>
                            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div>
                                    <p className="text-sm text-slate-500">Total Paid In</p>
                                    <p className="font-semibold text-lg text-success">{CURRENCY} {selectedClientData.totalPaidIn.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Penalties Deducted</p>
                                    <p className="font-semibold text-lg text-amber-600">{CURRENCY} {selectedClientData.totalPenalty.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Already Refunded</p>
                                    <p className="font-semibold text-lg text-slate-600">{CURRENCY} {selectedClientData.totalRefunded.toLocaleString()}</p>
                                </div>
                                <div className="bg-slate-100 p-2 rounded">
                                    <p className="text-sm text-slate-500 font-bold">Net Refund Due</p>
                                    <p className="font-bold text-xl text-rose-600">{CURRENCY} {selectedClientData.netBalance.toLocaleString()}</p>
                                </div>
                            </div>
                        </Card>
                        
                        <Card>
                            <h3 className="text-lg font-semibold mb-3">Recent Transactions</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left py-2">Date</th>
                                            <th className="text-left py-2">Type</th>
                                            <th className="text-left py-2">Description</th>
                                            <th className="text-right py-2">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {clientTransactions.map(tx => (
                                            <tr key={tx.id} className="border-b last:border-0">
                                                <td className="py-2">{formatDate(tx.date)}</td>
                                                <td className="py-2"><span className={`px-2 py-0.5 rounded text-xs ${tx.type === 'Income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{tx.type}</span></td>
                                                <td className="py-2 truncate max-w-xs" title={tx.description}>{tx.description}</td>
                                                <td className="py-2 text-right font-medium">{CURRENCY} {tx.amount.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {clientTransactions.length === 0 && <p className="text-center text-slate-500 py-4">No transactions found.</p>}
                            </div>
                        </Card>
                    </>
                ) : (
                    <Card>
                        <div className="text-center py-20">
                            <p className="text-slate-500">Select a client to view refund details.</p>
                        </div>
                    </Card>
                )}
            </div>
            
            {selectedClientContact && selectedClientData && (
                 <ProjectOwnerPayoutModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    client={selectedClientContact}
                    balanceDue={selectedClientData.netBalance} // Pass the net calculated balance
                />
            )}
        </div>
    );
};

export default ProjectOwnerPayouts;

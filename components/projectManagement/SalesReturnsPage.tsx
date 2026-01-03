
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { SalesReturn, SalesReturnStatus, SalesReturnReason, ProjectAgreementStatus, InvoiceStatus } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import SalesReturnModal from './SalesReturnModal';
import ProjectOwnerPayoutModal from './ProjectOwnerPayoutModal';
import { formatDate } from '../../utils/dateUtils';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';

type SortKey = 'returnNumber' | 'agreementNumber' | 'client' | 'date' | 'status' | 'refundAmount';
type StatusFilter = 'all' | SalesReturnStatus;

const SalesReturnsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [returnToView, setReturnToView] = useState<SalesReturn | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [agreementForReturn, setAgreementForReturn] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
    const [payoutClient, setPayoutClient] = useState<{ clientId: string; refundAmount: number } | null>(null);
    const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);

    // Get all sales returns with related data and refund bill information
    const salesReturns = useMemo(() => {
        return (state.salesReturns || []).map(sr => {
            const agreement = state.projectAgreements.find(pa => pa.id === sr.agreementId);
            const client = state.contacts.find(c => c.id === agreement?.clientId);
            // Calculate unpaid refund amount from transactions
            // Since refunds don't use bills, we track refunds by summing transactions
            let unpaidRefundAmount = 0;
            
            if (sr.status === SalesReturnStatus.REFUNDED) {
                unpaidRefundAmount = 0; // Already fully refunded
            } else {
                // Find all refund transactions for this sales return
                // Refund transactions have Unit Selling Income category and reference this return
                const unitSellingCategory = state.categories.find(c => c.name === 'Unit Selling Income');
                const refundTransactions = state.transactions.filter(tx => {
                    if (tx.categoryId !== unitSellingCategory?.id) return false;
                    if (!tx.description?.includes(`Sales Return #${sr.returnNumber}`)) return false;
                    if (tx.agreementId !== sr.agreementId) return false;
                    return true;
                });
                
                const totalRefunded = Math.round(refundTransactions.reduce((sum, tx) => sum + tx.amount, 0)); // Round to whole number
                unpaidRefundAmount = Math.round(Math.max(0, sr.refundAmount - totalRefunded)); // Round to whole number
            }
            
            return {
                ...sr,
                agreement,
                client,
                unpaidRefundAmount,
            };
        });
    }, [state.salesReturns, state.projectAgreements, state.contacts, state.bills, state.transactions]);

    // Filter and sort returns
    const filteredReturns = useMemo(() => {
        let filtered = salesReturns;

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(sr =>
                sr.returnNumber.toLowerCase().includes(query) ||
                sr.agreement?.agreementNumber.toLowerCase().includes(query) ||
                sr.client?.name.toLowerCase().includes(query) ||
                sr.reason.toLowerCase().includes(query)
            );
        }

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(sr => sr.status === statusFilter);
        }

        // Sort
        filtered.sort((a, b) => {
            let valA: any, valB: any;
            switch (sortConfig.key) {
                case 'returnNumber':
                    valA = a.returnNumber;
                    valB = b.returnNumber;
                    break;
                case 'agreementNumber':
                    valA = a.agreement?.agreementNumber || '';
                    valB = b.agreement?.agreementNumber || '';
                    break;
                case 'client':
                    valA = a.client?.name || '';
                    valB = b.client?.name || '';
                    break;
                case 'date':
                    valA = new Date(a.returnDate).getTime();
                    valB = new Date(b.returnDate).getTime();
                    break;
                case 'status':
                    valA = a.status;
                    valB = b.status;
                    break;
                case 'refundAmount':
                    valA = a.refundAmount;
                    valB = b.refundAmount;
                    break;
                default:
                    return 0;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [salesReturns, searchQuery, statusFilter, sortConfig]);

    // Statistics
    const stats = useMemo(() => {
        const total = salesReturns.length;
        const pending = salesReturns.filter(sr => sr.status === SalesReturnStatus.PENDING).length;
        const processed = salesReturns.filter(sr => sr.status === SalesReturnStatus.PROCESSED).length;
        const refunded = salesReturns.filter(sr => sr.status === SalesReturnStatus.REFUNDED).length;
        const totalRefundAmount = Math.round(salesReturns.reduce((sum, sr) => sum + sr.refundAmount, 0)); // Round to whole number
        const totalPenaltyAmount = Math.round(salesReturns.reduce((sum, sr) => sum + sr.penaltyAmount, 0)); // Round to whole number
        const pendingRefundAmount = Math.round(salesReturns
            .filter(sr => {
                // Only count returns that are not fully refunded
                if (sr.status === SalesReturnStatus.REFUNDED) return false;
                
                const unpaid = (sr as any).unpaidRefundAmount;
                return unpaid !== undefined && unpaid > 0.001;
            })
            .reduce((sum, sr) => {
                return sum + ((sr as any).unpaidRefundAmount || 0);
            }, 0)); // Round to whole number

        return {
            total,
            pending,
            processed,
            refunded,
            totalRefundAmount,
            totalPenaltyAmount,
            pendingRefundAmount,
        };
    }, [salesReturns, state.bills]);

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const getStatusBadge = (status: SalesReturnStatus) => {
        const styles = {
            [SalesReturnStatus.PENDING]: 'bg-amber-100 text-amber-800',
            [SalesReturnStatus.PROCESSED]: 'bg-blue-100 text-blue-800',
            [SalesReturnStatus.REFUNDED]: 'bg-green-100 text-green-800',
            [SalesReturnStatus.CANCELLED]: 'bg-slate-100 text-slate-800',
        };
        return (
            <span className={`px-2 py-1 rounded text-xs font-semibold ${styles[status]}`}>
                {status}
            </span>
        );
    };

    const getReasonBadge = (reason: SalesReturnReason) => {
        return (
            <span className="px-2 py-1 rounded text-xs bg-slate-100 text-slate-700">
                {reason}
            </span>
        );
    };

    // Get available agreements for return (only Active agreements)
    const availableAgreements = useMemo(() => {
        return state.projectAgreements
            .filter(pa => pa.status === ProjectAgreementStatus.ACTIVE)
            .map(pa => {
                const client = state.contacts.find(c => c.id === pa.clientId);
                return {
                    id: pa.id,
                    name: `${pa.agreementNumber} - ${client?.name || 'Unknown'} (${CURRENCY} ${pa.sellingPrice.toLocaleString()})`,
                };
            });
    }, [state.projectAgreements, state.contacts]);

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Sales Returns</h1>
                    <p className="text-sm text-slate-500 mt-1">Manage sales returns and refunds</p>
                </div>
                <Button
                    onClick={() => {
                        setAgreementForReturn(null);
                        setIsCreateModalOpen(true);
                    }}
                    variant="primary"
                >
                    + New Return
                </Button>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <div className="p-4">
                        <p className="text-sm text-slate-500">Total Returns</p>
                        <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
                    </div>
                </Card>
                <Card>
                    <div className="p-4">
                        <p className="text-sm text-slate-500">Pending Refunds</p>
                        <p className="text-2xl font-bold text-amber-600">{stats.processed}</p>
                        <p className="text-xs text-slate-500 mt-1">{CURRENCY} {stats.pendingRefundAmount.toLocaleString()}</p>
                    </div>
                </Card>
                <Card>
                    <div className="p-4">
                        <p className="text-sm text-slate-500">Total Penalties</p>
                        <p className="text-2xl font-bold text-rose-600">{CURRENCY} {stats.totalPenaltyAmount.toLocaleString()}</p>
                    </div>
                </Card>
                <Card>
                    <div className="p-4">
                        <p className="text-sm text-slate-500">Total Refunded</p>
                        <p className="text-2xl font-bold text-green-600">{CURRENCY} {stats.totalRefundAmount.toLocaleString()}</p>
                    </div>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                            label="Search"
                            placeholder="Search by return #, agreement #, client..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        <ComboBox
                            label="Status"
                            items={[
                                { id: 'all', name: 'All Statuses' },
                                { id: SalesReturnStatus.PENDING, name: SalesReturnStatus.PENDING },
                                { id: SalesReturnStatus.PROCESSED, name: SalesReturnStatus.PROCESSED },
                                { id: SalesReturnStatus.REFUNDED, name: SalesReturnStatus.REFUNDED },
                                { id: SalesReturnStatus.CANCELLED, name: SalesReturnStatus.CANCELLED },
                            ]}
                            selectedId={statusFilter}
                            onSelect={(item) => setStatusFilter(item?.id as StatusFilter || 'all')}
                        />
                    </div>
                </div>
            </Card>

            {/* Returns Table */}
            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th
                                    className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    onClick={() => handleSort('returnNumber')}
                                >
                                    Return #
                                    {sortConfig.key === 'returnNumber' && (
                                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </th>
                                <th
                                    className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    onClick={() => handleSort('agreementNumber')}
                                >
                                    Agreement #
                                    {sortConfig.key === 'agreementNumber' && (
                                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </th>
                                <th
                                    className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    onClick={() => handleSort('client')}
                                >
                                    Client
                                    {sortConfig.key === 'client' && (
                                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </th>
                                <th
                                    className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    onClick={() => handleSort('date')}
                                >
                                    Return Date
                                    {sortConfig.key === 'date' && (
                                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Reason</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Penalty</th>
                                <th
                                    className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    onClick={() => handleSort('refundAmount')}
                                >
                                    Refund Amount
                                    {sortConfig.key === 'refundAmount' && (
                                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </th>
                                <th
                                    className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100"
                                    onClick={() => handleSort('status')}
                                >
                                    Status
                                    {sortConfig.key === 'status' && (
                                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {filteredReturns.length > 0 ? (
                                filteredReturns.map(sr => (
                                    <tr key={sr.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                                            {sr.returnNumber}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {sr.agreement?.agreementNumber || 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {sr.client?.name || 'Unknown'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {formatDate(sr.returnDate)}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {getReasonBadge(sr.reason)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-semibold text-rose-600">
                                            {CURRENCY} {sr.penaltyAmount.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right">
                                            <div>
                                                <div className="font-semibold text-emerald-600">
                                                    {CURRENCY} {sr.refundAmount.toLocaleString()}
                                                </div>
                                                {(sr as any).unpaidRefundAmount !== undefined && (sr as any).unpaidRefundAmount < sr.refundAmount && (sr as any).unpaidRefundAmount > 0 && (
                                                    <div className="text-xs text-amber-600 mt-1">
                                                        Unpaid: {CURRENCY} {(sr as any).unpaidRefundAmount.toLocaleString()}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {getStatusBadge(sr.status)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => setReturnToView(sr)}
                                                    className="text-xs"
                                                >
                                                    View
                                                </Button>
                                                {(() => {
                                                    // Get unpaid amount from sales return
                                                    const unpaid = (sr as any).unpaidRefundAmount || 0;
                                                    
                                                    // Check status - if REFUNDED, no button
                                                    const isRefunded = sr.status === SalesReturnStatus.REFUNDED;
                                                    
                                                    // Determine if button should be shown
                                                    // Button should NOT show if:
                                                    // 1. Status is REFUNDED
                                                    // 2. No unpaid amount
                                                    // 3. No client
                                                    const shouldShowButton = !isRefunded && unpaid > 0.001 && sr.client;
                                                    
                                                    return shouldShowButton ? (
                                                        <Button
                                                            variant="primary"
                                                            onClick={() => {
                                                                setPayoutClient({
                                                                    clientId: sr.client!.id,
                                                                    refundAmount: unpaid
                                                                });
                                                                setIsPayoutModalOpen(true);
                                                            }}
                                                            className="text-xs"
                                                        >
                                                            Refund
                                                        </Button>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                                        No sales returns found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Modals */}
            <SalesReturnModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setAgreementForReturn(null);
                }}
                agreementId={agreementForReturn}
            />

            {returnToView && (
                <Modal
                    isOpen={!!returnToView}
                    onClose={() => setReturnToView(null)}
                    title={`Sales Return #${returnToView.returnNumber}`}
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-slate-500">Agreement Number</p>
                                <p className="font-semibold">{returnToView.agreement?.agreementNumber || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Client</p>
                                <p className="font-semibold">{returnToView.client?.name || 'Unknown'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Return Date</p>
                                <p className="font-semibold">{formatDate(returnToView.returnDate)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Status</p>
                                <div className="mt-1">{getStatusBadge(returnToView.status)}</div>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Reason</p>
                                <p className="font-semibold">{returnToView.reason}</p>
                            </div>
                            {returnToView.reasonNotes && (
                                <div>
                                    <p className="text-xs text-slate-500">Reason Notes</p>
                                    <p className="text-sm">{returnToView.reasonNotes}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-slate-500">Penalty Percentage</p>
                                <p className="font-semibold">{returnToView.penaltyPercentage}%</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Penalty Amount</p>
                                <p className="font-semibold text-rose-600">{CURRENCY} {returnToView.penaltyAmount.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Refund Amount</p>
                                <p className="font-semibold text-emerald-600">{CURRENCY} {returnToView.refundAmount.toLocaleString()}</p>
                                {(returnToView as any).unpaidRefundAmount !== undefined && (returnToView as any).unpaidRefundAmount < returnToView.refundAmount && (returnToView as any).unpaidRefundAmount > 0 && (
                                    <p className="text-xs text-amber-600 mt-1">
                                        Unpaid: {CURRENCY} {(returnToView as any).unpaidRefundAmount.toLocaleString()}
                                    </p>
                                )}
                            </div>
                            {returnToView.processedDate && (
                                <div>
                                    <p className="text-xs text-slate-500">Processed Date</p>
                                    <p className="font-semibold">{formatDate(returnToView.processedDate)}</p>
                                </div>
                            )}
                            {returnToView.refundedDate && (
                                <div>
                                    <p className="text-xs text-slate-500">Refunded Date</p>
                                    <p className="font-semibold">{formatDate(returnToView.refundedDate)}</p>
                                </div>
                            )}
                        </div>
                        {returnToView.notes && (
                            <div>
                                <p className="text-xs text-slate-500">Notes</p>
                                <p className="text-sm bg-slate-50 p-3 rounded">{returnToView.notes}</p>
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-4 border-t">
                            {(() => {
                                // Get unpaid amount from sales return
                                const unpaid = (returnToView as any).unpaidRefundAmount || 0;
                                
                                // Check status
                                const isRefunded = returnToView.status === SalesReturnStatus.REFUNDED;
                                
                                // Button should NOT show if:
                                // 1. Status is REFUNDED
                                // 2. No unpaid amount
                                // 3. No client
                                const shouldShowButton = !isRefunded && unpaid > 0.001 && returnToView.client;
                                
                                return shouldShowButton ? (
                                    <Button 
                                        variant="primary" 
                                        onClick={() => {
                                            setPayoutClient({
                                                clientId: returnToView.client!.id,
                                                refundAmount: unpaid
                                            });
                                            setIsPayoutModalOpen(true);
                                            setReturnToView(null);
                                        }}
                                    >
                                        Process Refund
                                    </Button>
                                ) : null;
                            })()}
                            <Button variant="secondary" onClick={() => setReturnToView(null)}>
                                Close
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Payout Modal */}
            {payoutClient && (
                <ProjectOwnerPayoutModal
                    key={`payout-${payoutClient.clientId}-${isPayoutModalOpen}`} // Force re-render on state change
                    isOpen={isPayoutModalOpen}
                    onClose={() => {
                        setIsPayoutModalOpen(false);
                        // Small delay to ensure state updates are processed before clearing
                        setTimeout(() => {
                            setPayoutClient(null);
                        }, 200);
                    }}
                    client={state.contacts.find(c => c.id === payoutClient.clientId) || null}
                    balanceDue={payoutClient.refundAmount}
                />
            )}
        </div>
    );
};

export default SalesReturnsPage;


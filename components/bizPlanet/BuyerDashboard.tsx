import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import { PurchaseOrder, P2PInvoice, POStatus, P2PInvoiceStatus } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';

const BuyerDashboard: React.FC = () => {
    const { tenant } = useAuth();
    const [outstandingPOs, setOutstandingPOs] = useState<PurchaseOrder[]>([]);
    const [invoicesAwaitingApproval, setInvoicesAwaitingApproval] = useState<P2PInvoice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // Load outstanding POs (status: SENT, RECEIVED, INVOICED, DELIVERED)
            const outstandingStatuses = ['SENT', 'RECEIVED', 'INVOICED', 'DELIVERED'];
            const allPOs = await apiClient.get<PurchaseOrder[]>('/purchase-orders');
            const outstanding = allPOs.filter(po => outstandingStatuses.includes(po.status));
            setOutstandingPOs(outstanding);

            // Load invoices awaiting approval (status: PENDING, UNDER_REVIEW)
            const allInvoices = await apiClient.get<P2PInvoice[]>('/p2p-invoices');
            const awaitingApproval = allInvoices.filter(inv => 
                inv.status === P2PInvoiceStatus.PENDING || inv.status === P2PInvoiceStatus.UNDER_REVIEW
            );
            setInvoicesAwaitingApproval(awaitingApproval);

        } catch (error) {
            console.error('Error loading buyer dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'bg-gray-100 text-gray-700';
            case 'SENT': return 'bg-blue-100 text-blue-700';
            case 'PENDING': return 'bg-yellow-100 text-yellow-700';
            case 'APPROVED': return 'bg-green-100 text-green-700';
            case 'REJECTED': return 'bg-red-100 text-red-700';
            case 'COMPLETED': return 'bg-emerald-100 text-emerald-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const handleApproveInvoice = async (invoiceId: string) => {
        try {
            await apiClient.put(`/p2p-invoices/${invoiceId}/approve`);
            await loadData();
        } catch (error) {
            console.error('Error approving invoice:', error);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mb-2"></div>
                    <p className="text-sm text-slate-600">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-4 sm:p-6 gap-4 sm:gap-6 overflow-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Buyer Dashboard</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Manage purchase orders and invoices</p>
                </div>
                <Button onClick={() => {}} className="bg-slate-900 text-white hover:bg-slate-800">
                    + New Purchase Order
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4">
                    <div className="text-sm text-slate-500 mb-1">Outstanding POs</div>
                    <div className="text-2xl font-bold text-slate-900">{outstandingPOs.length}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-slate-500 mb-1">Invoices Awaiting Approval</div>
                    <div className="text-2xl font-bold text-slate-900">{invoicesAwaitingApproval.length}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-slate-500 mb-1">Supplier Performance</div>
                    <div className="text-2xl font-bold text-slate-900">-</div>
                </Card>
            </div>

            {/* Outstanding POs Table */}
            <Card className="flex-1 overflow-auto">
                <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Outstanding Purchase Orders</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">PO Number</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Supplier</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {outstandingPOs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                        No outstanding purchase orders
                                    </td>
                                </tr>
                            ) : (
                                outstandingPOs.map(po => (
                                    <tr key={po.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm text-slate-900">{po.poNumber}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{po.supplierTenantId}</td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                                            ${po.totalAmount.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(po.status)}`}>
                                                {po.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Button
                                                variant="secondary"
                                                onClick={() => {}}
                                                className="text-xs"
                                            >
                                                View
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Invoices Awaiting Approval */}
            <Card className="flex-1 overflow-auto">
                <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Invoices Awaiting Approval</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Invoice Number</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">PO Number</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {invoicesAwaitingApproval.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                        No invoices awaiting approval
                                    </td>
                                </tr>
                            ) : (
                                invoicesAwaitingApproval.map(invoice => (
                                    <tr key={invoice.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm text-slate-900">{invoice.invoiceNumber}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{invoice.poId}</td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                                            ${invoice.amount.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(invoice.status)}`}>
                                                {invoice.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="primary"
                                                    onClick={() => handleApproveInvoice(invoice.id)}
                                                    className="text-xs bg-green-600 hover:bg-green-700"
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => {}}
                                                    className="text-xs"
                                                >
                                                    Reject
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default BuyerDashboard;

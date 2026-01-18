import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import { PurchaseOrder, P2PInvoice, POStatus, P2PInvoiceStatus } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';

const SupplierPortal: React.FC = () => {
    const { tenant } = useAuth();
    const [receivedPOs, setReceivedPOs] = useState<PurchaseOrder[]>([]);
    const [myInvoices, setMyInvoices] = useState<P2PInvoice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // Load received POs (status: SENT, RECEIVED)
            const allPOs = await apiClient.get<PurchaseOrder[]>('/purchase-orders');
            const received = allPOs.filter(po => 
                (po.status === POStatus.SENT || po.status === POStatus.RECEIVED) &&
                po.supplierTenantId === tenant?.id
            );
            setReceivedPOs(received);

            // Load my invoices
            const allInvoices = await apiClient.get<P2PInvoice[]>('/p2p-invoices');
            const myInvs = allInvoices.filter(inv => inv.supplierTenantId === tenant?.id);
            setMyInvoices(myInvs);

        } catch (error) {
            console.error('Error loading supplier portal data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFlipToInvoice = async (poId: string) => {
        try {
            await apiClient.post(`/p2p-invoices/flip-from-po/${poId}`);
            await loadData();
        } catch (error) {
            console.error('Error flipping PO to invoice:', error);
            alert('Error creating invoice from PO. Please try again.');
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'SENT': return 'bg-blue-100 text-blue-700';
            case 'RECEIVED': return 'bg-indigo-100 text-indigo-700';
            case 'PENDING': return 'bg-yellow-100 text-yellow-700';
            case 'UNDER_REVIEW': return 'bg-orange-100 text-orange-700';
            case 'APPROVED': return 'bg-green-100 text-green-700';
            case 'REJECTED': return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    // Count invoices by status
    const invoiceCounts = {
        pending: myInvoices.filter(inv => inv.status === P2PInvoiceStatus.PENDING).length,
        underReview: myInvoices.filter(inv => inv.status === P2PInvoiceStatus.UNDER_REVIEW).length,
        approved: myInvoices.filter(inv => inv.status === P2PInvoiceStatus.APPROVED).length,
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
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Supplier Portal</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Manage purchase orders and invoices</p>
                </div>
            </div>

            {/* Received Purchase Orders */}
            <Card className="flex-1 overflow-auto">
                <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Received Purchase Orders</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">PO Number</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Buyer</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {receivedPOs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                        No received purchase orders
                                    </td>
                                </tr>
                            ) : (
                                receivedPOs.map(po => (
                                    <tr key={po.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm text-slate-900 font-medium">{po.poNumber}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{po.buyerTenantId}</td>
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
                                                variant="primary"
                                                onClick={() => handleFlipToInvoice(po.id)}
                                                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                                disabled={po.status !== POStatus.SENT && po.status !== POStatus.RECEIVED}
                                            >
                                                Flip to Invoice
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Invoice Status Tracker */}
            <Card className="p-4">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Invoice Status Tracker</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-yellow-50 rounded-lg">
                        <div className="text-2xl font-bold text-yellow-700 mb-1">{invoiceCounts.pending}</div>
                        <div className="text-sm text-yellow-600">PENDING</div>
                    </div>
                    <div className="text-center p-4 bg-orange-50 rounded-lg">
                        <div className="text-2xl font-bold text-orange-700 mb-1">{invoiceCounts.underReview}</div>
                        <div className="text-sm text-orange-600">UNDER REVIEW</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-700 mb-1">{invoiceCounts.approved}</div>
                        <div className="text-sm text-green-600">APPROVED</div>
                    </div>
                </div>
            </Card>

            {/* My Invoices */}
            <Card className="flex-1 overflow-auto">
                <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">My Invoices</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Invoice Number</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">PO Number</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {myInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                                        No invoices submitted
                                    </td>
                                </tr>
                            ) : (
                                myInvoices.map(invoice => (
                                    <tr key={invoice.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm text-slate-900 font-medium">{invoice.invoiceNumber}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{invoice.poId}</td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                                            ${invoice.amount.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(invoice.status)}`}>
                                                {invoice.status}
                                            </span>
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

export default SupplierPortal;

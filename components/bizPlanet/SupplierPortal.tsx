import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import { PurchaseOrder, P2PInvoice, POStatus, P2PInvoiceStatus, SupplierRegistrationRequest, SupplierRegistrationStatus } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import { ICONS, CURRENCY } from '../../constants';
import { getWebSocketClient } from '../../services/websocketClient';

const SupplierPortal: React.FC = () => {
    const { tenant } = useAuth();
    const { showToast, showAlert } = useNotification();
    const [receivedPOs, setReceivedPOs] = useState<PurchaseOrder[]>([]);
    const [myInvoices, setMyInvoices] = useState<P2PInvoice[]>([]);
    const [myRegistrationRequests, setMyRegistrationRequests] = useState<SupplierRegistrationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Registration form state
    const [isRegistrationFormOpen, setIsRegistrationFormOpen] = useState(false);
    const [buyerOrganizationEmail, setBuyerOrganizationEmail] = useState('');
    const [selectedBuyerTenantId, setSelectedBuyerTenantId] = useState('');
    const [supplierMessage, setSupplierMessage] = useState('');
    const [availableBuyers, setAvailableBuyers] = useState<Array<{ id: string; name: string; email: string }>>([]);

    useEffect(() => {
        loadData();
        loadMyRegistrationRequests();
        loadAvailableBuyers();
    }, []);

    // WebSocket listener for registration status updates and new purchase orders
    useEffect(() => {
        const wsClient = getWebSocketClient();
        
        const handleDataUpdate = (data: any) => {
            if (data.type === 'SUPPLIER_REGISTRATION_APPROVED' || data.type === 'SUPPLIER_REGISTRATION_REJECTED') {
                // Reload registration requests when status changes
                loadMyRegistrationRequests();
                
                // Show success notification for approval
                if (data.type === 'SUPPLIER_REGISTRATION_APPROVED') {
                    showToast('Registration approved! You are now registered with the buyer organization.', 'success');
                } else if (data.type === 'SUPPLIER_REGISTRATION_REJECTED') {
                    showToast('Registration request was rejected by the buyer organization.', 'info');
                }
            } else if (data.type === 'PURCHASE_ORDER_RECEIVED') {
                // Reload purchase orders when new PO is received
                loadData();
                showToast(`New purchase order received: ${data.poNumber}`, 'info');
            }
        };

        // Subscribe to DATA_UPDATED events
        const unsubscribe = wsClient.on('data:updated', handleDataUpdate);

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [showToast]);

    const loadAvailableBuyers = async () => {
        try {
            // This would need an API endpoint to get all tenants that are NOT suppliers
            // For now, we'll use a placeholder - in production you'd want to search by email
            // The user can still type the email manually if needed
        } catch (error) {
            console.error('Error loading available buyers:', error);
        }
    };

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

    const loadMyRegistrationRequests = async () => {
        try {
            const requests = await apiClient.get<SupplierRegistrationRequest[]>('/supplier-registrations/my-requests');
            setMyRegistrationRequests(requests);
        } catch (error) {
            console.error('Error loading registration requests:', error);
        }
    };

    const checkIfAlreadyRegistered = async (buyerEmail: string): Promise<boolean> => {
        try {
            // Check if any of our registration requests are approved for this buyer
            const requests = await apiClient.get<SupplierRegistrationRequest[]>('/supplier-registrations/my-requests');
            const buyerRequests = requests.filter(r => 
                r.buyerOrganizationEmail.toLowerCase() === buyerEmail.toLowerCase()
            );
            
            // Check if any request is approved
            return buyerRequests.some(r => r.status === SupplierRegistrationStatus.APPROVED);
        } catch (error) {
            console.error('Error checking registration status:', error);
            return false;
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

    const handleSubmitRegistration = async () => {
        // Validation
        if (!buyerOrganizationEmail.trim()) {
            showAlert('Please enter buyer organization email');
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(buyerOrganizationEmail)) {
            showAlert('Please enter a valid email address');
            return;
        }

        // Check if already registered with this organization
        const isAlreadyRegistered = await checkIfAlreadyRegistered(buyerOrganizationEmail.trim());
        if (isAlreadyRegistered) {
            showAlert('You are already registered with this organization');
            return;
        }

        try {
            await apiClient.post('/supplier-registrations/request', {
                buyerOrganizationEmail: buyerOrganizationEmail.trim(),
                supplierMessage: supplierMessage.trim() || undefined
            });
            
            showToast('Registration request sent successfully');
            
            // Reset form
            setBuyerOrganizationEmail('');
            setSupplierMessage('');
            setIsRegistrationFormOpen(false);
            
            // Reload requests
            await loadMyRegistrationRequests();
        } catch (error: any) {
            console.error('Error sending registration request:', error);
            const errorMessage = error.response?.data?.error || 'Failed to send registration request';
            
            // Check for already registered error
            if (errorMessage.toLowerCase().includes('already registered')) {
                showAlert('You are already registered with this organization');
            } else {
                showAlert(errorMessage);
            }
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
                <div className="flex items-center gap-2">
                    {/* Bill Icon Reminder - Show new purchase orders (SENT status) */}
                    {receivedPOs.filter(po => po.status === POStatus.SENT).length > 0 && (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => {
                                    // Scroll to Received Purchase Orders section
                                    const poElement = document.querySelector('[data-section="received-pos"]');
                                    if (poElement) {
                                        poElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                }}
                                className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors relative min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title={`${receivedPOs.filter(po => po.status === POStatus.SENT).length} new purchase order${receivedPOs.filter(po => po.status === POStatus.SENT).length !== 1 ? 's' : ''} received`}
                            >
                                {ICONS.fileText}
                                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1.5 bg-blue-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                                    {receivedPOs.filter(po => po.status === POStatus.SENT).length > 99 ? '99+' : receivedPOs.filter(po => po.status === POStatus.SENT).length}
                                </span>
                            </button>
                        </div>
                    )}
                    {/* Notification Icon - Show registration status updates, pending invoices, and new invoices */}
                    {(myRegistrationRequests.some(r => r.status === SupplierRegistrationStatus.APPROVED || r.status === SupplierRegistrationStatus.REJECTED) ||
                      myInvoices.filter(inv => inv.status === P2PInvoiceStatus.PENDING || inv.status === P2PInvoiceStatus.UNDER_REVIEW).length > 0) && (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => {
                                    // Scroll to relevant section
                                    const regElement = document.querySelector('[data-section="my-registrations"]');
                                    const invElement = document.querySelector('[data-section="my-invoices"]');
                                    const hasRegUpdates = myRegistrationRequests.some(r => r.status === SupplierRegistrationStatus.APPROVED || r.status === SupplierRegistrationStatus.REJECTED);
                                    if (hasRegUpdates && regElement) {
                                        regElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    } else if (invElement) {
                                        invElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                }}
                                className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors relative min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title={`${myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.APPROVED || r.status === SupplierRegistrationStatus.REJECTED).length} registration update${myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.APPROVED || r.status === SupplierRegistrationStatus.REJECTED).length !== 1 ? 's' : ''}, ${myInvoices.filter(inv => inv.status === P2PInvoiceStatus.PENDING || inv.status === P2PInvoiceStatus.UNDER_REVIEW).length} invoice${myInvoices.filter(inv => inv.status === P2PInvoiceStatus.PENDING || inv.status === P2PInvoiceStatus.UNDER_REVIEW).length !== 1 ? 's' : ''} pending`}
                            >
                                {ICONS.bell}
                                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1.5 bg-blue-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                                    {(myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.APPROVED || r.status === SupplierRegistrationStatus.REJECTED).length + 
                                      myInvoices.filter(inv => inv.status === P2PInvoiceStatus.PENDING || inv.status === P2PInvoiceStatus.UNDER_REVIEW).length) > 99 ? '99+' : 
                                     (myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.APPROVED || r.status === SupplierRegistrationStatus.REJECTED).length + 
                                      myInvoices.filter(inv => inv.status === P2PInvoiceStatus.PENDING || inv.status === P2PInvoiceStatus.UNDER_REVIEW).length)}
                                </span>
                            </button>
                        </div>
                    )}
                    <Button
                        onClick={() => setIsRegistrationFormOpen(!isRegistrationFormOpen)}
                        className="bg-slate-900 text-white hover:bg-slate-800"
                        type="button"
                    >
                        {isRegistrationFormOpen ? 'Cancel' : '+ Register with Buyer'}
                    </Button>
                </div>
            </div>

            {/* Registration Request Form */}
            {isRegistrationFormOpen && (
                <Card className="p-6 border-2 border-blue-200 bg-blue-50/30">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Register with Buyer Organization</h2>
                    <p className="text-sm text-slate-600 mb-4">Enter the email address of the buyer organization you want to register with.</p>
                    
                    <div className="space-y-4 mb-6">
                        <Input
                            label="Buyer Organization Email *"
                            type="email"
                            value={buyerOrganizationEmail}
                            onChange={(e) => {
                                setBuyerOrganizationEmail(e.target.value);
                                setSelectedBuyerTenantId('');
                            }}
                            placeholder="Enter buyer organization email (e.g., buyer@company.com)"
                            required
                        />
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Message (Optional)
                            </label>
                            <textarea
                                className="block w-full px-3 py-2 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-base sm:text-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors"
                                rows={3}
                                value={supplierMessage}
                                onChange={(e) => setSupplierMessage(e.target.value)}
                                placeholder="Add a message to the buyer organization (optional)"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setBuyerOrganizationEmail('');
                                setSelectedBuyerTenantId('');
                                setSupplierMessage('');
                                setIsRegistrationFormOpen(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmitRegistration}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={!buyerOrganizationEmail.trim()}
                        >
                            Send Registration Request
                        </Button>
                    </div>
                </Card>
            )}

            {/* Success Banner for Approved Registrations */}
            {myRegistrationRequests.some(r => r.status === SupplierRegistrationStatus.APPROVED) && (
                <Card className="p-4 bg-green-50 border-2 border-green-200">
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-green-900">Registration Approved!</h3>
                            <p className="text-sm text-green-700">
                                {myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.APPROVED).length} registration request{myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.APPROVED).length > 1 ? 's have' : ' has'} been approved. You can now receive purchase orders from these buyers.
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            {/* My Registration Requests Status */}
            {myRegistrationRequests.length > 0 && (
                <Card className="flex-1 overflow-auto" data-section="my-registrations">
                    <div className="p-4 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">My Registration Requests</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Buyer Organization</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Requested</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Comments</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {myRegistrationRequests.map(request => (
                                    <tr 
                                        key={request.id} 
                                        className={`hover:bg-slate-50 ${
                                            request.status === SupplierRegistrationStatus.APPROVED ? 'bg-green-50/50' : ''
                                        }`}
                                    >
                                        <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                                            {request.buyerCompanyName || request.buyerName || 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{request.buyerOrganizationEmail}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(request.status)}`}>
                                                {request.status === SupplierRegistrationStatus.APPROVED && '✓ '}{request.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {new Date(request.requestedAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {request.buyerComments || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Received Purchase Orders */}
            <Card className="flex-1 overflow-auto" data-section="received-pos">
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
                                            {CURRENCY} {(po.totalAmount || 0).toFixed(2)}
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
            <Card className="flex-1 overflow-auto" data-section="my-invoices">
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
                                            {CURRENCY} {(invoice.amount || 0).toFixed(2)}
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

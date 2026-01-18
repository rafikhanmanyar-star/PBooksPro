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

// Notification type for activity messages
interface ActivityNotification {
    id: string;
    type: 'registration_approved' | 'registration_rejected' | 'new_po' | 'invoice_approved' | 'invoice_rejected' | 'invoice_pending';
    title: string;
    message: string;
    timestamp: Date;
    itemId?: string;
    itemType?: 'registration' | 'po' | 'invoice';
    read?: boolean;
}

const SupplierPortal: React.FC = () => {
    const { tenant } = useAuth();
    const { showToast, showAlert } = useNotification();
    const [receivedPOs, setReceivedPOs] = useState<PurchaseOrder[]>([]);
    const [myInvoices, setMyInvoices] = useState<P2PInvoice[]>([]);
    const [myRegistrationRequests, setMyRegistrationRequests] = useState<SupplierRegistrationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Notification dropdown state
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
    const notificationRef = useRef<HTMLDivElement>(null);
    
    // Registration form state
    const [isRegistrationFormOpen, setIsRegistrationFormOpen] = useState(false);
    const [buyerOrganizationEmail, setBuyerOrganizationEmail] = useState('');
    const [selectedBuyerTenantId, setSelectedBuyerTenantId] = useState('');
    const [supplierMessage, setSupplierMessage] = useState('');
    const [availableBuyers, setAvailableBuyers] = useState<Array<{ id: string; name: string; email: string }>>([]);

    // Close notification dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setIsNotificationOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        loadData();
        loadMyRegistrationRequests();
        loadAvailableBuyers();
    }, []);

    // Build notifications from data
    useEffect(() => {
        buildNotifications();
    }, [myRegistrationRequests, receivedPOs, myInvoices]);

    const buildNotifications = () => {
        const newNotifications: ActivityNotification[] = [];

        // Registration approved/rejected notifications
        myRegistrationRequests.forEach(req => {
            if (req.status === SupplierRegistrationStatus.APPROVED) {
                newNotifications.push({
                    id: `reg-approved-${req.id}`,
                    type: 'registration_approved',
                    title: 'Registration Approved',
                    message: `Your registration with ${req.buyerCompanyName || req.buyerName || req.buyerOrganizationEmail} has been approved.`,
                    timestamp: new Date(req.reviewedAt || req.requestedAt),
                    itemId: req.id,
                    itemType: 'registration'
                });
            } else if (req.status === SupplierRegistrationStatus.REJECTED) {
                newNotifications.push({
                    id: `reg-rejected-${req.id}`,
                    type: 'registration_rejected',
                    title: 'Registration Rejected',
                    message: `Your registration with ${req.buyerCompanyName || req.buyerName || req.buyerOrganizationEmail} was rejected.`,
                    timestamp: new Date(req.reviewedAt || req.requestedAt),
                    itemId: req.id,
                    itemType: 'registration'
                });
            }
        });

        // New PO received notifications (SENT status means just received)
        receivedPOs.filter(po => po.status === POStatus.SENT).forEach(po => {
            newNotifications.push({
                id: `po-received-${po.id}`,
                type: 'new_po',
                title: 'New Purchase Order',
                message: `New PO ${po.poNumber} received - ${CURRENCY} ${(po.totalAmount || 0).toFixed(2)}`,
                timestamp: new Date(po.sentAt || po.createdAt || Date.now()),
                itemId: po.id,
                itemType: 'po'
            });
        });

        // Invoice status notifications
        myInvoices.forEach(inv => {
            if (inv.status === P2PInvoiceStatus.APPROVED) {
                newNotifications.push({
                    id: `inv-approved-${inv.id}`,
                    type: 'invoice_approved',
                    title: 'Invoice Approved',
                    message: `Invoice ${inv.invoiceNumber} has been approved - ${CURRENCY} ${(inv.amount || 0).toFixed(2)}`,
                    timestamp: new Date(inv.approvedAt || inv.createdAt || Date.now()),
                    itemId: inv.id,
                    itemType: 'invoice'
                });
            } else if (inv.status === P2PInvoiceStatus.REJECTED) {
                newNotifications.push({
                    id: `inv-rejected-${inv.id}`,
                    type: 'invoice_rejected',
                    title: 'Invoice Rejected',
                    message: `Invoice ${inv.invoiceNumber} was rejected.`,
                    timestamp: new Date(inv.rejectedAt || inv.createdAt || Date.now()),
                    itemId: inv.id,
                    itemType: 'invoice'
                });
            }
        });

        // Sort by timestamp descending
        newNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setNotifications(newNotifications);
    };

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

    const getNotificationIcon = (type: ActivityNotification['type']) => {
        switch (type) {
            case 'registration_approved':
                return <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
            case 'registration_rejected':
                return <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
            case 'new_po':
                return <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
            case 'invoice_approved':
                return <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
            case 'invoice_rejected':
                return <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
            default:
                return <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        }
    };

    const handleNotificationClick = (notification: ActivityNotification) => {
        setIsNotificationOpen(false);
        
        // Scroll to the appropriate section based on notification type
        if (notification.itemType === 'registration') {
            const element = document.querySelector('[data-section="my-registrations"]');
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Highlight the specific row
                setTimeout(() => {
                    const row = document.querySelector(`[data-registration-id="${notification.itemId}"]`);
                    if (row) {
                        row.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
                        setTimeout(() => row.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2'), 2000);
                    }
                }, 500);
            }
        } else if (notification.itemType === 'po') {
            const element = document.querySelector('[data-section="received-pos"]');
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(() => {
                    const row = document.querySelector(`[data-po-id="${notification.itemId}"]`);
                    if (row) {
                        row.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
                        setTimeout(() => row.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2'), 2000);
                    }
                }, 500);
            }
        } else if (notification.itemType === 'invoice') {
            const element = document.querySelector('[data-section="my-invoices"]');
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(() => {
                    const row = document.querySelector(`[data-invoice-id="${notification.itemId}"]`);
                    if (row) {
                        row.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
                        setTimeout(() => row.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2'), 2000);
                    }
                }, 500);
            }
        }
    };

    // Count invoices by status
    const invoiceCounts = {
        pending: myInvoices.filter(inv => inv.status === P2PInvoiceStatus.PENDING).length,
        underReview: myInvoices.filter(inv => inv.status === P2PInvoiceStatus.UNDER_REVIEW).length,
        approved: myInvoices.filter(inv => inv.status === P2PInvoiceStatus.APPROVED).length,
    };

    // Get approved registrations for the right panel
    const approvedRegistrations = myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.APPROVED);

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
        <div className="flex flex-col h-full bg-slate-50/50 overflow-hidden">
            {/* Compact Header */}
            <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-slate-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight">Supplier Portal</h1>
                        <p className="text-xs text-slate-500">Manage purchase orders and invoices</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Notification Bell Icon with Dropdown */}
                        <div className="relative" ref={notificationRef}>
                            <button
                                type="button"
                                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                                className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors relative min-w-[40px] min-h-[40px] flex items-center justify-center"
                                title={`${notifications.length} notification${notifications.length !== 1 ? 's' : ''}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                                </svg>
                                {notifications.length > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                                        {notifications.length > 99 ? '99+' : notifications.length}
                                    </span>
                                )}
                            </button>
                            
                            {/* Notification Dropdown */}
                            {isNotificationOpen && (
                                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-96 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                                        <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                                    </div>
                                    <div className="max-h-72 overflow-y-auto">
                                        {notifications.length === 0 ? (
                                            <div className="px-4 py-8 text-center text-slate-500 text-sm">
                                                No notifications
                                            </div>
                                        ) : (
                                            notifications.map(notification => (
                                                <button
                                                    key={notification.id}
                                                    type="button"
                                                    onClick={() => handleNotificationClick(notification)}
                                                    className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0"
                                                >
                                                    <div className="flex-shrink-0 mt-0.5">
                                                        {getNotificationIcon(notification.type)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notification.message}</p>
                                                        <p className="text-[10px] text-slate-400 mt-1">
                                                            {notification.timestamp.toLocaleDateString()} {notification.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <Button
                            onClick={() => setIsRegistrationFormOpen(!isRegistrationFormOpen)}
                            className="bg-slate-900 text-white hover:bg-slate-800 text-sm py-1.5 px-3"
                            type="button"
                        >
                            {isRegistrationFormOpen ? 'Cancel' : '+ Register'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Registration Form (Collapsible) */}
            {isRegistrationFormOpen && (
                <div className="flex-shrink-0 p-4 bg-blue-50/50 border-b border-blue-200">
                    <Card className="p-4 border border-blue-200">
                        <h2 className="text-sm font-semibold text-slate-900 mb-3">Register with Buyer Organization</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Input
                                label="Buyer Email *"
                                type="email"
                                value={buyerOrganizationEmail}
                                onChange={(e) => setBuyerOrganizationEmail(e.target.value)}
                                placeholder="buyer@company.com"
                                required
                            />
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Message (Optional)</label>
                                <input
                                    type="text"
                                    className="block w-full px-3 py-2 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors"
                                    value={supplierMessage}
                                    onChange={(e) => setSupplierMessage(e.target.value)}
                                    placeholder="Optional message"
                                />
                            </div>
                            <div className="flex items-end gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setBuyerOrganizationEmail('');
                                        setSupplierMessage('');
                                        setIsRegistrationFormOpen(false);
                                    }}
                                    className="text-sm"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSubmitRegistration}
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                                    disabled={!buyerOrganizationEmail.trim()}
                                >
                                    Send Request
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Main Split Content Area */}
            <div className="flex-1 flex overflow-hidden p-3 gap-3">
                {/* Left Panel - POs, Invoices, Bills */}
                <div className="flex-1 flex flex-col gap-3 overflow-hidden min-w-0">
                    {/* Invoice Status Tracker - Compact */}
                    <Card className="flex-shrink-0 p-3">
                        <div className="grid grid-cols-3 gap-2">
                            <div className="text-center p-2 bg-yellow-50 rounded-lg">
                                <div className="text-lg font-bold text-yellow-700">{invoiceCounts.pending}</div>
                                <div className="text-[10px] text-yellow-600 uppercase">Pending</div>
                            </div>
                            <div className="text-center p-2 bg-orange-50 rounded-lg">
                                <div className="text-lg font-bold text-orange-700">{invoiceCounts.underReview}</div>
                                <div className="text-[10px] text-orange-600 uppercase">Under Review</div>
                            </div>
                            <div className="text-center p-2 bg-green-50 rounded-lg">
                                <div className="text-lg font-bold text-green-700">{invoiceCounts.approved}</div>
                                <div className="text-[10px] text-green-600 uppercase">Approved</div>
                            </div>
                        </div>
                    </Card>

                    {/* Received Purchase Orders */}
                    <Card className="flex-1 overflow-hidden flex flex-col min-h-0" data-section="received-pos">
                        <div className="px-3 py-2 border-b border-slate-200 flex-shrink-0">
                            <h2 className="text-sm font-semibold text-slate-900">Received Purchase Orders</h2>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase">PO #</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase">Buyer</th>
                                        <th className="px-3 py-2 text-right text-[10px] font-medium text-slate-500 uppercase">Amount</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase">Status</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {receivedPOs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-3 py-6 text-center text-slate-500 text-xs">
                                                No received purchase orders
                                            </td>
                                        </tr>
                                    ) : (
                                        receivedPOs.map(po => (
                                            <tr key={po.id} data-po-id={po.id} className="hover:bg-slate-50 transition-all">
                                                <td className="px-3 py-2 text-xs text-slate-900 font-medium">{po.poNumber}</td>
                                                <td className="px-3 py-2 text-xs text-slate-600 truncate max-w-[100px]">{po.buyerTenantId}</td>
                                                <td className="px-3 py-2 text-xs text-right font-medium text-slate-900">
                                                    {CURRENCY} {(po.totalAmount || 0).toFixed(2)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${getStatusColor(po.status)}`}>
                                                        {po.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Button
                                                        variant="primary"
                                                        onClick={() => handleFlipToInvoice(po.id)}
                                                        className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white py-1 px-2"
                                                        disabled={po.status !== POStatus.SENT && po.status !== POStatus.RECEIVED}
                                                    >
                                                        Invoice
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* My Invoices */}
                    <Card className="flex-1 overflow-hidden flex flex-col min-h-0" data-section="my-invoices">
                        <div className="px-3 py-2 border-b border-slate-200 flex-shrink-0">
                            <h2 className="text-sm font-semibold text-slate-900">My Invoices</h2>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase">Invoice #</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase">PO #</th>
                                        <th className="px-3 py-2 text-right text-[10px] font-medium text-slate-500 uppercase">Amount</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {myInvoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-3 py-6 text-center text-slate-500 text-xs">
                                                No invoices submitted
                                            </td>
                                        </tr>
                                    ) : (
                                        myInvoices.map(invoice => (
                                            <tr key={invoice.id} data-invoice-id={invoice.id} className="hover:bg-slate-50 transition-all">
                                                <td className="px-3 py-2 text-xs text-slate-900 font-medium">{invoice.invoiceNumber}</td>
                                                <td className="px-3 py-2 text-xs text-slate-600">{invoice.poId}</td>
                                                <td className="px-3 py-2 text-xs text-right font-medium text-slate-900">
                                                    {CURRENCY} {(invoice.amount || 0).toFixed(2)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${getStatusColor(invoice.status)}`}>
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

                {/* Right Panel - Registered Organizations */}
                <div className="w-80 flex-shrink-0 flex flex-col gap-3 overflow-hidden">
                    {/* Registered Organizations */}
                    <Card className="flex-1 overflow-hidden flex flex-col" data-section="my-registrations">
                        <div className="px-3 py-2 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-indigo-50 to-purple-50">
                            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                Registered Organizations
                            </h2>
                            <p className="text-[10px] text-slate-500 mt-0.5">{approvedRegistrations.length} active</p>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {approvedRegistrations.length === 0 ? (
                                <div className="px-3 py-8 text-center">
                                    <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    <p className="text-xs text-slate-500">No registered organizations yet</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Click "+ Register" to get started</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {approvedRegistrations.map(reg => (
                                        <div 
                                            key={reg.id} 
                                            data-registration-id={reg.id}
                                            className="px-3 py-2.5 hover:bg-slate-50 transition-all cursor-pointer"
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                    {(reg.buyerCompanyName || reg.buyerName || 'O').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-slate-900 truncate">
                                                        {reg.buyerCompanyName || reg.buyerName || 'Organization'}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 truncate">{reg.buyerOrganizationEmail}</p>
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-green-100 text-green-700">
                                                            Active
                                                        </span>
                                                        <span className="text-[9px] text-slate-400">
                                                            Since {new Date(reg.reviewedAt || reg.requestedAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Pending Registrations */}
                    {myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.PENDING).length > 0 && (
                        <Card className="flex-shrink-0 overflow-hidden">
                            <div className="px-3 py-2 border-b border-slate-200 bg-yellow-50">
                                <h2 className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Pending Requests
                                </h2>
                            </div>
                            <div className="max-h-32 overflow-auto">
                                {myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.PENDING).map(reg => (
                                    <div key={reg.id} className="px-3 py-2 border-b border-slate-100 last:border-0">
                                        <p className="text-xs font-medium text-slate-700 truncate">{reg.buyerOrganizationEmail}</p>
                                        <p className="text-[10px] text-slate-500">Requested {new Date(reg.requestedAt).toLocaleDateString()}</p>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Rejected Registrations */}
                    {myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.REJECTED).length > 0 && (
                        <Card className="flex-shrink-0 overflow-hidden">
                            <div className="px-3 py-2 border-b border-slate-200 bg-red-50">
                                <h2 className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Rejected
                                </h2>
                            </div>
                            <div className="max-h-24 overflow-auto">
                                {myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.REJECTED).map(reg => (
                                    <div key={reg.id} className="px-3 py-2 border-b border-slate-100 last:border-0">
                                        <p className="text-xs font-medium text-slate-700 truncate">{reg.buyerOrganizationEmail}</p>
                                        <p className="text-[10px] text-red-500">{reg.buyerComments || 'No reason provided'}</p>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SupplierPortal;

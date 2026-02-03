import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import { PurchaseOrder, P2PInvoice, POStatus, P2PInvoiceStatus, SupplierRegistrationRequest, SupplierRegistrationStatus } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY } from '../../constants';
import { getWebSocketClient } from '../../services/websocketClient';
import { BIZ_PLANET_NOTIFICATION_ACTION_EVENT, updateBizPlanetNotifications } from '../../utils/bizPlanetNotifications';

// Notification type for activity messages
interface ActivityNotification {
    id: string;
    type: 'registration_approved' | 'registration_rejected' | 'new_po' | 'invoice_approved' | 'invoice_rejected' | 'invoice_pending';
    title: string;
    message: string;
    timestamp: Date;
    itemId?: string;
    itemType?: 'registration' | 'po' | 'invoice';
}

const SupplierPortal: React.FC = () => {
    const { tenant } = useAuth();
    const { showToast, showAlert } = useNotification();
    const [receivedPOs, setReceivedPOs] = useState<PurchaseOrder[]>([]);
    const [myInvoices, setMyInvoices] = useState<P2PInvoice[]>([]);
    const [myRegistrationRequests, setMyRegistrationRequests] = useState<SupplierRegistrationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
    const [poDetailLoading, setPoDetailLoading] = useState(false);
    const [poReadOnly, setPoReadOnly] = useState(false);
    const [selectedApprovedRegistration, setSelectedApprovedRegistration] = useState<SupplierRegistrationRequest | null>(null);

    const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
    const [pendingFocus, setPendingFocus] = useState<{ type: 'registration' | 'po' | 'invoice'; id?: string } | null>(null);
    
    // Mobile responsive state
    const [activePanel, setActivePanel] = useState<'left' | 'right'>('left');
    
    // Registration form state
    const [isRegistrationFormOpen, setIsRegistrationFormOpen] = useState(false);
    const [buyerOrganizationEmail, setBuyerOrganizationEmail] = useState('');
    const [selectedBuyerTenantId, setSelectedBuyerTenantId] = useState('');
    const [supplierMessage, setSupplierMessage] = useState('');
    const [availableBuyers, setAvailableBuyers] = useState<Array<{ id: string; name: string; email: string }>>([]);
    // Additional supplier registration fields
    const [regSupplierName, setRegSupplierName] = useState('');
    const [regSupplierCompany, setRegSupplierCompany] = useState('');
    const [regSupplierContactNo, setRegSupplierContactNo] = useState('');
    const [regSupplierAddress, setRegSupplierAddress] = useState('');
    const [regSupplierDescription, setRegSupplierDescription] = useState('');

    useEffect(() => {
        loadData();
        loadMyRegistrationRequests();
        loadAvailableBuyers();
    }, []);

    // Fallback polling for registration status updates if WS misses events
    useEffect(() => {
        const intervalId = setInterval(() => {
            loadMyRegistrationRequests();
        }, 30000);

        return () => clearInterval(intervalId);
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
                const id = `reg-approved-${req.id}`;
                newNotifications.push({
                    id,
                    type: 'registration_approved',
                    title: 'Registration Approved',
                    message: `Your registration with ${req.buyerCompanyName || req.buyerName || req.buyerOrganizationEmail} has been approved.`,
                    timestamp: new Date(req.reviewedAt || req.requestedAt),
                    itemId: req.id,
                    itemType: 'registration',
                    
                });
            } else if (req.status === SupplierRegistrationStatus.REJECTED) {
                const id = `reg-rejected-${req.id}`;
                newNotifications.push({
                    id,
                    type: 'registration_rejected',
                    title: 'Registration Rejected',
                    message: `Your registration with ${req.buyerCompanyName || req.buyerName || req.buyerOrganizationEmail} was rejected.`,
                    timestamp: new Date(req.reviewedAt || req.requestedAt),
                    itemId: req.id,
                    itemType: 'registration',
                    
                });
            }
        });

        // New PO received notifications (SENT status means just received)
        receivedPOs.filter(po => po.status === POStatus.SENT).forEach(po => {
            const id = `po-received-${po.id}`;
            newNotifications.push({
                id,
                type: 'new_po',
                title: 'New Purchase Order',
                message: `New PO ${po.poNumber} received - ${CURRENCY} ${(po.totalAmount || 0).toFixed(2)}`,
                timestamp: new Date(po.sentAt || po.createdAt || Date.now()),
                itemId: po.id,
                itemType: 'po',
                
            });
        });

        // Invoice status notifications
        myInvoices.forEach(inv => {
            if (inv.status === P2PInvoiceStatus.APPROVED) {
                const id = `inv-approved-${inv.id}`;
                newNotifications.push({
                    id,
                    type: 'invoice_approved',
                    title: 'Invoice Approved',
                    message: `Invoice ${inv.invoiceNumber} has been approved - ${CURRENCY} ${(inv.amount || 0).toFixed(2)}`,
                    timestamp: new Date(inv.approvedAt || inv.createdAt || Date.now()),
                    itemId: inv.id,
                    itemType: 'invoice',
                    
                });
            } else if (inv.status === P2PInvoiceStatus.REJECTED) {
                const id = `inv-rejected-${inv.id}`;
                newNotifications.push({
                    id,
                    type: 'invoice_rejected',
                    title: 'Invoice Rejected',
                    message: `Invoice ${inv.invoiceNumber} was rejected.`,
                    timestamp: new Date(inv.rejectedAt || inv.createdAt || Date.now()),
                    itemId: inv.id,
                    itemType: 'invoice',
                    
                });
            }
        });

        // Sort by timestamp descending
        newNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setNotifications(newNotifications);
    };

    useEffect(() => {
        if (!Array.isArray(notifications)) return;
        updateBizPlanetNotifications('supplier', notifications.map(notification => ({
            id: `bizplanet:supplier:${notification.id}`,
            title: notification.title,
            message: notification.message,
            time: notification.timestamp.toISOString(),
            target: 'supplier',
            focus: {
                type: notification.itemType || 'registration',
                id: notification.itemId
            }
        })));
    }, [notifications]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleAction = (event: Event) => {
            const detail = (event as CustomEvent).detail as { target?: string; focus?: { type: 'registration' | 'po' | 'invoice'; id?: string } } | undefined;
            if (!detail || detail.target !== 'supplier' || !detail.focus) return;
            setPendingFocus(detail.focus);
        };
        window.addEventListener(BIZ_PLANET_NOTIFICATION_ACTION_EVENT, handleAction);
        return () => window.removeEventListener(BIZ_PLANET_NOTIFICATION_ACTION_EVENT, handleAction);
    }, []);

    useEffect(() => {
        if (!pendingFocus || loading) return;
        const scrollTo = (selector: string) => {
            const element = document.querySelector(selector);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return true;
            }
            return false;
        };
        const highlightRow = (selector: string) => {
            const row = document.querySelector(selector);
            if (!row) return false;
            row.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
            setTimeout(() => row.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2'), 2000);
            return true;
        };

        setTimeout(() => {
            if (pendingFocus.type === 'registration') {
                setActivePanel('right');
                scrollTo('[data-section="my-registrations"]');
                if (pendingFocus.id) {
                    highlightRow(`[data-registration-id="${pendingFocus.id}"]`);
                }
            } else if (pendingFocus.type === 'po') {
                setActivePanel('left');
                scrollTo('[data-section="received-pos"]');
                if (pendingFocus.id) {
                    const po = receivedPOs.find(item => item.id === pendingFocus.id);
                    if (po) {
                        openPODetail(po);
                    }
                    highlightRow(`[data-po-id="${pendingFocus.id}"]`);
                }
            } else if (pendingFocus.type === 'invoice') {
                setActivePanel('left');
                scrollTo('[data-section="my-invoices"]');
                if (pendingFocus.id) {
                    highlightRow(`[data-invoice-id="${pendingFocus.id}"]`);
                }
            }
            setPendingFocus(null);
        }, 120);
    }, [pendingFocus, loading, receivedPOs]);

    // WebSocket listener for registration status updates, new purchase orders, and invoice updates
    useEffect(() => {
        const wsClient = getWebSocketClient();
        
        const handleDataUpdate = (data: any) => {
            if (data.type === 'SUPPLIER_REGISTRATION_APPROVED' || data.type === 'SUPPLIER_REGISTRATION_REJECTED' || data.type === 'SUPPLIER_REGISTRATION_REVOKED') {
                loadMyRegistrationRequests();
                if (data.type === 'SUPPLIER_REGISTRATION_APPROVED') {
                    showToast('Registration approved! You are now registered with the buyer organization.', 'success');
                } else if (data.type === 'SUPPLIER_REGISTRATION_REJECTED') {
                    showToast('Registration request was rejected by the buyer organization.', 'info');
                } else if (data.type === 'SUPPLIER_REGISTRATION_REVOKED') {
                    showToast('Registration with this buyer has been removed.', 'info');
                }
            } else if (data.type === 'PURCHASE_ORDER_RECEIVED') {
                // Reload purchase orders when new PO is received
                loadData();
                showToast(`New purchase order received: ${data.poNumber}`, 'info');
            }
        };

        // Handle invoice updated events (e.g., when buyer approves/rejects)
        const handleInvoiceUpdated = (data: any) => {
            loadData();
            if (data.status === 'APPROVED') {
                showToast(`Invoice ${data.invoiceNumber || ''} has been approved!`, 'success');
            } else if (data.status === 'REJECTED') {
                showToast(`Invoice ${data.invoiceNumber || ''} was rejected.`, 'info');
            }
        };

        // Subscribe to events
        const unsubscribeData = wsClient.on('data:updated', handleDataUpdate);
        const unsubscribeInvoiceUpdated = wsClient.on('p2p_invoice:updated', handleInvoiceUpdated);

        return () => {
            if (unsubscribeData) unsubscribeData();
            if (unsubscribeInvoiceUpdated) unsubscribeInvoiceUpdated();
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

    const handleUnregisterFromBuyer = async (buyerTenantId: string) => {
        try {
            await apiClient.put(`/supplier-registrations/my-registrations/${buyerTenantId}/unregister`);
            showToast('Unregistered from buyer');
            setSelectedApprovedRegistration(null);
            await loadMyRegistrationRequests();
        } catch (error: any) {
            const errorMessage = error?.response?.data?.error || error?.message || 'Failed to unregister';
            showAlert(errorMessage);
        }
    };

    const checkRegistrationStatus = async (buyerEmail: string): Promise<{ approved: boolean; pending: boolean }> => {
        try {
            // Check if any of our registration requests are approved for this buyer
            const requests = await apiClient.get<SupplierRegistrationRequest[]>('/supplier-registrations/my-requests');
            const normalizedBuyerEmail = buyerEmail.trim().toLowerCase();
            const buyerRequests = requests.filter(r => 
                r.buyerOrganizationEmail?.toLowerCase() === normalizedBuyerEmail
            );
            
            return {
                approved: buyerRequests.some(r => r.status === SupplierRegistrationStatus.APPROVED),
                pending: buyerRequests.some(r => r.status === SupplierRegistrationStatus.PENDING)
            };
        } catch (error) {
            console.error('Error checking registration status:', error);
            return { approved: false, pending: false };
        }
    };

    const openPODetail = async (po: PurchaseOrder) => {
        setPoDetailLoading(true);
        setPoReadOnly(false);
        try {
            const res = await apiClient.post<PurchaseOrder>(`/purchase-orders/${po.id}/lock`);
            setSelectedPO(res);
        } catch (err: any) {
            if (err.response?.status === 423) {
                setSelectedPO(po);
                setPoReadOnly(true);
            } else {
                setSelectedPO(po);
                if (err.response?.data?.error) showAlert(err.response.data.error);
            }
        } finally {
            setPoDetailLoading(false);
        }
    };

    const closePODetail = async () => {
        if (selectedPO && tenant?.id && selectedPO.lockedByTenantId === tenant.id) {
            try {
                await apiClient.post(`/purchase-orders/${selectedPO.id}/unlock`);
            } catch (_) { /* ignore */ }
        }
        setSelectedPO(null);
        setPoReadOnly(false);
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
        const { approved, pending } = await checkRegistrationStatus(buyerOrganizationEmail.trim());
        if (approved) {
            showAlert('You are already registered with this organization');
            return;
        }
        if (pending) {
            showAlert('A pending registration request already exists for this organization');
            return;
        }

        // Validate required supplier fields
        if (!regSupplierName.trim()) {
            showAlert('Please enter supplier name');
            return;
        }
        if (!regSupplierCompany.trim()) {
            showAlert('Please enter supplier company');
            return;
        }

        try {
            await apiClient.post('/supplier-registrations/request', {
                buyerOrganizationEmail: buyerOrganizationEmail.trim(),
                supplierMessage: supplierMessage.trim() || undefined,
                regSupplierName: regSupplierName.trim(),
                regSupplierCompany: regSupplierCompany.trim(),
                regSupplierContactNo: regSupplierContactNo.trim() || undefined,
                regSupplierAddress: regSupplierAddress.trim() || undefined,
                regSupplierDescription: regSupplierDescription.trim() || undefined
            });
            
            showToast('Registration request sent successfully');
            
            // Reset form
            setBuyerOrganizationEmail('');
            setSupplierMessage('');
            setRegSupplierName('');
            setRegSupplierCompany('');
            setRegSupplierContactNo('');
            setRegSupplierAddress('');
            setRegSupplierDescription('');
            setIsRegistrationFormOpen(false);
            
            // Reload requests
            await loadMyRegistrationRequests();
        } catch (error: any) {
            console.error('Error sending registration request:', error);
            const errorMessage = error?.response?.data?.error || error?.message || error?.error || 'Failed to send registration request';
            
            // Check for already registered error
            if (errorMessage.toLowerCase().includes('already registered')) {
                showAlert('You are already registered with this organization');
            } else if (errorMessage.toLowerCase().includes('pending')) {
                showAlert('A pending registration request already exists for this organization');
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

    // Get display status for PO from supplier's perspective
    // For supplier, "SENT" means they have "RECEIVED" it from buyer
    const getSupplierPODisplayStatus = (status: string) => {
        if (status === POStatus.SENT) {
            return 'RECEIVED';
        }
        return status;
    };

    // Count invoices by status
    const invoiceCounts = {
        pending: myInvoices.filter(inv => inv.status === P2PInvoiceStatus.PENDING).length,
        underReview: myInvoices.filter(inv => inv.status === P2PInvoiceStatus.UNDER_REVIEW).length,
        approved: myInvoices.filter(inv => inv.status === P2PInvoiceStatus.APPROVED).length,
    };

    // Get approved registrations for the right panel
    const approvedRegistrations = Array.isArray(myRegistrationRequests)
        ? myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.APPROVED && r.isRegistrationActive !== false)
        : [];

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
            <div className="flex-shrink-0 px-3 sm:px-4 py-2 sm:py-3 bg-white border-b border-slate-200">
                <div className="flex justify-between items-center gap-2">
                    <div className="min-w-0">
                        <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">Supplier Portal</h1>
                        <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">Manage purchase orders and invoices</p>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <Button
                            onClick={() => setIsRegistrationFormOpen(!isRegistrationFormOpen)}
                            className="bg-slate-900 text-white hover:bg-slate-800 text-[10px] sm:text-sm py-1 sm:py-1.5 px-2 sm:px-3"
                            type="button"
                        >
                            {isRegistrationFormOpen ? 'Cancel' : '+ Register'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Mobile Panel Toggle */}
            <div className="flex-shrink-0 md:hidden px-3 py-2 bg-white border-b border-slate-200">
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => setActivePanel('left')}
                        className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-colors ${
                            activePanel === 'left' 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        POs & Invoices
                    </button>
                    <button
                        type="button"
                        onClick={() => setActivePanel('right')}
                        className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-colors ${
                            activePanel === 'right' 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Organizations ({approvedRegistrations.length})
                    </button>
                </div>
            </div>

            {/* Registration Form (Collapsible) */}
            {isRegistrationFormOpen && (
                <div className="flex-shrink-0 p-2 sm:p-4 bg-blue-50/50 border-b border-blue-200">
                    <Card className="p-3 sm:p-4 border border-blue-200">
                        <h2 className="text-xs sm:text-sm font-semibold text-slate-900 mb-2 sm:mb-3">Register with Buyer Organization</h2>
                        <div className="space-y-3">
                            {/* Buyer Information */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                <Input
                                    label="Buyer Email *"
                                    type="email"
                                    value={buyerOrganizationEmail}
                                    onChange={(e) => setBuyerOrganizationEmail(e.target.value)}
                                    placeholder="buyer@company.com"
                                    required
                                />
                                <div>
                                    <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Message (Optional)</label>
                                    <input
                                        type="text"
                                        className="block w-full px-2 sm:px-3 py-1.5 sm:py-2 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-xs sm:text-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors"
                                        value={supplierMessage}
                                        onChange={(e) => setSupplierMessage(e.target.value)}
                                        placeholder="Optional message to buyer"
                                    />
                                </div>
                            </div>
                            
                            {/* Supplier Details Section */}
                            <div className="border-t border-blue-200 pt-3">
                                <h3 className="text-[10px] sm:text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Supplier Information</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                                    <Input
                                        label="Supplier Name *"
                                        type="text"
                                        value={regSupplierName}
                                        onChange={(e) => setRegSupplierName(e.target.value)}
                                        placeholder="Contact person name"
                                        required
                                    />
                                    <Input
                                        label="Supplier Company *"
                                        type="text"
                                        value={regSupplierCompany}
                                        onChange={(e) => setRegSupplierCompany(e.target.value)}
                                        placeholder="Company name"
                                        required
                                    />
                                    <Input
                                        label="Contact No"
                                        type="text"
                                        value={regSupplierContactNo}
                                        onChange={(e) => setRegSupplierContactNo(e.target.value)}
                                        placeholder="Phone number"
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-2 sm:mt-3">
                                    <div>
                                        <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Supplier Address</label>
                                        <input
                                            type="text"
                                            className="block w-full px-2 sm:px-3 py-1.5 sm:py-2 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-xs sm:text-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors"
                                            value={regSupplierAddress}
                                            onChange={(e) => setRegSupplierAddress(e.target.value)}
                                            placeholder="Business address"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Description</label>
                                        <input
                                            type="text"
                                            className="block w-full px-2 sm:px-3 py-1.5 sm:py-2 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-xs sm:text-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors"
                                            value={regSupplierDescription}
                                            onChange={(e) => setRegSupplierDescription(e.target.value)}
                                            placeholder="Products/services offered"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex justify-end gap-2 pt-2 border-t border-blue-200">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setBuyerOrganizationEmail('');
                                        setSupplierMessage('');
                                        setRegSupplierName('');
                                        setRegSupplierCompany('');
                                        setRegSupplierContactNo('');
                                        setRegSupplierAddress('');
                                        setRegSupplierDescription('');
                                        setIsRegistrationFormOpen(false);
                                    }}
                                    className="text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSubmitRegistration}
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                                    disabled={!buyerOrganizationEmail.trim() || !regSupplierName.trim() || !regSupplierCompany.trim()}
                                >
                                    Send Request
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Main Split Content Area */}
            <div className="flex-1 flex overflow-hidden p-2 sm:p-3 gap-2 sm:gap-3">
                {/* Left Panel - POs, Invoices, Bills */}
                <div className={`flex-1 flex flex-col gap-2 sm:gap-3 overflow-hidden min-w-0 ${activePanel !== 'left' ? 'hidden md:flex' : 'flex'}`}>
                    {/* Invoice Status Tracker - Compact */}
                    <Card className="flex-shrink-0 p-2 sm:p-3">
                        <div className="grid grid-cols-3 gap-1 sm:gap-2">
                            <div className="text-center p-1.5 sm:p-2 bg-yellow-50 rounded-lg">
                                <div className="text-base sm:text-lg font-bold text-yellow-700">{invoiceCounts.pending}</div>
                                <div className="text-[8px] sm:text-[10px] text-yellow-600 uppercase">Pending</div>
                            </div>
                            <div className="text-center p-1.5 sm:p-2 bg-orange-50 rounded-lg">
                                <div className="text-base sm:text-lg font-bold text-orange-700">{invoiceCounts.underReview}</div>
                                <div className="text-[8px] sm:text-[10px] text-orange-600 uppercase">Review</div>
                            </div>
                            <div className="text-center p-1.5 sm:p-2 bg-green-50 rounded-lg">
                                <div className="text-base sm:text-lg font-bold text-green-700">{invoiceCounts.approved}</div>
                                <div className="text-[8px] sm:text-[10px] text-green-600 uppercase">Approved</div>
                            </div>
                        </div>
                    </Card>

                    {/* Received Purchase Orders */}
                    <Card className="flex-1 overflow-hidden flex flex-col min-h-0" data-section="received-pos">
                        <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-200 flex-shrink-0">
                            <h2 className="text-xs sm:text-sm font-semibold text-slate-900">Received Purchase Orders</h2>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {/* Mobile Card View */}
                            <div className="sm:hidden divide-y divide-slate-200">
                                {!Array.isArray(receivedPOs) || receivedPOs.length === 0 ? (
                                    <div className="px-3 py-6 text-center text-slate-500 text-xs">
                                        No received purchase orders
                                    </div>
                                ) : (
                                    receivedPOs.map(po => (
                                        <div key={po.id} data-po-id={po.id} className="p-3 hover:bg-slate-50 transition-all">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium text-slate-900 truncate">{po.poNumber || 'N/A'}</p>
                                                    <p className="text-[10px] text-slate-500 truncate">{po.buyerCompanyName || po.buyerTenantId}</p>
                                                    {po.createdAt && (
                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                            Created: {new Date(po.createdAt).toLocaleDateString()}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full flex-shrink-0 ${getStatusColor('RECEIVED')}`}>
                                                    {getSupplierPODisplayStatus(po.status)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-xs font-medium text-slate-900">{CURRENCY} {(po.totalAmount || 0).toFixed(2)}</span>
                                                <div className="flex gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => openPODetail(po)}
                                                        className="p-1.5 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                        title="View PO Details"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </button>
                                                    <Button
                                                        variant="primary"
                                                        onClick={() => handleFlipToInvoice(po.id)}
                                                        className="text-[9px] bg-blue-600 hover:bg-blue-700 text-white py-1 px-2"
                                                        disabled={po.status !== POStatus.SENT && po.status !== POStatus.RECEIVED}
                                                    >
                                                        Create Invoice
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            {/* Desktop Table View */}
                            <table className="w-full hidden sm:table">
                                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                    <tr>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">PO #</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Buyer</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Created</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-right text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Amount</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Status</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {!Array.isArray(receivedPOs) || receivedPOs.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-6 text-center text-slate-500 text-xs">
                                                No received purchase orders
                                            </td>
                                        </tr>
                                    ) : (
                                        receivedPOs.map(po => (
                                            <tr key={po.id} data-po-id={po.id} className="hover:bg-slate-50 transition-all">
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-900 font-medium">{po.poNumber || 'N/A'}</td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-600 truncate max-w-[80px] sm:max-w-[100px]">{po.buyerCompanyName || po.buyerTenantId}</td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-500">
                                                    {po.createdAt ? new Date(po.createdAt).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-right font-medium text-slate-900">
                                                    {CURRENCY} {(po.totalAmount || 0).toFixed(2)}
                                                </td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                                    <span className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium rounded-full ${getStatusColor('RECEIVED')}`}>
                                                        {getSupplierPODisplayStatus(po.status)}
                                                    </span>
                                                </td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                                    <div className="flex gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openPODetail(po)}
                                                            className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                            title="View PO Details"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                        </button>
                                                        <Button
                                                            variant="primary"
                                                            onClick={() => handleFlipToInvoice(po.id)}
                                                            className="text-[9px] sm:text-[10px] bg-blue-600 hover:bg-blue-700 text-white py-0.5 sm:py-1 px-1.5 sm:px-2"
                                                            disabled={po.status !== POStatus.SENT && po.status !== POStatus.RECEIVED}
                                                        >
                                                            Invoice
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

                    {/* My Invoices */}
                    <Card className="flex-1 overflow-hidden flex flex-col min-h-0" data-section="my-invoices">
                        <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-200 flex-shrink-0">
                            <h2 className="text-xs sm:text-sm font-semibold text-slate-900">My Invoices</h2>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {/* Mobile Card View */}
                            <div className="sm:hidden divide-y divide-slate-200">
                                {!Array.isArray(myInvoices) || myInvoices.length === 0 ? (
                                    <div className="px-3 py-6 text-center text-slate-500 text-xs">
                                        No invoices submitted
                                    </div>
                                ) : (
                                    myInvoices.map(invoice => (
                                        <div key={invoice.id} data-invoice-id={invoice.id} className="p-3 hover:bg-slate-50 transition-all">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium text-slate-900 truncate">{invoice.invoiceNumber}</p>
                                                    <p className="text-[10px] text-slate-500">PO: {invoice.poNumber || invoice.poId}</p>
                                                </div>
                                                <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full flex-shrink-0 ${getStatusColor(invoice.status)}`}>
                                                    {invoice.status}
                                                </span>
                                            </div>
                                            <div className="mt-1">
                                                <span className="text-xs font-medium text-slate-900">{CURRENCY} {(invoice.amount || 0).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            {/* Desktop Table View */}
                            <table className="w-full hidden sm:table">
                                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                    <tr>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Invoice #</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">PO #</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-right text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Amount</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {!Array.isArray(myInvoices) || myInvoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-3 py-6 text-center text-slate-500 text-xs">
                                                No invoices submitted
                                            </td>
                                        </tr>
                                    ) : (
                                        myInvoices.map(invoice => (
                                            <tr key={invoice.id} data-invoice-id={invoice.id} className="hover:bg-slate-50 transition-all">
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-900 font-medium">{invoice.invoiceNumber}</td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-600">{invoice.poNumber || invoice.poId}</td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-right font-medium text-slate-900">
                                                    {CURRENCY} {(invoice.amount || 0).toFixed(2)}
                                                </td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                                    <span className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium rounded-full ${getStatusColor(invoice.status)}`}>
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
                <div className={`w-full md:w-72 lg:w-80 flex-shrink-0 flex flex-col gap-2 sm:gap-3 overflow-hidden ${activePanel !== 'right' ? 'hidden md:flex' : 'flex'}`}>
                    {/* Registered Organizations */}
                    <Card className="flex-1 overflow-hidden flex flex-col" data-section="my-registrations">
                        <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-indigo-50 to-purple-50">
                            <h2 className="text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-1 sm:gap-2">
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                Registered Organizations
                            </h2>
                            <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">{approvedRegistrations.length} active</p>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {approvedRegistrations.length === 0 ? (
                                <div className="px-3 py-6 sm:py-8 text-center">
                                    <svg className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    <p className="text-[10px] sm:text-xs text-slate-500">No registered organizations yet</p>
                                    <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">Click "+ Register" to get started</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {approvedRegistrations.map(reg => (
                                        <div
                                            key={reg.id}
                                            onClick={() => setSelectedApprovedRegistration(reg)}
                                            className="px-2 sm:px-3 py-2 sm:py-2.5 hover:bg-slate-50 transition-all cursor-pointer"
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[10px] sm:text-xs font-bold flex-shrink-0">
                                                    {(reg.buyerCompanyName || reg.buyerName || 'O').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] sm:text-xs font-medium text-slate-900 truncate">
                                                        {reg.buyerCompanyName || reg.buyerName || 'Organization'}
                                                    </p>
                                                    <p className="text-[9px] sm:text-[10px] text-slate-500 truncate">{reg.buyerOrganizationEmail}</p>
                                                    <div className="flex items-center gap-1 mt-0.5 sm:mt-1">
                                                        <span className="px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[9px] font-medium rounded-full bg-green-100 text-green-700">
                                                            Active
                                                        </span>
                                                        <span className="text-[8px] sm:text-[9px] text-slate-400">
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
                    {Array.isArray(myRegistrationRequests) && myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.PENDING).length > 0 && (
                        <Card className="flex-shrink-0 overflow-hidden">
                            <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-200 bg-yellow-50">
                                <h2 className="text-[10px] sm:text-xs font-semibold text-slate-900 flex items-center gap-1 sm:gap-2">
                                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Pending Requests
                                </h2>
                            </div>
                            <div className="max-h-24 sm:max-h-32 overflow-auto">
                                {myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.PENDING).map(reg => (
                                    <div key={reg.id} className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100 last:border-0">
                                        <p className="text-[10px] sm:text-xs font-medium text-slate-700 truncate">{reg.buyerOrganizationEmail}</p>
                                        <p className="text-[9px] sm:text-[10px] text-slate-500">Requested {new Date(reg.requestedAt).toLocaleDateString()}</p>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Rejected Registrations */}
                    {Array.isArray(myRegistrationRequests) && myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.REJECTED).length > 0 && (
                        <Card className="flex-shrink-0 overflow-hidden">
                            <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-200 bg-red-50">
                                <h2 className="text-[10px] sm:text-xs font-semibold text-slate-900 flex items-center gap-1 sm:gap-2">
                                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Rejected
                                </h2>
                            </div>
                            <div className="max-h-20 sm:max-h-24 overflow-auto">
                                {myRegistrationRequests.filter(r => r.status === SupplierRegistrationStatus.REJECTED).map(reg => (
                                    <div key={reg.id} className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100 last:border-0">
                                        <p className="text-[10px] sm:text-xs font-medium text-slate-700 truncate">{reg.buyerOrganizationEmail}</p>
                                        <p className="text-[9px] sm:text-[10px] text-red-500">{reg.buyerComments || 'No reason provided'}</p>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            {/* Purchase Order Detail Modal */}
            {selectedPO && (
                <Modal
                    isOpen={!!selectedPO}
                    onClose={closePODetail}
                    title={`PO: ${selectedPO.poNumber}`}
                    size="lg"
                >
                    <div className="space-y-4">
                        {poDetailLoading && (
                            <div className="flex items-center justify-center py-4">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600" />
                            </div>
                        )}
                        {!poDetailLoading && poReadOnly && (
                            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-xs sm:text-sm">
                                This PO is locked by the buyer. You can view it in read-only mode.
                            </div>
                        )}
                        {!poDetailLoading && (
                        <>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-xs text-slate-500 mb-1">PO Number</p>
                                <p className="font-semibold text-slate-900 text-sm">{selectedPO.poNumber}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Status</p>
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor('RECEIVED')}`}>
                                    {getSupplierPODisplayStatus(selectedPO.status)}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Buyer</p>
                                <p className="font-semibold text-slate-900 text-sm">
                                    {selectedPO.buyerCompanyName || selectedPO.buyerName || selectedPO.buyerTenantId}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Total Amount</p>
                                <p className="font-semibold text-slate-900 text-sm">{CURRENCY} {(selectedPO.totalAmount || 0).toFixed(2)}</p>
                            </div>
                            {selectedPO.targetDeliveryDate && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Target Delivery</p>
                                    <p className="font-semibold text-orange-600 text-sm">{new Date(selectedPO.targetDeliveryDate).toLocaleDateString()}</p>
                                </div>
                            )}
                            {selectedPO.description && (
                                <div className="col-span-2">
                                    <p className="text-xs text-slate-500 mb-1">Description</p>
                                    <p className="text-sm text-slate-900">{selectedPO.description}</p>
                                </div>
                            )}
                        </div>

                        {selectedPO.items && Array.isArray(selectedPO.items) && selectedPO.items.length > 0 && (
                            <div className="pt-3 border-t border-slate-200">
                                <h3 className="text-xs font-semibold text-slate-900 mb-2">Line Items</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-2 py-1.5 text-left font-medium text-slate-500">Description</th>
                                                <th className="px-2 py-1.5 text-right font-medium text-slate-500">Qty</th>
                                                <th className="px-2 py-1.5 text-right font-medium text-slate-500">Price</th>
                                                <th className="px-2 py-1.5 text-right font-medium text-slate-500">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {(Array.isArray(selectedPO.items) ? selectedPO.items : []).map((item, index) => (
                                                <tr key={item.id || index}>
                                                    <td className="px-2 py-1.5 text-slate-900">{item.description || '-'}</td>
                                                    <td className="px-2 py-1.5 text-right text-slate-700">{item.quantity || 0}</td>
                                                    <td className="px-2 py-1.5 text-right text-slate-700">{CURRENCY} {(item.unitPrice || 0).toFixed(2)}</td>
                                                    <td className="px-2 py-1.5 text-right font-medium text-slate-900">{CURRENCY} {(item.total || 0).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                            <tr>
                                                <td colSpan={3} className="px-2 py-1.5 font-semibold text-slate-900 text-right">Total:</td>
                                                <td className="px-2 py-1.5 font-bold text-slate-900 text-right">{CURRENCY} {(selectedPO.totalAmount || 0).toFixed(2)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                            <Button
                                variant="primary"
                                onClick={() => {
                                    handleFlipToInvoice(selectedPO.id);
                                    closePODetail();
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                                disabled={(selectedPO.status !== POStatus.SENT && selectedPO.status !== POStatus.RECEIVED) || poReadOnly}
                            >
                                Create Invoice
                            </Button>
                            <Button variant="secondary" onClick={closePODetail}>Close</Button>
                        </div>
                        </>
                        )}
                    </div>
                </Modal>
            )}

            {/* Approved Registration Detail Modal - open on click, Unregister */}
            {selectedApprovedRegistration && (
                <Modal
                    isOpen={!!selectedApprovedRegistration}
                    onClose={() => setSelectedApprovedRegistration(null)}
                    title="Registered Organization"
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Company</p>
                                <p className="font-semibold text-slate-900 text-sm">{selectedApprovedRegistration.buyerCompanyName || selectedApprovedRegistration.buyerName || 'Organization'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Email</p>
                                <p className="text-sm text-slate-900">{selectedApprovedRegistration.buyerOrganizationEmail || '-'}</p>
                            </div>
                            {selectedApprovedRegistration.reviewedAt && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Approved</p>
                                    <p className="text-sm text-slate-900">{new Date(selectedApprovedRegistration.reviewedAt).toLocaleDateString()}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between pt-3 border-t border-slate-200">
                            <Button variant="secondary" onClick={() => setSelectedApprovedRegistration(null)}>Close</Button>
                            <Button
                                variant="primary"
                                className="bg-amber-600 hover:bg-amber-700"
                                onClick={() => {
                                    if (window.confirm('Unregister from this buyer? You will be removed from their registered suppliers list.')) {
                                        handleUnregisterFromBuyer(selectedApprovedRegistration.buyerTenantId);
                                    }
                                }}
                            >
                                Unregister
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default SupplierPortal;

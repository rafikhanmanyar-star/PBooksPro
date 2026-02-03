import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { apiClient } from '../../services/api/client';
import { PurchaseOrder, P2PInvoice, POStatus, P2PInvoiceStatus, POItem, TransactionType, SupplierRegistrationRequest, SupplierRegistrationStatus } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY, ICONS } from '../../constants';
import { getWebSocketClient } from '../../services/websocketClient';
import { formatDate } from '../../utils/dateUtils';
import { BIZ_PLANET_NOTIFICATION_ACTION_EVENT, updateBizPlanetNotifications } from '../../utils/bizPlanetNotifications';
import { usePrintContext } from '../../context/PrintContext';

interface Supplier {
    id: string;
    supplierTenantId?: string;
    name: string;
    company_name?: string;
    companyName?: string;
    email?: string;
    contactNo?: string;
    address?: string;
    registeredAt?: string;
}

const BuyerDashboard: React.FC = () => {
    const { tenant } = useAuth();
    const { state } = useAppContext();
    const { showToast, showAlert } = useNotification();
    const [outstandingPOs, setOutstandingPOs] = useState<PurchaseOrder[]>([]);
    const [invoicesAwaitingApproval, setInvoicesAwaitingApproval] = useState<P2PInvoice[]>([]);
    const [registrationRequests, setRegistrationRequests] = useState<SupplierRegistrationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
    const [poDetailLoading, setPoDetailLoading] = useState(false);
    const [poReadOnly, setPoReadOnly] = useState(false);
    const [submittingRevision, setSubmittingRevision] = useState(false);
    const [selectedRegisteredSupplier, setSelectedRegisteredSupplier] = useState<Supplier | null>(null);
    const [pendingFocus, setPendingFocus] = useState<{ type: 'registration_request' | 'invoice_awaiting'; id?: string } | null>(null);
    
    // Mobile responsive state
    const [activePanel, setActivePanel] = useState<'left' | 'right'>('left');
    
    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [registeredSuppliers, setRegisteredSuppliers] = useState<Supplier[]>([]);
    const [supplierTenantId, setSupplierTenantId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [poNumber, setPoNumber] = useState('');
    const [poDescription, setPoDescription] = useState('');
    const [targetDeliveryDate, setTargetDeliveryDate] = useState('');
    const [items, setItems] = useState<POItem[]>([]);

    // Generate PO number when form opens
    useEffect(() => {
        if (isFormOpen && !poNumber) {
            const newPoNumber = `PO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
            setPoNumber(newPoNumber);
        }
    }, [isFormOpen]);

    // Get expense categories for line items
    const expenseCategories = useMemo(() => 
        state.categories.filter(c => c.type === TransactionType.EXPENSE),
        [state.categories]
    );

    // Get projects list
    const projects = useMemo(() => state.projects || [], [state.projects]);

    const bizPlanetNotifications = useMemo(() => {
        const items: Array<{
            id: string;
            title: string;
            message: string;
            time: string;
            target: 'buyer';
            focus: { type: 'registration_request' | 'invoice_awaiting'; id?: string };
        }> = [];

        registrationRequests.forEach(request => {
            const name = request.regSupplierCompany || request.supplierCompanyName || request.regSupplierName || request.supplierName || 'Supplier';
            items.push({
                id: `bizplanet:buyer:registration:${request.id}`,
                title: 'Supplier registration request',
                message: `${name} requested to register.`,
                time: new Date(request.requestedAt || Date.now()).toISOString(),
                target: 'buyer',
                focus: {
                    type: 'registration_request',
                    id: request.id
                }
            });
        });

        invoicesAwaitingApproval.forEach(invoice => {
            items.push({
                id: `bizplanet:buyer:invoice:${invoice.id}`,
                title: 'Invoice awaiting approval',
                message: `${invoice.invoiceNumber || 'Invoice'} • ${CURRENCY} ${(invoice.amount || 0).toFixed(2)}`,
                time: new Date(invoice.createdAt || invoice.updatedAt || Date.now()).toISOString(),
                target: 'buyer',
                focus: {
                    type: 'invoice_awaiting',
                    id: invoice.id
                }
            });
        });

        return items;
    }, [registrationRequests, invoicesAwaitingApproval]);

    useEffect(() => {
        updateBizPlanetNotifications('buyer', bizPlanetNotifications);
    }, [bizPlanetNotifications]);

    useEffect(() => {
        loadData();
        loadRegistrationRequests();
        loadRegisteredSuppliers();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleAction = (event: Event) => {
            const detail = (event as CustomEvent).detail as { target?: string; focus?: { type: 'registration_request' | 'invoice_awaiting'; id?: string } } | undefined;
            if (!detail || detail.target !== 'buyer' || !detail.focus) return;
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
            }
        };
        const highlightRow = (selector: string) => {
            const row = document.querySelector(selector);
            if (!row) return;
            row.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
            setTimeout(() => row.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2'), 2000);
        };

        setTimeout(() => {
            setActivePanel('left');
            if (pendingFocus.type === 'registration_request') {
                scrollTo('[data-section="registration-requests"]');
                if (pendingFocus.id) {
                    highlightRow(`[data-registration-request-id="${pendingFocus.id}"]`);
                }
            } else if (pendingFocus.type === 'invoice_awaiting') {
                scrollTo('[data-section="invoices-awaiting"]');
                if (pendingFocus.id) {
                    highlightRow(`[data-awaiting-invoice-id="${pendingFocus.id}"]`);
                }
            }
            setPendingFocus(null);
        }, 120);
    }, [pendingFocus, loading, registrationRequests, invoicesAwaitingApproval]);

    // WebSocket listener for new registration requests and invoice updates
    useEffect(() => {
        const wsClient = getWebSocketClient();
        
        const handleDataUpdate = (data: any) => {
            if (data.type === 'SUPPLIER_REGISTRATION_REQUEST') {
                // Reload registration requests when new request arrives
                loadRegistrationRequests();
                showToast('New supplier registration request received', 'info');
            } else if (data.type === 'REGISTERED_SUPPLIERS_UPDATED') {
                // Reload registered suppliers when one is approved (status + DB updated)
                loadRegisteredSuppliers();
            }
        };

        // Handle P2P invoice created events
        const handleInvoiceCreated = (data: any) => {
            // Reload data when a supplier creates an invoice
            loadData();
            showToast(`New invoice received: ${data.invoiceNumber || 'Invoice'}`, 'info');
        };

        // Handle P2P invoice updated events (e.g., status changes)
        const handleInvoiceUpdated = (data: any) => {
            // Reload data when an invoice is updated
            loadData();
        };

        // Handle PO updated events
        const handlePOUpdated = (data: any) => {
            // Reload data when a PO is updated
            loadData();
        };

        // Subscribe to events
        const unsubscribeData = wsClient.on('data:updated', handleDataUpdate);
        const unsubscribeInvoiceCreated = wsClient.on('p2p_invoice:created', handleInvoiceCreated);
        const unsubscribeInvoiceUpdated = wsClient.on('p2p_invoice:updated', handleInvoiceUpdated);
        const unsubscribePOUpdated = wsClient.on('purchase_order:updated', handlePOUpdated);

        return () => {
            if (unsubscribeData) unsubscribeData();
            if (unsubscribeInvoiceCreated) unsubscribeInvoiceCreated();
            if (unsubscribeInvoiceUpdated) unsubscribeInvoiceUpdated();
            if (unsubscribePOUpdated) unsubscribePOUpdated();
        };
    }, [showToast]);

    const loadData = async () => {
        try {
            setLoading(true);

            // Load outstanding POs (status: SENT, RECEIVED, INVOICED, DELIVERED)
            // Filter to only show POs created by this tenant (as buyer)
            const outstandingStatuses = ['SENT', 'RECEIVED', 'INVOICED', 'DELIVERED'];
            const allPOs = await apiClient.get<PurchaseOrder[]>('/purchase-orders');
            const outstanding = allPOs.filter(po => 
                outstandingStatuses.includes(po.status) && 
                po.buyerTenantId === tenant?.id
            );
            setOutstandingPOs(outstanding);

            // Load invoices awaiting approval (status: PENDING, UNDER_REVIEW)
            // Only show invoices where this tenant is the buyer (they need to approve)
            const allInvoices = await apiClient.get<P2PInvoice[]>('/p2p-invoices');
            const awaitingApproval = allInvoices.filter(inv => 
                (inv.status === P2PInvoiceStatus.PENDING || inv.status === P2PInvoiceStatus.UNDER_REVIEW) &&
                inv.buyerTenantId === tenant?.id
            );
            setInvoicesAwaitingApproval(awaitingApproval);

        } catch (error) {
            console.error('Error loading buyer dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadRegisteredSuppliers = async () => {
        try {
            // Only load registered (approved) suppliers
            const registeredList = await apiClient.get<Supplier[]>('/supplier-registrations/registered');
            setRegisteredSuppliers(registeredList);
            // Also update suppliers list for backward compatibility
            setSuppliers(registeredList);
        } catch (error) {
            console.error('Error loading registered suppliers:', error);
        }
    };

    const loadRegistrationRequests = async () => {
        try {
            const requests = await apiClient.get<SupplierRegistrationRequest[]>('/supplier-registrations/requests?status=PENDING');
            setRegistrationRequests(requests);
        } catch (error) {
            console.error('Error loading registration requests:', error);
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

    const handleApproveRegistration = async (requestId: string, comments?: string) => {
        try {
            await apiClient.put(`/supplier-registrations/${requestId}/approve`, { comments });
            showToast('Supplier registration approved successfully');
            await loadRegistrationRequests();
            await loadRegisteredSuppliers();
        } catch (error: any) {
            console.error('Error approving registration:', error);
            const errorMessage = error?.response?.data?.error || error?.message || error?.error || 'Failed to approve registration request';
            showAlert(errorMessage);
        }
    };

    const handleRejectRegistration = async (requestId: string, comments?: string) => {
        try {
            await apiClient.put(`/supplier-registrations/${requestId}/reject`, { comments });
            showToast('Supplier registration rejected');
            await loadRegistrationRequests();
        } catch (error: any) {
            console.error('Error rejecting registration:', error);
            const errorMessage = error?.response?.data?.error || error?.message || error?.error || 'Failed to reject registration request';
            showAlert(errorMessage);
        }
    };

    const handleUnregisterSupplier = async (supplierId: string) => {
        const tenantId = (registeredSuppliers.find(s => s.id === supplierId || s.supplierTenantId === supplierId) as Supplier)?.supplierTenantId || supplierId;
        try {
            await apiClient.put(`/supplier-registrations/registered/${tenantId}/unregister`);
            showToast('Supplier unregistered');
            setSelectedRegisteredSupplier(null);
            await loadRegisteredSuppliers();
        } catch (error: any) {
            const errorMessage = error?.response?.data?.error || error?.message || 'Failed to unregister supplier';
            showAlert(errorMessage);
        }
    };

    // PO Form handlers
    const addItem = () => {
        setItems([...items, {
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            description: '',
            quantity: 1,
            unitPrice: 0,
            total: 0,
            categoryId: ''
        }]);
    };

    const removeItem = (itemId: string) => {
        setItems(items.filter(item => item.id !== itemId));
    };

    const updateItem = (itemId: string, field: keyof POItem, value: any) => {
        setItems(items.map(item => {
            if (item.id === itemId) {
                const updated = { ...item, [field]: value };
                // Auto-calculate total if quantity or unitPrice changes
                if (field === 'quantity' || field === 'unitPrice') {
                    updated.total = updated.quantity * updated.unitPrice;
                }
                return updated;
            }
            return item;
        }));
    };

    const totalAmount = useMemo(() => {
        return items.reduce((sum, item) => sum + item.total, 0);
    }, [items]);

    /** Merged PO data for print: current form state overrides selectedPO so print shows what user sees. */
    const poPrintData = useMemo((): PurchaseOrder | null => {
        if (!selectedPO) return null;
        const supplier = (Array.isArray(registeredSuppliers) ? registeredSuppliers : []).find(
            s => (s.supplierTenantId || s.id) === supplierTenantId
        );
        const supplierDisplay = supplier?.companyName || supplier?.company_name || supplier?.name
            || selectedPO.supplierCompanyName || selectedPO.supplierName || selectedPO.supplierTenantId;
        const project = (Array.isArray(projects) ? projects : []).find(p => p.id === projectId);
        const projectDisplay = project?.name || selectedPO.projectName || selectedPO.projectId;
        return {
            ...selectedPO,
            poNumber: poNumber || selectedPO.poNumber,
            description: poDescription !== undefined && poDescription !== '' ? poDescription : selectedPO.description,
            targetDeliveryDate: targetDeliveryDate || selectedPO.targetDeliveryDate,
            projectId: projectId || selectedPO.projectId,
            projectName: projectDisplay,
            supplierCompanyName: supplierDisplay,
            items: items.length > 0 ? items : selectedPO.items || [],
            totalAmount: items.length > 0 ? totalAmount : (selectedPO.totalAmount ?? 0),
        };
    }, [selectedPO, poNumber, poDescription, targetDeliveryDate, projectId, supplierTenantId, items, totalAmount, registeredSuppliers, projects]);

    const handleSubmitPO = async () => {
        // Validation
        if (!supplierTenantId) {
            showAlert('Please select a supplier');
            return;
        }

        if (!projectId) {
            showAlert('Please select a project');
            return;
        }

        if (!targetDeliveryDate) {
            showAlert('Please select a target delivery date');
            return;
        }

        if (items.length === 0) {
            showAlert('Please add at least one item');
            return;
        }

        // Validate items
        for (const item of items) {
            if (!item.description || !item.categoryId || item.quantity <= 0 || item.unitPrice <= 0) {
                showAlert('Please fill in all item fields (description, category, quantity, and price)');
                return;
            }
        }

        try {
            const poData = {
                poNumber,
                supplierTenantId,
                projectId,
                targetDeliveryDate,
                items: items.map(item => ({
                    id: item.id,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.total,
                    categoryId: item.categoryId
                })),
                description: poDescription,
                totalAmount
            };

            await apiClient.post('/purchase-orders', poData);
            showToast('Purchase Order created successfully');
            
            // Reset form
            setSupplierTenantId('');
            setProjectId('');
            setPoNumber('');
            setPoDescription('');
            setTargetDeliveryDate('');
            setItems([]);
            setIsFormOpen(false);

            // Reload data
            await loadData();
        } catch (error: any) {
            console.error('Error creating purchase order:', error);
            showAlert(error.response?.data?.error || 'Failed to create purchase order');
        }
    };

    const handleCancelPO = () => {
        setSupplierTenantId('');
        setProjectId('');
        setPoNumber('');
        setPoDescription('');
        setTargetDeliveryDate('');
        setItems([]);
        setIsFormOpen(false);
    };

    const openPODetail = async (po: PurchaseOrder) => {
        setPoDetailLoading(true);
        setPoReadOnly(false);
        try {
            const res = await apiClient.post<PurchaseOrder>(`/purchase-orders/${po.id}/lock`);
            setSelectedPO(res);
            fillFormFromPO(res);
        } catch (err: any) {
            if (err.response?.status === 423) {
                setSelectedPO(po);
                setPoReadOnly(true);
                fillFormFromPO(po);
            } else {
                setSelectedPO(po);
                fillFormFromPO(po);
                if (err.response?.data?.error) showAlert(err.response.data.error);
            }
        } finally {
            setPoDetailLoading(false);
        }
    };

    const fillFormFromPO = (po: PurchaseOrder) => {
        setSupplierTenantId(po.supplierTenantId || '');
        setProjectId(po.projectId || '');
        setPoNumber(po.poNumber || '');
        setPoDescription(po.description || '');
        setTargetDeliveryDate(po.targetDeliveryDate ? String(po.targetDeliveryDate).slice(0, 10) : '');
        setItems(Array.isArray(po.items) ? po.items.map(i => ({
            ...i,
            id: i.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            total: (i.quantity || 0) * (i.unitPrice || 0),
        })) : []);
    };

    const closePODetail = async () => {
        if (selectedPO && tenant?.id && selectedPO.lockedByTenantId === tenant.id) {
            try {
                await apiClient.post(`/purchase-orders/${selectedPO.id}/unlock`);
            } catch (_) { /* ignore */ }
        }
        setSelectedPO(null);
        setPoReadOnly(false);
        setSupplierTenantId('');
        setProjectId('');
        setPoNumber('');
        setPoDescription('');
        setTargetDeliveryDate('');
        setItems([]);
        setIsFormOpen(false);
    };

    const canSubmitRevision = selectedPO && tenant?.id === selectedPO.tenantId &&
        (selectedPO.status === POStatus.SENT || selectedPO.status === POStatus.RECEIVED) &&
        selectedPO.lockedByTenantId === tenant?.id;

    const { print: triggerPrint } = usePrintContext();

    const submitRevision = async () => {
        if (!selectedPO) return;
        setSubmittingRevision(true);
        try {
            const payload = {
                items: items.map(i => ({ id: i.id, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, categoryId: i.categoryId })),
                description: poDescription || undefined,
                targetDeliveryDate: targetDeliveryDate || undefined,
                projectId: projectId || undefined,
                totalAmount,
            };
            await apiClient.put(`/purchase-orders/${selectedPO.id}`, payload);
            showToast('PO revision submitted');
            await loadData();
            closePODetail();
        } catch (e: any) {
            showAlert(e.response?.data?.error || 'Failed to submit revision');
        } finally {
            setSubmittingRevision(false);
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
        <div className="flex flex-col h-full bg-slate-50/50 overflow-hidden">
            {/* Compact Header */}
            <div className="flex-shrink-0 px-3 sm:px-4 py-2 sm:py-3 bg-white border-b border-slate-200">
                <div className="flex justify-between items-center gap-2">
                    <div className="min-w-0">
                        <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">Buyer Dashboard</h1>
                        <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">Manage purchase orders and suppliers</p>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <Button 
                            onClick={() => {
                                if (isFormOpen || selectedPO) {
                                    if (selectedPO) closePODetail();
                                    else { handleCancelPO(); setIsFormOpen(false); }
                                } else {
                                    setSelectedPO(null);
                                    setPoReadOnly(false);
                                    setIsFormOpen(true);
                                }
                            }} 
                            className="bg-slate-900 text-white hover:bg-slate-800 text-[10px] sm:text-sm py-1 sm:py-1.5 px-2 sm:px-3"
                        >
                            {(isFormOpen || selectedPO) ? 'Cancel' : '+ New PO'}
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
                        Suppliers ({(Array.isArray(registeredSuppliers) ? registeredSuppliers.length : 0)})
                    </button>
                </div>
            </div>

            {/* PO Form: Create new or View/Edit opened PO (same form) */}
            {(isFormOpen || selectedPO) && (
                <div className="flex-shrink-0 p-2 sm:p-4 bg-blue-50/50 border-b border-blue-200 overflow-auto max-h-[60vh]">
                    <Card className="p-3 sm:p-4 border border-blue-200">
                        <div className="flex items-center justify-between mb-2 sm:mb-3 flex-wrap gap-2">
                            <h2 className="text-xs sm:text-sm font-semibold text-slate-900">
                                {selectedPO ? `PO: ${poNumber}` : 'Create New Purchase Order'}
                            </h2>
                            <div className="flex items-center gap-2">
                                {selectedPO && (
                                    <span className={`px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded-full ${getStatusColor(selectedPO.status)}`}>{selectedPO.status}</span>
                                )}
                                {poNumber && !selectedPO && (
                                    <>
                                        <span className="text-[10px] sm:text-xs text-slate-500">PO #:</span>
                                        <span className="text-xs sm:text-sm font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{poNumber}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        {selectedPO && poReadOnly && (
                            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-xs sm:text-sm mb-3">
                                This PO is locked by the supplier. You can view it in read-only mode.
                            </div>
                        )}
                        {poDetailLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
                            </div>
                        ) : (
                        <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-3">
                            <ComboBox
                                label="Supplier *"
                                items={(Array.isArray(registeredSuppliers) ? registeredSuppliers : []).map(s => ({ id: s.supplierTenantId || s.id, name: s.companyName || s.company_name || s.name }))}
                                selectedId={supplierTenantId}
                                onSelect={(selected) => setSupplierTenantId(selected?.id || '')}
                                placeholder={!registeredSuppliers || registeredSuppliers.length === 0 ? "No suppliers" : "Select supplier"}
                                required
                                disabled={!!selectedPO || !registeredSuppliers || registeredSuppliers.length === 0}
                            />
                            <ComboBox
                                label="Project *"
                                items={(Array.isArray(projects) ? projects : []).map(p => ({ id: p.id, name: p.name }))}
                                selectedId={projectId}
                                onSelect={(selected) => setProjectId(selected?.id || '')}
                                placeholder="Select project"
                                required
                                disabled={poReadOnly}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-3">
                            <Input
                                label="Description (Optional)"
                                value={poDescription}
                                onChange={(e) => setPoDescription(e.target.value)}
                                placeholder="Enter description"
                                disabled={poReadOnly}
                            />
                            <Input
                                label="Target Delivery Date *"
                                type="date"
                                value={targetDeliveryDate}
                                onChange={(e) => setTargetDeliveryDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                required
                                disabled={poReadOnly}
                            />
                        </div>

                        {/* Line Items */}
                        <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs font-semibold text-slate-900">Items</h3>
                                {!poReadOnly && <Button variant="secondary" onClick={addItem} className="text-xs py-1 px-2">+ Add Item</Button>}
                            </div>

                            {items.length === 0 ? (
                                <div className="text-center py-4 text-slate-500 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                                    No items added yet
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-48 overflow-auto">
                                    {(Array.isArray(items) ? items : []).map((item, index) => (
                                        <div key={item.id} className="bg-white p-2 sm:p-3 rounded-lg border border-slate-200">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] sm:text-xs font-semibold text-slate-700">Item {index + 1}</span>
                                                {!poReadOnly && <button type="button" onClick={() => removeItem(item.id)} className="text-rose-500 hover:text-rose-700 text-[10px] sm:text-xs">Remove</button>}
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                                <div className="col-span-2">
                                                    <Input label="Description *" value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} placeholder="Description" required disabled={poReadOnly} />
                                                </div>
                                                <ComboBox label="Category *" items={expenseCategories} selectedId={item.categoryId || ''} onSelect={(selected) => updateItem(item.id, 'categoryId', selected?.id || '')} placeholder="Category" required disabled={poReadOnly} />
                                                <Input label="Qty *" type="number" value={item.quantity.toString()} onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} required min="0" step="0.01" disabled={poReadOnly} />
                                                <Input label="Price *" type="number" value={item.unitPrice.toString()} onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)} required min="0" step="0.01" disabled={poReadOnly} />
                                            </div>
                                            <div className="mt-1 text-right text-[10px] sm:text-xs text-slate-600">
                                                Subtotal: <span className="font-semibold">{CURRENCY} {(item.total || 0).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {items.length > 0 && (
                                <div className="mt-2 p-2 bg-indigo-50 rounded-lg border border-indigo-200 flex justify-between items-center">
                                    <span className="text-xs sm:text-sm font-semibold text-indigo-900">Total:</span>
                                    <span className="text-sm sm:text-lg font-bold text-indigo-900">{CURRENCY} {(totalAmount || 0).toFixed(2)}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                            {selectedPO ? (
                                <>
                                    <Button variant="secondary" onClick={() => poPrintData && triggerPrint('PO', poPrintData)} className="text-xs flex items-center gap-1" title="Print PO">
                                        {ICONS.print && <span className="w-3.5 h-3.5 inline-block [&>svg]:w-full [&>svg]:h-full">{ICONS.print}</span>}
                                        Print
                                    </Button>
                                    <Button variant="secondary" onClick={closePODetail} className="text-xs">Close</Button>
                                    {canSubmitRevision && <Button onClick={submitRevision} disabled={submittingRevision} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">{submittingRevision ? 'Saving…' : 'Save revision'}</Button>}
                                </>
                            ) : (
                                <>
                                    <Button variant="secondary" onClick={handleCancelPO} className="text-xs">Cancel</Button>
                                    <Button onClick={handleSubmitPO} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">Create PO</Button>
                                </>
                            )}
                        </div>
                        </>
                        )}
                    </Card>
                </div>
            )}

            {/* Main Split Content Area */}
            <div className="flex-1 flex overflow-hidden p-2 sm:p-3 gap-2 sm:gap-3">
                {/* Left Panel - POs, Invoices, Registration Requests */}
                <div className={`flex-1 flex flex-col gap-2 sm:gap-3 overflow-hidden min-w-0 ${activePanel !== 'left' ? 'hidden md:flex' : 'flex'}`}>
                    {/* Summary Cards - Compact */}
                    <Card className="flex-shrink-0 p-2 sm:p-3">
                        <div className="grid grid-cols-3 gap-1 sm:gap-2">
                            <div className="text-center p-1.5 sm:p-2 bg-yellow-50 rounded-lg">
                                <div className="text-base sm:text-lg font-bold text-yellow-700">{registrationRequests.length}</div>
                                <div className="text-[8px] sm:text-[10px] text-yellow-600 uppercase">Requests</div>
                            </div>
                            <div className="text-center p-1.5 sm:p-2 bg-blue-50 rounded-lg">
                                <div className="text-base sm:text-lg font-bold text-blue-700">{outstandingPOs.length}</div>
                                <div className="text-[8px] sm:text-[10px] text-blue-600 uppercase">POs</div>
                            </div>
                            <div className="text-center p-1.5 sm:p-2 bg-orange-50 rounded-lg">
                                <div className="text-base sm:text-lg font-bold text-orange-700">{invoicesAwaitingApproval.length}</div>
                                <div className="text-[8px] sm:text-[10px] text-orange-600 uppercase">Invoices</div>
                            </div>
                        </div>
                    </Card>

                    {/* Registration Requests */}
                    {Array.isArray(registrationRequests) && registrationRequests.length > 0 && (
                        <Card className="flex-shrink-0 overflow-hidden" data-section="registration-requests">
                            <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-200 bg-yellow-50">
                                <h2 className="text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-2">
                                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Pending Registration Requests ({registrationRequests.length})
                                </h2>
                            </div>
                            <div className="max-h-64 overflow-auto divide-y divide-slate-100">
                                {registrationRequests.map(request => (
                                    <div key={request.id} data-registration-request-id={request.id} className="px-2 sm:px-3 py-2 hover:bg-slate-50">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                {/* Supplier Company and Name from registration */}
                                                <p className="text-xs font-semibold text-slate-900 truncate">
                                                    {request.regSupplierCompany || request.supplierCompanyName || request.regSupplierName || request.supplierName || 'N/A'}
                                                </p>
                                                {request.regSupplierName && (
                                                    <p className="text-[10px] text-slate-600 truncate">Contact: {request.regSupplierName}</p>
                                                )}
                                                {request.regSupplierContactNo && (
                                                    <p className="text-[10px] text-slate-500 truncate">Tel: {request.regSupplierContactNo}</p>
                                                )}
                                                {request.regSupplierAddress && (
                                                    <p className="text-[10px] text-slate-500 truncate">Address: {request.regSupplierAddress}</p>
                                                )}
                                                {request.regSupplierDescription && (
                                                    <p className="text-[10px] text-slate-400 truncate mt-0.5 italic">{request.regSupplierDescription}</p>
                                                )}
                                                {request.supplierMessage && (
                                                    <p className="text-[10px] text-blue-500 truncate mt-0.5">Message: {request.supplierMessage}</p>
                                                )}
                                                <p className="text-[9px] text-slate-400 mt-1">
                                                    Requested: {new Date(request.requestedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <div className="flex gap-1 flex-shrink-0">
                                                <Button
                                                    variant="primary"
                                                    onClick={() => {
                                                        const comments = prompt('Add comments (optional):');
                                                        handleApproveRegistration(request.id, comments || undefined);
                                                    }}
                                                    className="text-[9px] sm:text-[10px] bg-green-600 hover:bg-green-700 text-white py-0.5 sm:py-1 px-1.5 sm:px-2"
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => {
                                                        const comments = prompt('Rejection reason (optional):');
                                                        handleRejectRegistration(request.id, comments || undefined);
                                                    }}
                                                    className="text-[9px] sm:text-[10px] py-0.5 sm:py-1 px-1.5 sm:px-2"
                                                >
                                                    Reject
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Outstanding POs */}
                    <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
                        <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-200 flex-shrink-0">
                            <h2 className="text-xs sm:text-sm font-semibold text-slate-900">Outstanding Purchase Orders</h2>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {/* Mobile Card View */}
                            <div className="sm:hidden divide-y divide-slate-200">
                                {!Array.isArray(outstandingPOs) || outstandingPOs.length === 0 ? (
                                    <div className="px-3 py-6 text-center text-slate-500 text-xs">No outstanding POs</div>
                                ) : (
                                    outstandingPOs.map(po => (
                                        <div key={po.id} className="p-3 hover:bg-slate-50 cursor-pointer" onClick={() => openPODetail(po)}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium text-slate-900 truncate">{po.poNumber || 'N/A'}</p>
                                                    <p className="text-[10px] text-slate-500 truncate">
                                                        {po.supplierCompanyName || po.supplierName || po.supplierTenantId}
                                                    </p>
                                                    {po.createdAt && <p className="text-[10px] text-slate-400">Created: {formatDate(po.createdAt)}</p>}
                                                </div>
                                                <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full flex-shrink-0 ${getStatusColor(po.status)}`}>{po.status}</span>
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-xs font-medium text-slate-900">{CURRENCY} {(po.totalAmount || 0).toFixed(2)}</span>
                                                {po.targetDeliveryDate && <span className="text-[10px] text-orange-600">Due: {new Date(po.targetDeliveryDate).toLocaleDateString()}</span>}
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
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Supplier</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Created</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-right text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Amount</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Status</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {!Array.isArray(outstandingPOs) || outstandingPOs.length === 0 ? (
                                        <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500 text-xs">No outstanding POs</td></tr>
                                    ) : (
                                        outstandingPOs.map(po => (
                                            <tr key={po.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openPODetail(po)}>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-900 font-medium">{po.poNumber || 'N/A'}</td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-600 truncate max-w-[100px]">
                                                    {po.supplierCompanyName || po.supplierName || po.supplierTenantId}
                                                </td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-500">
                                                    {po.createdAt ? formatDate(po.createdAt) : '-'}
                                                </td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-right font-medium text-slate-900">{CURRENCY} {(po.totalAmount || 0).toFixed(2)}</td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                                    <span className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium rounded-full ${getStatusColor(po.status)}`}>{po.status}</span>
                                                </td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                                    <Button variant="secondary" onClick={(e) => { e.stopPropagation(); openPODetail(po); }} className="text-[9px] sm:text-[10px] py-0.5 sm:py-1 px-1.5 sm:px-2">View</Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Invoices Awaiting Approval */}
                    <Card className="flex-1 overflow-hidden flex flex-col min-h-0" data-section="invoices-awaiting">
                        <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-200 flex-shrink-0">
                            <h2 className="text-xs sm:text-sm font-semibold text-slate-900">Invoices Awaiting Approval</h2>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {/* Mobile Card View */}
                            <div className="sm:hidden divide-y divide-slate-200">
                                {!Array.isArray(invoicesAwaitingApproval) || invoicesAwaitingApproval.length === 0 ? (
                                    <div className="px-3 py-6 text-center text-slate-500 text-xs">No invoices awaiting</div>
                                ) : (
                                    invoicesAwaitingApproval.map(invoice => (
                                        <div key={invoice.id} data-awaiting-invoice-id={invoice.id} className="p-3 hover:bg-slate-50">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium text-slate-900 truncate">{invoice.invoiceNumber}</p>
                                                    <p className="text-[10px] text-slate-500">PO: {invoice.poNumber || invoice.poId}</p>
                                                </div>
                                                <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full flex-shrink-0 ${getStatusColor(invoice.status)}`}>{invoice.status}</span>
                                            </div>
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-xs font-medium text-slate-900">{CURRENCY} {(invoice.amount || 0).toFixed(2)}</span>
                                                <div className="flex gap-1">
                                                    <Button variant="primary" onClick={() => handleApproveInvoice(invoice.id)} className="text-[9px] bg-green-600 hover:bg-green-700 text-white py-1 px-2">Approve</Button>
                                                    <Button variant="secondary" onClick={() => {}} className="text-[9px] py-1 px-2">Reject</Button>
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
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Invoice #</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">PO #</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-right text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Amount</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Status</th>
                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {!Array.isArray(invoicesAwaitingApproval) || invoicesAwaitingApproval.length === 0 ? (
                                        <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500 text-xs">No invoices awaiting</td></tr>
                                    ) : (
                                        invoicesAwaitingApproval.map(invoice => (
                                            <tr key={invoice.id} data-awaiting-invoice-id={invoice.id} className="hover:bg-slate-50">
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-900 font-medium">{invoice.invoiceNumber}</td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-slate-600">{invoice.poNumber || invoice.poId}</td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-right font-medium text-slate-900">{CURRENCY} {(invoice.amount || 0).toFixed(2)}</td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                                    <span className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium rounded-full ${getStatusColor(invoice.status)}`}>{invoice.status}</span>
                                                </td>
                                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                                    <div className="flex gap-1">
                                                        <Button variant="primary" onClick={() => handleApproveInvoice(invoice.id)} className="text-[9px] sm:text-[10px] bg-green-600 hover:bg-green-700 py-0.5 sm:py-1 px-1.5 sm:px-2">Approve</Button>
                                                        <Button variant="secondary" onClick={() => {}} className="text-[9px] sm:text-[10px] py-0.5 sm:py-1 px-1.5 sm:px-2">Reject</Button>
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

                {/* Right Panel - Registered Suppliers */}
                <div className={`w-full md:w-72 lg:w-80 flex-shrink-0 flex flex-col gap-2 sm:gap-3 overflow-hidden ${activePanel !== 'right' ? 'hidden md:flex' : 'flex'}`}>
                    {/* Registered Suppliers */}
                    <Card className="flex-1 overflow-hidden flex flex-col">
                        <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-indigo-50 to-purple-50">
                            <h2 className="text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-1 sm:gap-2">
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                Registered Suppliers
                            </h2>
                            <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">{Array.isArray(registeredSuppliers) ? registeredSuppliers.length : 0} active</p>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {!Array.isArray(registeredSuppliers) || registeredSuppliers.length === 0 ? (
                                <div className="px-3 py-6 sm:py-8 text-center">
                                    <svg className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    <p className="text-[10px] sm:text-xs text-slate-500">No registered suppliers yet</p>
                                    <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">Approve registration requests to add suppliers</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {registeredSuppliers.map(supplier => (
                                        <div
                                            key={supplier.id}
                                            onClick={() => setSelectedRegisteredSupplier(supplier)}
                                            className="px-2 sm:px-3 py-2 sm:py-2.5 hover:bg-slate-50 transition-all cursor-pointer"
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[10px] sm:text-xs font-bold flex-shrink-0">
                                                    {(supplier.companyName || supplier.company_name || supplier.name || 'S').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] sm:text-xs font-medium text-slate-900 truncate">
                                                        {supplier.companyName || supplier.company_name || supplier.name || 'Supplier'}
                                                    </p>
                                                    {supplier.email && <p className="text-[9px] sm:text-[10px] text-slate-500 truncate">{supplier.email}</p>}
                                                    <div className="flex items-center gap-1 mt-0.5 sm:mt-1">
                                                        <span className="px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[9px] font-medium rounded-full bg-green-100 text-green-700">
                                                            Active
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

                    {/* Quick Stats */}
                    <Card className="flex-shrink-0 p-2 sm:p-3">
                        <h3 className="text-[10px] sm:text-xs font-semibold text-slate-700 mb-2">Quick Stats</h3>
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500">Total Suppliers</span>
                                <span className="text-xs font-semibold text-slate-900">{Array.isArray(registeredSuppliers) ? registeredSuppliers.length : 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500">Pending Requests</span>
                                <span className="text-xs font-semibold text-yellow-600">{registrationRequests.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500">Active POs</span>
                                <span className="text-xs font-semibold text-blue-600">{outstandingPOs.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500">Pending Invoices</span>
                                <span className="text-xs font-semibold text-orange-600">{invoicesAwaitingApproval.length}</span>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Registered Supplier Detail Modal - open on click, Unregister */}
            {selectedRegisteredSupplier && (
                <Modal
                    isOpen={!!selectedRegisteredSupplier}
                    onClose={() => setSelectedRegisteredSupplier(null)}
                    title="Registered Supplier"
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Company</p>
                                <p className="font-semibold text-slate-900 text-sm">{selectedRegisteredSupplier.companyName || selectedRegisteredSupplier.company_name || selectedRegisteredSupplier.name || 'Supplier'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Contact name</p>
                                <p className="text-sm text-slate-900">{selectedRegisteredSupplier.name || '-'}</p>
                            </div>
                            {selectedRegisteredSupplier.email && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Email</p>
                                    <p className="text-sm text-slate-900">{selectedRegisteredSupplier.email}</p>
                                </div>
                            )}
                            {(selectedRegisteredSupplier.contactNo || selectedRegisteredSupplier.phone) && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Phone</p>
                                    <p className="text-sm text-slate-900">{selectedRegisteredSupplier.contactNo || selectedRegisteredSupplier.phone || '-'}</p>
                                </div>
                            )}
                            {selectedRegisteredSupplier.address && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Address</p>
                                    <p className="text-sm text-slate-900">{selectedRegisteredSupplier.address}</p>
                                </div>
                            )}
                            {selectedRegisteredSupplier.registeredAt && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Registered</p>
                                    <p className="text-sm text-slate-900">{formatDate(selectedRegisteredSupplier.registeredAt)}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between pt-3 border-t border-slate-200">
                            <Button variant="secondary" onClick={() => setSelectedRegisteredSupplier(null)}>Close</Button>
                            <Button
                                variant="primary"
                                className="bg-amber-600 hover:bg-amber-700"
                                onClick={() => {
                                    if (window.confirm('Unregister this supplier? They will be removed from your registered suppliers list.')) {
                                        handleUnregisterSupplier(selectedRegisteredSupplier.supplierTenantId || selectedRegisteredSupplier.id);
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

export default BuyerDashboard;

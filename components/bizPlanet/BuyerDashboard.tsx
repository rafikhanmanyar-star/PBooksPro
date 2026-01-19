import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { ICONS, CURRENCY } from '../../constants';
import { getWebSocketClient } from '../../services/websocketClient';
import { formatDate } from '../../utils/dateUtils';

interface Supplier {
    id: string;
    name: string;
    company_name?: string;
    email?: string;
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

    useEffect(() => {
        loadData();
        loadRegistrationRequests();
        loadRegisteredSuppliers();
    }, []);

    // WebSocket listener for new registration requests and invoice updates
    useEffect(() => {
        const wsClient = getWebSocketClient();
        
        const handleDataUpdate = (data: any) => {
            if (data.type === 'SUPPLIER_REGISTRATION_REQUEST') {
                // Reload registration requests when new request arrives
                loadRegistrationRequests();
                showToast('New supplier registration request received', 'info');
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
                        {/* Notification Icon */}
                        {(registrationRequests.length > 0 || invoicesAwaitingApproval.length > 0) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setActivePanel('left');
                                    setTimeout(() => {
                                        const regElement = document.querySelector('[data-section="registration-requests"]');
                                        const invElement = document.querySelector('[data-section="invoices-awaiting"]');
                                        if (regElement && registrationRequests.length > 0) {
                                            regElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        } else if (invElement && invoicesAwaitingApproval.length > 0) {
                                            invElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }
                                    }, 100);
                                }}
                                className="p-1.5 sm:p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors relative min-w-[36px] sm:min-w-[40px] min-h-[36px] sm:min-h-[40px] flex items-center justify-center"
                                title={`${registrationRequests.length} pending requests, ${invoicesAwaitingApproval.length} invoices awaiting`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                                </svg>
                                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] sm:min-w-[18px] h-[16px] sm:h-[18px] px-1 bg-red-500 text-white text-[9px] sm:text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                                    {(registrationRequests.length + invoicesAwaitingApproval.length) > 99 ? '99+' : (registrationRequests.length + invoicesAwaitingApproval.length)}
                                </span>
                            </button>
                        )}
                        <Button 
                            onClick={() => setIsFormOpen(!isFormOpen)} 
                            className="bg-slate-900 text-white hover:bg-slate-800 text-[10px] sm:text-sm py-1 sm:py-1.5 px-2 sm:px-3"
                        >
                            {isFormOpen ? 'Cancel' : '+ New PO'}
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

            {/* PO Creation Form (Collapsible) */}
            {isFormOpen && (
                <div className="flex-shrink-0 p-2 sm:p-4 bg-blue-50/50 border-b border-blue-200 overflow-auto max-h-[60vh]">
                    <Card className="p-3 sm:p-4 border border-blue-200">
                        <div className="flex items-center justify-between mb-2 sm:mb-3">
                            <h2 className="text-xs sm:text-sm font-semibold text-slate-900">Create New Purchase Order</h2>
                            {poNumber && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] sm:text-xs text-slate-500">PO #:</span>
                                    <span className="text-xs sm:text-sm font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{poNumber}</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-3">
                            <ComboBox
                                label="Supplier *"
                                items={(Array.isArray(registeredSuppliers) ? registeredSuppliers : []).map(s => ({ id: s.id, name: s.company_name || s.name }))}
                                selectedId={supplierTenantId}
                                onSelect={(selected) => setSupplierTenantId(selected?.id || '')}
                                placeholder={!registeredSuppliers || registeredSuppliers.length === 0 ? "No suppliers" : "Select supplier"}
                                required
                                disabled={!registeredSuppliers || registeredSuppliers.length === 0}
                            />
                            <ComboBox
                                label="Project *"
                                items={(Array.isArray(projects) ? projects : []).map(p => ({ id: p.id, name: p.name }))}
                                selectedId={projectId}
                                onSelect={(selected) => setProjectId(selected?.id || '')}
                                placeholder="Select project"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-3">
                            <Input
                                label="Description (Optional)"
                                value={poDescription}
                                onChange={(e) => setPoDescription(e.target.value)}
                                placeholder="Enter description"
                            />
                            <Input
                                label="Target Delivery Date *"
                                type="date"
                                value={targetDeliveryDate}
                                onChange={(e) => setTargetDeliveryDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                required
                            />
                        </div>

                        {/* Line Items */}
                        <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs font-semibold text-slate-900">Items</h3>
                                <Button variant="secondary" onClick={addItem} className="text-xs py-1 px-2">+ Add Item</Button>
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
                                                <button type="button" onClick={() => removeItem(item.id)} className="text-rose-500 hover:text-rose-700 text-[10px] sm:text-xs">Remove</button>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                                <div className="col-span-2">
                                                    <Input label="Description *" value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} placeholder="Description" required />
                                                </div>
                                                <ComboBox label="Category *" items={expenseCategories} selectedId={item.categoryId || ''} onSelect={(selected) => updateItem(item.id, 'categoryId', selected?.id || '')} placeholder="Category" required />
                                                <Input label="Qty *" type="number" value={item.quantity.toString()} onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} required min="0" step="0.01" />
                                                <Input label="Price *" type="number" value={item.unitPrice.toString()} onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)} required min="0" step="0.01" />
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
                            <Button variant="secondary" onClick={handleCancelPO} className="text-xs">Cancel</Button>
                            <Button onClick={handleSubmitPO} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">Create PO</Button>
                        </div>
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
                                    <div key={request.id} className="px-2 sm:px-3 py-2 hover:bg-slate-50">
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
                                        <div key={po.id} className="p-3 hover:bg-slate-50" onClick={() => setSelectedPO(po)}>
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
                                            <tr key={po.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedPO(po)}>
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
                                                    <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setSelectedPO(po); }} className="text-[9px] sm:text-[10px] py-0.5 sm:py-1 px-1.5 sm:px-2">View</Button>
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
                                        <div key={invoice.id} className="p-3 hover:bg-slate-50">
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
                                            <tr key={invoice.id} className="hover:bg-slate-50">
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
                                        <div key={supplier.id} className="px-2 sm:px-3 py-2 sm:py-2.5 hover:bg-slate-50 transition-all cursor-pointer">
                                            <div className="flex items-start gap-2">
                                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[10px] sm:text-xs font-bold flex-shrink-0">
                                                    {(supplier.company_name || supplier.name || 'S').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] sm:text-xs font-medium text-slate-900 truncate">
                                                        {supplier.company_name || supplier.name || 'Supplier'}
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

            {/* Purchase Order Detail Modal */}
            {selectedPO && (
                <Modal
                    isOpen={!!selectedPO}
                    onClose={() => setSelectedPO(null)}
                    title={`PO: ${selectedPO.poNumber}`}
                    size="lg"
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-xs text-slate-500 mb-1">PO Number</p>
                                <p className="font-semibold text-slate-900 text-sm">{selectedPO.poNumber}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Status</p>
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedPO.status)}`}>{selectedPO.status}</span>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Supplier</p>
                                <p className="font-semibold text-slate-900 text-sm">
                                    {selectedPO.supplierCompanyName || selectedPO.supplierName || selectedPO.supplierTenantId}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Total Amount</p>
                                <p className="font-semibold text-slate-900 text-sm">{CURRENCY} {(selectedPO.totalAmount || 0).toFixed(2)}</p>
                            </div>
                            {selectedPO.targetDeliveryDate && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Target Delivery</p>
                                    <p className="font-semibold text-orange-600 text-sm">{formatDate(selectedPO.targetDeliveryDate)}</p>
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

                        <div className="flex justify-end pt-3 border-t border-slate-200">
                            <Button variant="secondary" onClick={() => setSelectedPO(null)}>Close</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default BuyerDashboard;
